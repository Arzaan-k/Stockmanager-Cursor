import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";
import CartItem from "@/components/CartItem";
import { api } from "@/lib/api";
import { ShoppingCart, CreditCard, User, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

const checkoutSchema = z.object({
  customerName: z.string().min(1, "Client name is required"),
  customerEmail: z.string().email("Valid email is required"),
  customerPhone: z.string().min(1, "Phone number is required"),
  customerAddress: z.string().optional(),
  jobOrder: z.string().optional(),
  containerNumber: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export default function Cart() {
  const [, setLocation] = useLocation();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { items, clearCart, getSubtotal, getTax, getTotal } = useCart();
  const { toast } = useToast();

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerAddress: "",
      jobOrder: "",
      containerNumber: "",
      location: "",
      notes: "",
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) => api.createOrder(orderData).then(res => res.json()),
    onSuccess: (order) => {
      toast({
        title: "Order created successfully!",
        description: `Order #${order.orderNumber} has been placed.`,
      });
      clearCart();
      setLocation("/orders");
    },
    onError: () => {
      toast({
        title: "Failed to create order",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCheckout = async (data: CheckoutFormData) => {
    if (items.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Add some items to your cart before checking out.",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingOut(true);

    try {
      const subtotal = getSubtotal();
      const tax = getTax();
      const total = getTotal();

      const orderData = {
        order: {
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          jobOrder: data.jobOrder,
          containerNumber: data.containerNumber,
          location: data.location,
          subtotal: subtotal.toString(),
          tax: tax.toString(),
          total: total.toString(),
          notes: data.notes,
        },
        items: items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.price.toString(),
          totalPrice: (item.price * item.quantity).toString(),
        })),
      };

      await createOrderMutation.mutateAsync(orderData);
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">
              Start shopping to add items to your cart.
            </p>
            <Button onClick={() => setLocation("/catalog")} data-testid="button-start-shopping">
              Start Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Shopping Cart ({items.length} items)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <CartItem key={item.id} item={item} />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Checkout Section */}
        <div className="space-y-6">
          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(getSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (10%)</span>
                  <span>{formatCurrency(getTax())}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span className="font-medium">Total</span>
                  <span className="font-bold">{formatCurrency(getTotal())}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Client & Order Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(handleCheckout)} className="space-y-4">
                <div>
                  <Label htmlFor="customerName">Client Name *</Label>
                  <Input
                    id="customerName"
                    {...form.register("customerName")}
                    placeholder="Enter client name"
                    data-testid="input-customer-name"
                  />
                  {form.formState.errors.customerName && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.customerName.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="customerEmail">Email Address *</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    {...form.register("customerEmail")}
                    placeholder="Enter client email"
                    data-testid="input-customer-email"
                  />
                  {form.formState.errors.customerEmail && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.customerEmail.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="customerPhone">Phone Number *</Label>
                  <Input
                    id="customerPhone"
                    {...form.register("customerPhone")}
                    placeholder="Enter client phone number"
                    data-testid="input-customer-phone"
                  />
                  {form.formState.errors.customerPhone && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.customerPhone.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="customerAddress">Address</Label>
                  <Textarea
                    id="customerAddress"
                    {...form.register("customerAddress")}
                    placeholder="Enter your address (optional)"
                    rows={3}
                    data-testid="textarea-customer-address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="jobOrder">Job Order</Label>
                    <Input
                      id="jobOrder"
                      {...form.register("jobOrder")}
                      placeholder="e.g. JO-2025-001"
                      data-testid="input-job-order"
                    />
                  </div>
                  <div>
                    <Label htmlFor="containerNumber">Container Number</Label>
                    <Input
                      id="containerNumber"
                      {...form.register("containerNumber")}
                      placeholder="e.g. CNT-12345"
                      data-testid="input-container-number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      {...form.register("location")}
                      placeholder="e.g. Karachi Port"
                      data-testid="input-location"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Order Notes</Label>
                  <Textarea
                    id="notes"
                    {...form.register("notes")}
                    placeholder="Any special instructions (optional)"
                    rows={3}
                    data-testid="textarea-order-notes"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isCheckingOut || createOrderMutation.isPending}
                  data-testid="button-place-order"
                >
                  {isCheckingOut || createOrderMutation.isPending ? (
                    "Processing..."
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Place Order - {formatCurrency(getTotal())}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
