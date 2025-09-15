import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Filter, Upload, Download, Building2, MapPin, Phone, Edit, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Vendor {
  id: string;
  name: string;
  mainCategory: string;
  subcategory: string;
  productType: string;
  productCode: string;
  otherProducts?: string;
  contactNumber: string;
  email?: string;
  location: string;
  address?: string;
  city: string;
  state: string;
  zone?: string;
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VendorStats {
  totalVendors: number;
  activeVendors: number;
  vendorsByCategory: { category: string; count: number }[];
  vendorsByCity: { city: string; count: number }[];
}

export default function Vendors() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch vendors
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', searchTerm, categoryFilter, statusFilter, cityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (cityFilter) params.append('city', cityFilter);
      
      const response = await fetch(`/api/vendors?${params}`);
      if (!response.ok) throw new Error('Failed to fetch vendors');
      return response.json();
    },
  });

  // Fetch vendor stats
  const { data: stats } = useQuery<VendorStats>({
    queryKey: ['vendor-stats'],
    queryFn: async () => {
      const response = await fetch('/api/vendors/stats');
      if (!response.ok) throw new Error('Failed to fetch vendor stats');
      return response.json();
    },
  });

  // Create vendor mutation
  const createVendor = useMutation({
    mutationFn: async (vendor: Partial<Vendor>) => {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor),
      });
      if (!response.ok) throw new Error('Failed to create vendor');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-stats'] });
      toast({ title: "Success", description: "Vendor created successfully" });
      setIsCreateDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create vendor", variant: "destructive" });
    },
  });

  // Update vendor mutation
  const updateVendor = useMutation({
    mutationFn: async ({ id, ...vendor }: Partial<Vendor> & { id: string }) => {
      const response = await fetch(`/api/vendors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor),
      });
      if (!response.ok) throw new Error('Failed to update vendor');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-stats'] });
      toast({ title: "Success", description: "Vendor updated successfully" });
      setEditingVendor(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update vendor", variant: "destructive" });
    },
  });

  // Delete vendor mutation
  const deleteVendor = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/vendors/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete vendor');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-stats'] });
      toast({ title: "Success", description: "Vendor deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete vendor", variant: "destructive" });
    },
  });

  // Import vendors from Excel
  const importVendors = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/vendors/import-excel-file', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to import vendors');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-stats'] });
      toast({ 
        title: "Import Complete", 
        description: `Successfully imported ${data.imported} vendors` 
      });
    },
    onError: () => {
      toast({ 
        title: "Import Failed", 
        description: "Failed to import vendors from Excel", 
        variant: "destructive" 
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      inactive: "secondary",
      pending: "outline",
      suspended: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const VendorCard = ({ vendor }: { vendor: Vendor }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{vendor.name}</CardTitle>
            <CardDescription>{vendor.subcategory}</CardDescription>
          </div>
          {getStatusBadge(vendor.status)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>{vendor.productType}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{vendor.city}, {vendor.state}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>{vendor.contactNumber}</span>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/vendors/${vendor.id}`}>
              <Eye className="h-4 w-4 mr-1" />
              View
            </Link>
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => setEditingVendor(vendor)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => {
              if (confirm('Are you sure you want to delete this vendor?')) {
                deleteVendor.mutate(vendor.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Vendors</h1>
          <p className="text-muted-foreground">Manage your suppliers and vendors</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => importVendors.mutate()}
            disabled={importVendors.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalVendors}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeVendors}</div>
            </CardContent>
          </Card>
          {stats.vendorsByCategory.map(cat => (
            <Card key={cat.category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{cat.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{cat.count}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="operation_services">Operation/Services</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendors Display */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} />
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Product Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell>{vendor.subcategory}</TableCell>
                  <TableCell>{vendor.productType}</TableCell>
                  <TableCell>{vendor.city}, {vendor.state}</TableCell>
                  <TableCell>{vendor.contactNumber}</TableCell>
                  <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/vendors/${vendor.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => setEditingVendor(vendor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Are you sure?')) {
                            deleteVendor.mutate(vendor.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingVendor} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingVendor(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Create New Vendor'}</DialogTitle>
            <DialogDescription>
              {editingVendor ? 'Update vendor information' : 'Add a new vendor to your system'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const vendor = Object.fromEntries(formData.entries());
            
            if (editingVendor) {
              updateVendor.mutate({ id: editingVendor.id, ...vendor });
            } else {
              createVendor.mutate(vendor);
            }
          }}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Vendor Name</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    defaultValue={editingVendor?.name}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="productCode">Product Code</Label>
                  <Input 
                    id="productCode" 
                    name="productCode" 
                    defaultValue={editingVendor?.productCode}
                    required 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mainCategory">Main Category</Label>
                  <Select name="mainCategory" defaultValue={editingVendor?.mainCategory || 'admin'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="operation_services">Operation/Services</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subcategory">Subcategory</Label>
                  <Input 
                    id="subcategory" 
                    name="subcategory" 
                    defaultValue={editingVendor?.subcategory}
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="productType">Product Type</Label>
                  <Input 
                    id="productType" 
                    name="productType" 
                    defaultValue={editingVendor?.productType}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={editingVendor?.status || 'pending'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="otherProducts">Other Products/Services</Label>
                <Textarea 
                  id="otherProducts" 
                  name="otherProducts" 
                  defaultValue={editingVendor?.otherProducts}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contactNumber">Contact Number</Label>
                  <Input 
                    id="contactNumber" 
                    name="contactNumber" 
                    defaultValue={editingVendor?.contactNumber}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email"
                    defaultValue={editingVendor?.email}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="location">Location</Label>
                <Input 
                  id="location" 
                  name="location" 
                  defaultValue={editingVendor?.location}
                  required 
                />
              </div>

              <div>
                <Label htmlFor="address">Full Address</Label>
                <Textarea 
                  id="address" 
                  name="address" 
                  defaultValue={editingVendor?.address}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input 
                    id="city" 
                    name="city" 
                    defaultValue={editingVendor?.city}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input 
                    id="state" 
                    name="state" 
                    defaultValue={editingVendor?.state}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="zone">Zone</Label>
                  <Input 
                    id="zone" 
                    name="zone" 
                    defaultValue={editingVendor?.zone}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes" 
                  name="notes" 
                  defaultValue={editingVendor?.notes}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">
                {editingVendor ? 'Update' : 'Create'} Vendor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
