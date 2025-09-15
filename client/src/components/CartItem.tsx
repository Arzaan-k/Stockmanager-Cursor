import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useCart } from "@/hooks/useCart";
import { Minus, Plus, Trash2, Package } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface CartItemProps {
  item: {
    id: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    imageUrl?: string;
  };
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity < 1) return;
    
    setIsUpdating(true);
    try {
      updateQuantity(item.id, newQuantity);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = () => {
    removeItem(item.id);
  };

  return (
    <Card data-testid={`card-cart-item-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center space-x-4">
          {/* Product Image */}
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground" data-testid={`text-cart-item-name-${item.id}`}>
              {item.name}
            </h3>
            <p className="text-sm text-muted-foreground" data-testid={`text-cart-item-sku-${item.id}`}>
              SKU: {item.sku}
            </p>
            <p className="text-lg font-semibold text-foreground mt-1" data-testid={`text-cart-item-price-${item.id}`}>
              {formatCurrency(item.price)}
            </p>
          </div>

          {/* Quantity Controls */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center border border-border rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleQuantityChange(item.quantity - 1)}
                disabled={isUpdating || item.quantity <= 1}
                className="h-8 w-8 p-0"
                data-testid={`button-decrease-quantity-${item.id}`}
              >
                <Minus className="w-4 h-4" />
              </Button>
              
              <Input
                type="number"
                value={item.quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                className="h-8 w-16 text-center border-0 bg-transparent text-sm"
                min={1}
                disabled={isUpdating}
                data-testid={`input-quantity-${item.id}`}
              />
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleQuantityChange(item.quantity + 1)}
                disabled={isUpdating}
                className="h-8 w-8 p-0"
                data-testid={`button-increase-quantity-${item.id}`}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
              data-testid={`button-remove-item-${item.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Subtotal */}
        <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="font-semibold text-foreground" data-testid={`text-cart-item-subtotal-${item.id}`}>
            {formatCurrency(item.price * item.quantity)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
