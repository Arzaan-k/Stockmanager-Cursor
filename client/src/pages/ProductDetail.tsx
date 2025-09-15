import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, ArrowLeft, Warehouse, History, Users, Phone, MapPin, Image as ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ProductImageUpload } from "@/components/product-image-upload";

export default function ProductDetail() {
  const [match, params] = useRoute("/products/:id");
  const productId = params?.id as string | undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/products", productId, "usage"],
    queryFn: () => api.getProductUsage(productId!).then(res => res.json()),
    enabled: !!productId,
  });

  // Fetch vendor information for this product
  const { data: vendorData } = useQuery({
    queryKey: ["/api/products", productId, "vendors"],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/vendors`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!productId,
  });

  const stockStatus = useMemo(() => {
    const avail = data?.product?.stockAvailable ?? 0;
    if (avail <= 0) return { label: "Out of Stock", variant: "destructive" as const };
    if (avail <= (data?.product?.minStockLevel ?? 10)) return { label: "Low Stock", variant: "secondary" as const };
    return { label: "In Stock", variant: "default" as const };
  }, [data]);

  if (!match) return null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2"><CardContent className="p-6 space-y-3">
            <div className="h-6 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-64 w-full bg-muted rounded animate-pulse" />
          </CardContent></Card>
          <Card><CardContent className="p-6 space-y-3">
            <div className="h-6 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
          </CardContent></Card>
        </div>
      </div>
    );
  }

  if (error) {
    const message = (error as Error)?.message || "Unknown error";
    const isNotFound = message.startsWith("404:");
    return (
      <div className="space-y-3">
        <div className="text-destructive">
          {isNotFound ? "Product not found." : "Failed to load product."}
          <div className="text-xs text-muted-foreground mt-1 break-all">{message}</div>
        </div>
        <Link href="/catalog">
          <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Catalog
          </a>
        </Link>
      </div>
    );
  }

  const product = data?.product;
  const warehouseStock = data?.warehouseStock ?? [];
  const movements = data?.movements ?? [];
  const orders = data?.orders ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/catalog"><a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4 mr-1"/>Back to Catalog</a></Link>
          <h2 className="text-2xl font-bold text-foreground">Product Details</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product Overview */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                <div className="aspect-square overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                  {product?.imageUrl ? (
                    <img src={product.imageUrl} alt={product?.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-12 h-12 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{product?.name}</h3>
                    <p className="text-sm text-muted-foreground">SKU: {product?.sku} • {product?.type}</p>
                  </div>
                  <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
                </div>
                {product?.description && (
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Price</div>
                    <div className="font-medium">{formatCurrency(parseFloat(product?.price || "0"))}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Available</div>
                    <div className="font-medium">{product?.stockAvailable}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Used</div>
                    <div className="font-medium">{product?.stockUsed}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-medium">{product?.stockTotal}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Min Level</div>
                    <div className="font-medium">{product?.minStockLevel}</div>
                  </div>
                  {product?.units && (
                    <div>
                      <div className="text-muted-foreground">Units</div>
                      <div className="font-medium">{product?.units}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Business fields quick view */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {product?.groupName && (
                <div><span className="text-muted-foreground">Group: </span><span className="font-medium">{product.groupName}</span></div>
              )}
              {product?.crystalPartCode && (
                <div><span className="text-muted-foreground">Crystal Part Code: </span><span className="font-medium">{product.crystalPartCode}</span></div>
              )}
              {product?.mfgPartCode && (
                <div><span className="text-muted-foreground">MFG Part Code: </span><span className="font-medium">{product.mfgPartCode}</span></div>
              )}
              {product?.importance && (
                <div><span className="text-muted-foreground">Importance: </span><span className="font-medium">{product.importance}</span></div>
              )}
              {product?.leadTimeDays != null && (
                <div><span className="text-muted-foreground">Lead Time (days): </span><span className="font-medium">{product.leadTimeDays}</span></div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Product Images Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Product Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productId && (
              <ProductImageUpload 
                productId={productId} 
                productName={product?.name || ''} 
              />
            )}
          </CardContent>
        </Card>

        {/* Right: Vendor and Warehouse Info */}
        <div className="space-y-6">
          {/* Vendor Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4"/>Vendors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!vendorData || vendorData.length === 0 ? (
                <div className="text-sm text-muted-foreground">No vendors assigned.</div>
              ) : (
                <div className="space-y-3">
                  {vendorData.slice(0, 3).map((item: any) => (
                    <div key={item.vendorProduct?.id || item.vendor?.id} className="border rounded p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Link href={`/vendors/${item.vendor?.id}`}>
                            <a className="font-medium text-sm hover:underline">
                              {item.vendor?.name}
                            </a>
                          </Link>
                          {item.vendor?.city && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <MapPin className="w-3 h-3" />
                              {item.vendor?.city}, {item.vendor?.state}
                            </div>
                          )}
                          {item.vendor?.contactNumber && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Phone className="w-3 h-3" />
                              {item.vendor?.contactNumber}
                            </div>
                          )}
                        </div>
                        {item.vendorProduct?.isPreferred && (
                          <Badge variant="secondary" className="text-xs">Preferred</Badge>
                        )}
                      </div>
                      {item.vendorProduct && (
                        <div className="mt-2 pt-2 border-t text-xs space-y-1">
                          {item.vendorProduct.price && (
                            <div><span className="text-muted-foreground">Price:</span> ₹{item.vendorProduct.price}</div>
                          )}
                          {item.vendorProduct.leadTimeDays && (
                            <div><span className="text-muted-foreground">Lead Time:</span> {item.vendorProduct.leadTimeDays} days</div>
                          )}
                          {item.vendorProduct.minimumOrderQuantity && (
                            <div><span className="text-muted-foreground">MOQ:</span> {item.vendorProduct.minimumOrderQuantity}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {vendorData.length > 3 && (
                    <div className="text-xs text-center text-muted-foreground">
                      +{vendorData.length - 3} more vendors
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warehouse Stock */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Warehouse className="w-4 h-4"/>Warehouse Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            {warehouseStock.length === 0 ? (
              <div className="text-sm text-muted-foreground">No warehouse stock records.</div>
            ) : (
              <div className="space-y-3">
                {warehouseStock.map((ws: any) => (
                  <div key={ws.warehouseStock.id} className="flex items-center justify-between border rounded p-3">
                    <div>
                      <div className="font-medium">{ws.warehouse?.name ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{ws.warehouse?.location}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{ws.warehouseStock.quantity}</div>
                      {(ws.warehouseStock.aisle || ws.warehouseStock.rack || ws.warehouseStock.boxNumber) && (
                        <div className="text-xs text-muted-foreground">Aisle {ws.warehouseStock.aisle || "-"}, Rack {ws.warehouseStock.rack || "-"}, Box {ws.warehouseStock.boxNumber || "-"}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Usage History: Movements and Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><History className="w-4 h-4"/>Stock Movements</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <div className="text-sm text-muted-foreground">No stock movements.</div>
            ) : (
              <div className="space-y-3">
                {movements.map((m: any) => (
                  <div key={m.movement.id} className="flex items-center justify-between border rounded p-3">
                    <div>
                      <div className="font-medium capitalize">{m.movement.action} {Math.abs(m.movement.quantity)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(m.movement.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div>Prev: {m.movement.previousStock ?? '-'}</div>
                      <div>New: {m.movement.newStock ?? '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">Orders Containing This Product</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="text-sm text-muted-foreground">No orders include this product.</div>
            ) : (
              <div className="space-y-3">
                {orders.map((o: any) => (
                  <Link key={`${o.orderItem.id}`} href={`/orders/${o.order?.id || o.orderItem.orderId}`}>
                    <a className="flex items-center justify-between border rounded p-3 hover:bg-muted/40">
                      <div>
                        <div className="font-medium">#{o.order?.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">{o.customer?.name || o.order?.customerName} • {new Date(o.order?.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div>Qty: {o.orderItem.quantity}</div>
                        <div>Unit: {formatCurrency(parseFloat(o.orderItem.unitPrice))}</div>
                      </div>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
