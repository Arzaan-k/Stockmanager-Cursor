import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import {
  TrendingUp,
  Package,
  MessageCircle,
  Download,
  Calendar,
  BarChart3,
  PieChart,
  Activity,
  Users,
} from "lucide-react";

export default function Analytics() {
  const { data: dashboardStats } = useQuery({
    queryKey: ["/api/analytics/dashboard"],
    queryFn: () => api.getDashboardStats().then(res => res.json()),
  });

  const { data: stockMovements } = useQuery({
    queryKey: ["/api/stock-movements"],
    queryFn: () => api.getStockMovements().then(res => res.json()),
  });

  // Mock analytics data - in production this would come from API
  const analyticsData = {
    monthlyRevenue: 127450,
    revenueGrowth: 18,
    turnoverRate: 2.4,
    turnoverGrowth: 0.3,
    topMovingCount: 47,
    whatsappUpdates: 156,
    averageOrderValue: 89.50,
    orderFulfillmentRate: 98.2,
    warehouseUtilization: 85.3,
    customerSatisfaction: 4.8,
  };

  // Mock top products data
  const topProducts = [
    {
      id: "1",
      name: "Engine Oil Filter - Type A",
      sku: "ENG-OIL-001",
      unitsMoved: 247,
      revenue: 6173,
      trend: 12,
    },
    {
      id: "2", 
      name: "Brake Pads - Honda Civic",
      sku: "BRK-HND-002",
      unitsMoved: 189,
      revenue: 16991,
      trend: 8,
    },
    {
      id: "3",
      name: "Air Filter - Universal",
      sku: "AIR-UNI-003",
      unitsMoved: 156,
      revenue: 2417,
      trend: -3,
    },
    {
      id: "4",
      name: "Spark Plugs Set - Toyota",
      sku: "SPK-TOY-004",
      unitsMoved: 134,
      revenue: 4686,
      trend: 15,
    },
    {
      id: "5",
      name: "Transmission Oil - 5W30",
      sku: "TRN-OIL-005",
      unitsMoved: 98,
      revenue: 3920,
      trend: -5,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Analytics & Reports</h2>
          <p className="text-muted-foreground mt-1">Insights into your inventory performance and trends</p>
        </div>
        <div className="flex items-center space-x-3">
          <Select defaultValue="30">
            <SelectTrigger className="w-32" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" data-testid="button-export-report">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card data-testid="card-monthly-revenue">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-monthly-revenue">
                  {formatCurrency(analyticsData.monthlyRevenue)}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-primary mt-2 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" />
              +{analyticsData.revenueGrowth}% from last month
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-inventory-turnover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inventory Turnover</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-turnover-rate">
                  {analyticsData.turnoverRate}x
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-2 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" />
              +{analyticsData.turnoverGrowth}x from last month
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-top-moving-items">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Top Moving Items</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-top-moving-count">
                  {analyticsData.topMovingCount}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-purple-600 mt-2">Engine parts leading</p>
          </CardContent>
        </Card>

        <Card data-testid="card-whatsapp-updates">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">WhatsApp Updates</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-whatsapp-updates">
                  {analyticsData.whatsappUpdates}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5" />
              <span>Stock Movement Trends</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted/20 rounded-lg flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Chart visualization would be implemented here</p>
                <p className="text-xs">Using Chart.js or Recharts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PieChart className="w-5 h-5" />
              <span>Warehouse Distribution</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted/20 rounded-lg flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Pie chart visualization would be implemented here</p>
                <p className="text-xs">Showing stock distribution across warehouses</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card data-testid="card-avg-order-value">
          <CardContent className="p-6">
            <div className="text-center">
              <Activity className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Average Order Value</p>
              <p className="text-xl font-bold text-foreground" data-testid="text-avg-order-value">
                {formatCurrency(analyticsData.averageOrderValue)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-fulfillment-rate">
          <CardContent className="p-6">
            <div className="text-center">
              <Package className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Order Fulfillment Rate</p>
              <p className="text-xl font-bold text-foreground" data-testid="text-fulfillment-rate">
                {analyticsData.orderFulfillmentRate}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-warehouse-utilization">
          <CardContent className="p-6">
            <div className="text-center">
              <Activity className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Warehouse Utilization</p>
              <p className="text-xl font-bold text-foreground" data-testid="text-warehouse-utilization">
                {analyticsData.warehouseUtilization}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Moving Products</CardTitle>
          <p className="text-sm text-muted-foreground">Most frequently used items this month</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Rank</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Product</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Units Moved</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Revenue</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topProducts.map((product, index) => (
                  <tr key={product.id} data-testid={`row-top-product-${product.id}`}>
                    <td className="p-4 text-sm font-medium text-foreground" data-testid={`text-rank-${product.id}`}>
                      {index + 1}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground" data-testid={`text-product-name-${product.id}`}>
                            {product.name}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-product-sku-${product.id}`}>
                            {product.sku}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-foreground" data-testid={`text-units-moved-${product.id}`}>
                      {product.unitsMoved}
                    </td>
                    <td className="p-4 text-sm font-medium text-foreground" data-testid={`text-product-revenue-${product.id}`}>
                      {formatCurrency(product.revenue)}
                    </td>
                    <td className="p-4">
                      <div className={`flex items-center text-xs ${
                        product.trend > 0 ? "text-primary" : product.trend < 0 ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        <TrendingUp className={`w-3 h-3 mr-1 ${product.trend < 0 ? "rotate-180" : ""}`} />
                        <span data-testid={`text-trend-${product.id}`}>
                          {product.trend > 0 ? "+" : ""}{product.trend}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Stock Movement Summary */}
      {stockMovements && stockMovements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stockMovements.slice(0, 5).map((movement: any) => (
                <div key={movement.movement.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      movement.movement.action === "add" ? "bg-primary/10" :
                      movement.movement.action === "use" ? "bg-destructive/10" :
                      "bg-blue-100"
                    }`}>
                      <Package className={`w-4 h-4 ${
                        movement.movement.action === "add" ? "text-primary" :
                        movement.movement.action === "use" ? "text-destructive" :
                        "text-blue-600"
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">
                        {movement.product?.name || "Unknown Product"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {movement.movement.action} • {movement.warehouse?.name || "Unknown Warehouse"} • 
                        {new Date(movement.movement.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {movement.movement.action === "add" ? "+" : movement.movement.action === "use" ? "-" : "~"}
                    {Math.abs(movement.movement.quantity)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
