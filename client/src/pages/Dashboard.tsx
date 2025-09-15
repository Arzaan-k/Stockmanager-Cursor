import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Package,
  FileText,
  AlertTriangle,
  Building2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Plus,
  Upload,
} from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentMovements, isLoading: movementsLoading } = useQuery({
    queryKey: ["/api/dashboard/recent-movements"],
  });

  const { data: lowStockProducts, isLoading: lowStockLoading } = useQuery({
    queryKey: ["/api/dashboard/low-stock"],
  });

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const getMovementIcon = (action: string) => {
    switch (action) {
      case "add":
        return <Plus className="w-5 h-5 text-primary" />;
      case "use":
        return <TrendingDown className="w-5 h-5 text-destructive" />;
      case "transfer":
        return <ArrowUpDown className="w-5 h-5 text-blue-600" />;
      default:
        return <Package className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const formatMovementText = (movement: any) => {
    const product = movement.product?.name || "Unknown Product";
    const warehouse = movement.warehouse?.name || "Unknown Warehouse";
    const timeAgo = new Date(movement.movement.createdAt).toLocaleString();

    switch (movement.movement.action) {
      case "add":
        return `Added ${Math.abs(movement.movement.quantity)} units • ${warehouse} • ${timeAgo}`;
      case "use":
        return `Used ${Math.abs(movement.movement.quantity)} units • ${warehouse} • ${timeAgo}`;
      case "transfer":
        return `Transferred ${Math.abs(movement.movement.quantity)} units • ${timeAgo}`;
      default:
        return `${movement.movement.action} • ${warehouse} • ${timeAgo}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card data-testid="card-total-products">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Products</p>
                <p className="text-3xl font-bold text-foreground" data-testid="text-total-products">
                  {(stats as any)?.totalProducts || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Active inventory items</p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-orders">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Orders</p>
                <p className="text-3xl font-bold text-foreground" data-testid="text-active-orders">
                  {(stats as any)?.pendingOrders || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Pending fulfillment</p>
          </CardContent>
        </Card>

        <Card data-testid="card-low-stock">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Low Stock Items</p>
                <p className="text-3xl font-bold text-destructive" data-testid="text-low-stock-count">
                  {(stats as any)?.lowStockCount || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Needs attention</p>
          </CardContent>
        </Card>

        <Card data-testid="card-warehouses">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Warehouses</p>
                <p className="text-3xl font-bold text-foreground" data-testid="text-warehouse-count">
                  {(stats as any)?.warehouseCount || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Active locations</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Recent Stock Movements
                <Link href="/analytics">
                  <Button variant="ghost" size="sm" data-testid="button-view-all-movements">
                    View All
                  </Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {movementsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                      <Skeleton className="h-6 w-12" />
                    </div>
                  ))}
                </div>
              ) : (recentMovements as any)?.length > 0 ? (
                <div className="space-y-4">
                  {(recentMovements as any).slice(0, 5).map((movement: any) => (
                    <div
                      key={movement.movement.id}
                      className="flex items-center space-x-4 p-3 rounded-lg bg-muted/50"
                      data-testid={`item-stock-movement-${movement.movement.id}`}
                    >
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        {getMovementIcon(movement.movement.action)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground" data-testid={`text-movement-product-${movement.movement.id}`}>
                          {movement.product?.name || "Unknown Product"}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-movement-details-${movement.movement.id}`}>
                          {formatMovementText(movement)}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          movement.movement.action === "add"
                            ? "text-primary"
                            : movement.movement.action === "use"
                            ? "text-destructive"
                            : "text-blue-600"
                        }`}
                        data-testid={`text-movement-quantity-${movement.movement.id}`}
                      >
                        {movement.movement.action === "add" ? "+" : movement.movement.action === "use" ? "-" : "~"}
                        {Math.abs(movement.movement.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No recent stock movements</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/products">
                <Button variant="outline" className="w-full justify-start" data-testid="button-quick-add-product">
                  <Plus className="w-4 h-4 mr-3" />
                  Add Product
                </Button>
              </Link>
              
              <Link href="/catalog">
                <Button variant="outline" className="w-full justify-start" data-testid="button-quick-create-order">
                  <FileText className="w-4 h-4 mr-3" />
                  Create Order
                </Button>
              </Link>

              <Link href="/whatsapp">
                <Button variant="outline" className="w-full justify-start" data-testid="button-quick-whatsapp">
                  <TrendingUp className="w-4 h-4 mr-3" />
                  WhatsApp Updates
                </Button>
              </Link>

              <Button variant="outline" className="w-full justify-start" data-testid="button-quick-import">
                <Upload className="w-4 h-4 mr-3" />
                Import CSV
              </Button>
            </CardContent>
          </Card>

          {/* Low Stock Alert */}
          {!lowStockLoading && (lowStockProducts as any)?.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-destructive">
                  Low Stock Alerts
                  <Badge variant="destructive" data-testid="badge-low-stock-count">
                    {(lowStockProducts as any).length} items
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {(lowStockProducts as any).slice(0, 5).map((product: any) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                      data-testid={`item-low-stock-${product.id}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground" data-testid={`text-low-stock-name-${product.id}`}>
                          {product.name}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-low-stock-sku-${product.id}`}>
                          SKU: {product.sku}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-destructive" data-testid={`text-low-stock-quantity-${product.id}`}>
                          {product.stockAvailable} left
                        </p>
                        <p className="text-xs text-muted-foreground">Min: {product.minStockLevel}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {(lowStockProducts as any).length > 5 && (
                  <Link href="/products">
                    <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="button-view-all-low-stock">
                      View All Low Stock Items
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
