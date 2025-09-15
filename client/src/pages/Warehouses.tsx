import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import {
  Building2,
  Plus,
  MapPin,
  Package,
  IndianRupee,
  Eye,
  Edit,
  Users,
  Trash2,
  AlertTriangle,
} from "lucide-react";

const warehouseSchema = z.object({
  name: z.string().min(1, "Warehouse name is required"),
  location: z.string().min(1, "Location is required"),
  address: z.string().optional(),
  gpsCoordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
});

type WarehouseFormData = z.infer<typeof warehouseSchema>;

export default function Warehouses() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const { toast } = useToast();

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["/api/warehouses"],
    queryFn: () => api.getWarehouses().then(res => res.json()),
  });

  const createWarehouseMutation = useMutation({
    mutationFn: (data: WarehouseFormData) => api.createWarehouse(data).then(res => res.json()),
    onSuccess: () => {
      toast({ title: "Warehouse created successfully" });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    },
    onError: () => {
      toast({ title: "Failed to create warehouse", variant: "destructive" });
    },
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/warehouses/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response;
    },
    onSuccess: () => {
      toast({ title: "Warehouse deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete warehouse", 
        description: error.message || "Cannot delete warehouse with existing inventory",
        variant: "destructive" 
      });
    },
  });

  const form = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: "",
      location: "",
      address: "",
    },
  });

  const onSubmit = (data: WarehouseFormData) => {
    createWarehouseMutation.mutate(data);
  };

  // Mock warehouse layout data - in production this would come from API
  const getWarehouseLayout = (warehouseId: string) => {
    return [
      { id: "A1", itemCount: 24, status: "high" },
      { id: "A2", itemCount: 18, status: "medium" },
      { id: "B1", itemCount: 31, status: "high" },
      { id: "B2", itemCount: 15, status: "medium" },
      { id: "C1", itemCount: 22, status: "medium" },
      { id: "C2", itemCount: 28, status: "high" },
      { id: "D1", itemCount: 8, status: "low" },
      { id: "D2", itemCount: 12, status: "low" },
    ];
  };

  const getAisleColor = (status: string) => {
    switch (status) {
      case "high":
        return "bg-primary text-primary-foreground";
      case "medium":
        return "bg-secondary text-secondary-foreground";
      case "low":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-background border border-border";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Warehouses</h2>
          <p className="text-muted-foreground mt-1">Manage warehouse locations and stock distribution</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-warehouse">
              <Plus className="w-4 h-4 mr-2" />
              Add Warehouse
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Warehouse</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Warehouse Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Warehouse North" {...field} data-testid="input-warehouse-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Seattle, WA" {...field} data-testid="input-warehouse-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 1245 Industrial Way" {...field} data-testid="input-warehouse-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel-warehouse"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createWarehouseMutation.isPending}
                    data-testid="button-save-warehouse"
                  >
                    {createWarehouseMutation.isPending ? "Creating..." : "Create Warehouse"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Warehouse Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses?.map((warehouse: any) => (
          <Card key={warehouse.id} data-testid={`card-warehouse-${warehouse.id}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground" data-testid={`text-warehouse-name-${warehouse.id}`}>
                  {warehouse.name}
                </h3>
                <Badge variant="default">Active</Badge>
              </div>
              
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground flex items-center" data-testid={`text-warehouse-location-${warehouse.id}`}>
                  <MapPin className="w-4 h-4 mr-1" />
                  {warehouse.location}
                </p>
                {warehouse.address && (
                  <p className="text-muted-foreground" data-testid={`text-warehouse-address-${warehouse.id}`}>
                    {warehouse.address}
                  </p>
                )}
                
                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <Package className="w-4 h-4 mr-1" />
                      Products
                    </span>
                    <span className="font-medium text-foreground">-</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <IndianRupee className="w-4 h-4 mr-1" />
                      Stock Value
                    </span>
                    <span className="font-medium text-foreground">-</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex-1 justify-center"
                      onClick={() => setSelectedWarehouse(warehouse)}
                      data-testid={`button-view-warehouse-${warehouse.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>{warehouse.name} - Layout & Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      {/* Warehouse Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-medium text-foreground mb-3">Warehouse Information</h4>
                          <div className="space-y-2 text-sm">
                            <p><strong>Name:</strong> {warehouse.name}</p>
                            <p><strong>Location:</strong> {warehouse.location}</p>
                            {warehouse.address && <p><strong>Address:</strong> {warehouse.address}</p>}
                            <p><strong>Status:</strong> <Badge variant="default">Active</Badge></p>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-medium text-foreground mb-3">Quick Stats</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>Total Aisles:</span>
                              <span className="font-medium">8</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Active Products:</span>
                              <span className="font-medium">-</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Storage Capacity:</span>
                              <span className="font-medium">85%</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Warehouse Layout */}
                      <div>
                        <h4 className="font-medium text-foreground mb-3">Warehouse Layout</h4>
                        <div className="grid grid-cols-4 gap-3 bg-muted/20 p-6 rounded-lg">
                          {getWarehouseLayout(warehouse.id).map((aisle) => (
                            <div
                              key={aisle.id}
                              className={`p-3 rounded-lg text-center ${getAisleColor(aisle.status)}`}
                              data-testid={`aisle-${aisle.id}-${warehouse.id}`}
                            >
                              <div className="font-medium text-sm">{aisle.id}</div>
                              <div className="text-xs mt-1">{aisle.itemCount} items</div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Legend */}
                        <div className="mt-4 flex items-center justify-center space-x-6 text-xs">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-primary rounded"></div>
                            <span className="text-muted-foreground">High Stock (20+)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-secondary rounded"></div>
                            <span className="text-muted-foreground">Medium Stock (10-19)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-muted rounded border"></div>
                            <span className="text-muted-foreground">Low Stock (1-9)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  className="flex-1 justify-center text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${warehouse.name}?\n\nThis action cannot be undone and will fail if there is inventory in this warehouse.`)) {
                      deleteWarehouseMutation.mutate(warehouse.id);
                    }
                  }}
                  data-testid={`button-delete-warehouse-${warehouse.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {warehouses?.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No warehouses found</h3>
            <p className="text-muted-foreground mb-4">
              Get started by adding your first warehouse location.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-first-warehouse">
              <Plus className="w-4 h-4 mr-2" />
              Add Warehouse
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
