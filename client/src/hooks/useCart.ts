import { useState, useEffect, createContext, useContext, ReactNode, useMemo, createElement } from "react";

interface CartItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

type CartContextType = {
  items: CartItem[];
  addItem: (product: any, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getSubtotal: () => number;
  getTax: (taxRate?: number) => number;
  getTotal: (taxRate?: number) => number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(items));
    } catch {}
  }, [items]);

  const addItem: CartContextType["addItem"] = (product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: parseFloat(product.price || "0"),
          quantity,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const removeItem: CartContextType["removeItem"] = (productId) => {
    setItems((prev) => prev.filter((i) => i.id !== productId));
  };

  const updateQuantity: CartContextType["updateQuantity"] = (productId, quantity) => {
    if (quantity <= 0) return removeItem(productId);
    setItems((prev) => prev.map((i) => (i.id === productId ? { ...i, quantity } : i)));
  };

  const clearCart: CartContextType["clearCart"] = () => setItems([]);

  const getSubtotal = () => items.reduce((total, i) => total + i.price * i.quantity, 0);
  const getTax = (taxRate: number = 0.08) => getSubtotal() * taxRate;
  const getTotal = (taxRate: number = 0.08) => getSubtotal() + getTax(taxRate);
  const getTotalItems = () => items.reduce((total, i) => total + i.quantity, 0);

  const value = useMemo<CartContextType>(
    () => ({ items, addItem, removeItem, updateQuantity, clearCart, getTotalItems, getSubtotal, getTax, getTotal }),
    [items]
  );

  return createElement(CartContext.Provider, { value }, children as any);
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
