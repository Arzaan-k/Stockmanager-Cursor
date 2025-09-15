import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import {
  FileText,
  Eye,
  Edit,
  Package,
  User,
  Calendar,
  MapPin,
  Clock,
  Archive,
} from "lucide-react";

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [customerInput, setCustomerInput] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minTotal, setMinTotal] = useState<string>("");
  const [maxTotal, setMaxTotal] = useState<string>("");
  const [sortBy, setSortBy] = useState<"createdAt" | "total" | "status" | "approvalStatus" | "customer">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [, setLocation] = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const { toast } = useToast();
  const activeAdvancedFilters = [approvalFilter, dateFrom, dateTo, minTotal, maxTotal].filter(Boolean).length;

  const { data: orders, isLoading } = useQuery({
    queryKey: [
      "/api/orders",
      { status: statusFilter, approvalStatus: approvalFilter, customer: customerFilter, dateFrom, dateTo, minTotal, maxTotal, sortBy, sortDir }
    ],
    queryFn: () => api.getOrders({
      status: statusFilter || undefined,
      approvalStatus: approvalFilter || undefined,
      customer: customerFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      minTotal: minTotal !== "" ? Number(minTotal) : undefined,
      maxTotal: maxTotal !== "" ? Number(maxTotal) : undefined,
      sortBy,
      sortDir,
    }).then(res => res.json()),
  });

  // debounce customer search input -> customerFilter
  useEffect(() => {
    const t = setTimeout(() => setCustomerFilter(customerInput.trim()), 350);
    return () => clearTimeout(t);
  }, [customerInput]);

  const { data: orderDetails } = useQuery({
    queryKey: ["/api/orders", selectedOrder?.order.id],
    queryFn: () => api.getOrder(selectedOrder.order.id).then(res => res.json()),
    enabled: !!selectedOrder?.order.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateOrderStatus(id, status).then(res => res.json()),
    onSuccess: () => {
      toast({ title: "Order status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedOrder(null);
    },
    onError: () => {
      toast({ title: "Failed to update order status", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "secondary";
      case "shipped":
        return "default";
      case "delivered":
        return "default";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    updateStatusMutation.mutate({ id: orderId, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                  <div className="w-12 h-12 bg-muted rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-48 animate-pulse" />
                  </div>
                  <div className="w-20 h-6 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Orders</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Track and manage customer orders</p>
            </div>
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-2">
                <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-36 h-8" data-testid="select-status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="needs_approval">Needs approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search customer"
                  value={customerInput}
                  onChange={(e) => setCustomerInput(e.target.value)}
                  className="w-52 h-8"
                  data-testid="input-customer-filter"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8 px-3" data-testid="button-open-filters">
                      Filters{activeAdvancedFilters ? ` (${activeAdvancedFilters})` : ""}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[440px]" align="start">
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Approval</div>
                          <Select value={approvalFilter || 'all'} onValueChange={(v) => setApprovalFilter(v === 'all' ? '' : v)}>
                            <SelectTrigger className="h-8" data-testid="select-approval-filter">
                              <SelectValue placeholder="All Approval" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Approval</SelectItem>
                              <SelectItem value="needs_approval">Needs approval</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Min total</div>
                          <Input type="number" placeholder="0" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} className="h-8" data-testid="input-min-total" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">From date</div>
                          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8" data-testid="input-date-from" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Max total</div>
                          <Input type="number" placeholder="" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} className="h-8" data-testid="input-max-total" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">To date</div>
                          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8" data-testid="input-date-to" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Button
                          variant="ghost"
                          className="h-8"
                          onClick={() => {
                            setApprovalFilter("");
                            setDateFrom("");
                            setDateTo("");
                            setMinTotal("");
                            setMaxTotal("");
                          }}
                          data-testid="button-clear-advanced-filters"
                        >
                          Clear filters
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                  <SelectTrigger className="w-36 h-8" data-testid="select-sort-by">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Date</SelectItem>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="approvalStatus">Approval</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(v: any) => setSortDir(v)}>
                  <SelectTrigger className="w-24 h-8" data-testid="select-sort-dir">
                    <SelectValue placeholder="Dir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Desc</SelectItem>
                    <SelectItem value="asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {orders?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Order #</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Customer</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Items</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Approval</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((orderData: any) => {
                    const order = orderData.order;
                    const customer = orderData.customer;
                    
                    return (
                      <tr key={order.id} className="hover:bg-muted/50" data-testid={`row-order-${order.id}`}>
                        <td className="p-3 font-medium text-foreground" data-testid={`text-order-number-${order.id}`}>
                          <Link href={`/orders/${order.id}`}>
                            <a className="hover:underline">#{order.orderNumber}</a>
                          </Link>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-foreground" data-testid={`text-customer-name-${order.id}`}>
                              {order.customerName}
                            </p>
                            <p className="text-sm text-muted-foreground" data-testid={`text-customer-email-${order.id}`}>
                              {order.customerEmail}
                            </p>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-foreground" data-testid={`text-item-count-${order.id}`}>
                          {orderData.itemCount} items
                        </td>
                        <td className="p-3 font-medium text-foreground" data-testid={`text-order-total-${order.id}`}>
                          {formatCurrency(parseFloat(order.total))}
                        </td>
                        <td className="p-3">
                          <Badge variant={getStatusColor(order.status)} data-testid={`badge-order-status-${order.id}`}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={(order.approvalStatus === "needs_approval" ? "secondary" : order.approvalStatus === "approved" ? "default" : "secondary") as any}
                            data-testid={`badge-approval-status-${order.id}`}
                          >
                            {(order.approvalStatus || "n/a").replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-order-date-${order.id}`}>
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedOrder(orderData)}
                                  data-testid={`button-view-order-${order.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Order Details - #{order.orderNumber}</DialogTitle>
                                </DialogHeader>
                                {orderDetails && (
                                  <div className="space-y-6">
                                    {/* Order Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <h4 className="font-medium text-foreground flex items-center">
                                          <User className="w-4 h-4 mr-2" />
                                          Customer Information
                                        </h4>
                                        <div className="text-sm space-y-1">
                                          <p data-testid={`detail-customer-name-${order.id}`}>
                                            <strong>Name:</strong> {orderDetails.customerName}
                                          </p>
                                          <p data-testid={`detail-customer-email-${order.id}`}>
                                            <strong>Email:</strong> {orderDetails.customerEmail}
                                          </p>
                                          <p data-testid={`detail-customer-phone-${order.id}`}>
                                            <strong>Phone:</strong> {orderDetails.customerPhone}
                                          </p>
                                        </div>
                                      </div>
                                      
                                      <div className="space-y-2">
                                        <h4 className="font-medium text-foreground flex items-center">
                                          <FileText className="w-4 h-4 mr-2" />
                                          Order Information
                                        </h4>
                                        <div className="text-sm space-y-1">
                                          <p data-testid={`detail-order-status-${order.id}`}>
                                            <strong>Status:</strong> 
                                            <Badge variant={getStatusColor(orderDetails.status)} className="ml-2">
                                              {orderDetails.status.charAt(0).toUpperCase() + orderDetails.status.slice(1)}
                                            </Badge>
                                          </p>
                                          <p data-testid={`detail-order-date-${order.id}`}>
                                            <strong>Date:</strong> {new Date(orderDetails.createdAt).toLocaleString()}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <Separator />

                                    {/* Order Items */}
                                    <div>
                                      <h4 className="font-medium text-foreground mb-3 flex items-center">
                                        <Package className="w-4 h-4 mr-2" />
                                        Order Items
                                      </h4>
                                      <div className="space-y-3">
                                        {orderDetails.items?.map((item: any) => (
                                          <div key={item.orderItem.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                                            <div>
                                              <p className="font-medium text-foreground" data-testid={`detail-item-name-${item.orderItem.id}`}>
                                                {item.product.name}
                                              </p>
                                              <p className="text-sm text-muted-foreground">
                                                SKU: {item.product.sku}
                                              </p>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-sm text-muted-foreground">
                                                {item.orderItem.quantity} × {formatCurrency(parseFloat(item.orderItem.unitPrice))}
                                              </p>
                                              <p className="font-medium text-foreground" data-testid={`detail-item-total-${item.orderItem.id}`}>
                                                {formatCurrency(parseFloat(item.orderItem.totalPrice))}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <Separator />

                                    {/* Order Total */}
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Subtotal:</span>
                                        <span className="text-foreground" data-testid={`detail-subtotal-${order.id}`}>
                                          {formatCurrency(parseFloat(orderDetails.subtotal))}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Tax:</span>
                                        <span className="text-foreground" data-testid={`detail-tax-${order.id}`}>
                                          {formatCurrency(parseFloat(orderDetails.tax))}
                                        </span>
                                      </div>
                                      <div className="flex justify-between font-semibold border-t border-border pt-2">
                                        <span className="text-foreground">Total:</span>
                                        <span className="text-foreground" data-testid={`detail-total-${order.id}`}>
                                          {formatCurrency(parseFloat(orderDetails.total))}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Status Update */}
                                    <div className="flex items-center space-x-3">
                                      <Select
                                        value={orderDetails.status}
                                        onValueChange={(newStatus) => handleStatusUpdate(orderDetails.id, newStatus)}
                                        disabled={updateStatusMutation.isPending}
                                      >
                                        <SelectTrigger className="w-48" data-testid={`select-status-update-${order.id}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="pending">Pending</SelectItem>
                                          <SelectItem value="shipped">Shipped</SelectItem>
                                          <SelectItem value="delivered">Delivered</SelectItem>
                                          <SelectItem value="cancelled">Cancelled</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {updateStatusMutation.isPending && (
                                        <span className="text-sm text-muted-foreground">Updating...</span>
                                      )}
                                    </div>

                                    {orderDetails.notes && (
                                      <>
                                        <Separator />
                                        <div>
                                          <h4 className="font-medium text-foreground mb-2">Notes</h4>
                                          <p className="text-sm text-muted-foreground" data-testid={`detail-notes-${order.id}`}>
                                            {orderDetails.notes}
                                          </p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLocation(`/orders/${order.id}`)}
                              data-testid={`button-open-order-page-${order.id}`}
                              title="Open order details page"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No orders found</h3>
              <p className="text-muted-foreground">
                {statusFilter || approvalFilter || customerFilter || dateFrom || dateTo || minTotal || maxTotal
                  ? "Try adjusting or clearing filters"
                  : "No orders have been placed yet"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
