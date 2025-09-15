import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit, Trash2, Plus, Phone, Mail, MapPin, Building2, Package, Users, DollarSign, Calendar, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

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

interface VendorProduct {
  id: string;
  vendorId: string;
  productId: string;
  supplierCode?: string;
  price?: string;
  leadTimeDays?: string;
  minimumOrderQuantity?: string;
  isPreferred: boolean;
  product?: {
    id: string;
    name: string;
    sku: string;
    category: string;
    price: number;
    stockQuantity: number;
  };
}

interface VendorContact {
  id: string;
  vendorId: string;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stockQuantity: number;
}

export default function VendorDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productDetails, setProductDetails] = useState({
    supplierCode: "",
    price: "",
    leadTimeDays: "",
    minimumOrderQuantity: "",
    isPreferred: false
  });

  // Fetch vendor details
  const { data: vendor, isLoading: vendorLoading } = useQuery<Vendor>({
    queryKey: ['vendor', id],
    queryFn: async () => {
      const response = await fetch(`/api/vendors/${id}`);
      if (!response.ok) throw new Error('Failed to fetch vendor');
      return response.json();
    },
  });

  // Fetch vendor products
  const { data: vendorProducts = [] } = useQuery<VendorProduct[]>({
    queryKey: ['vendor-products', id],
    queryFn: async () => {
      const response = await fetch(`/api/vendors/${id}/products`);
      if (!response.ok) throw new Error('Failed to fetch vendor products');
      return response.json();
    },
  });

  // Fetch vendor contacts
  const { data: vendorContacts = [] } = useQuery<VendorContact[]>({
    queryKey: ['vendor-contacts', id],
    queryFn: async () => {
      const response = await fetch(`/api/vendors/${id}/contacts`);
      if (!response.ok) throw new Error('Failed to fetch vendor contacts');
      return response.json();
    },
  });

  // Fetch all products for dropdown
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
  });

  // Add product to vendor
  const addProduct = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/vendors/${id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          ...productDetails
        }),
      });
      if (!response.ok) throw new Error('Failed to add product');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', id] });
      toast({ title: "Success", description: "Product added to vendor" });
      setIsAddProductOpen(false);
      setSelectedProductId("");
      setProductDetails({
        supplierCode: "",
        price: "",
        leadTimeDays: "",
        minimumOrderQuantity: "",
        isPreferred: false
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add product", variant: "destructive" });
    },
  });

  // Remove product from vendor
  const removeProduct = useMutation({
    mutationFn: async (productId: string) => {
      const response = await fetch(`/api/vendors/${id}/products/${productId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove product');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', id] });
      toast({ title: "Success", description: "Product removed from vendor" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove product", variant: "destructive" });
    },
  });

  // Add vendor contact
  const addContact = useMutation({
    mutationFn: async (contact: Partial<VendorContact>) => {
      const response = await fetch(`/api/vendors/${id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error('Failed to add contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-contacts', id] });
      toast({ title: "Success", description: "Contact added successfully" });
      setIsAddContactOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add contact", variant: "destructive" });
    },
  });

  // Update vendor contact
  const updateContact = useMutation({
    mutationFn: async ({ contactId, ...contact }: Partial<VendorContact> & { contactId: string }) => {
      const response = await fetch(`/api/vendor-contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error('Failed to update contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-contacts', id] });
      toast({ title: "Success", description: "Contact updated successfully" });
      setEditingContact(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update contact", variant: "destructive" });
    },
  });

  // Delete vendor contact
  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const response = await fetch(`/api/vendor-contacts/${contactId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete contact');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-contacts', id] });
      toast({ title: "Success", description: "Contact deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete contact", variant: "destructive" });
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

  // Filter out already assigned products
  const availableProducts = allProducts.filter(
    product => !vendorProducts.some(vp => vp.productId === product.id)
  );

  if (vendorLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-2">Vendor Not Found</h2>
            <p className="text-muted-foreground mb-4">The vendor you're looking for doesn't exist.</p>
            <Button asChild>
              <Link href="/vendors">Back to Vendors</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/vendors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{vendor.name}</h1>
          <p className="text-muted-foreground">{vendor.subcategory} • {vendor.productType}</p>
        </div>
        {getStatusBadge(vendor.status)}
      </div>

      {/* Vendor Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Vendor Information</CardTitle>
          <CardDescription>Basic details and contact information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Product Code</p>
              <p className="font-medium">{vendor.productCode}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Category</p>
              <p className="font-medium">{vendor.mainCategory === 'admin' ? 'Admin' : 'Operations/Services'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Contact Number</p>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">{vendor.contactNumber}</p>
              </div>
            </div>
            {vendor.email && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Email</p>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{vendor.email}</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Location</p>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">{vendor.location}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">City & State</p>
              <p className="font-medium">{vendor.city}, {vendor.state}</p>
            </div>
            {vendor.zone && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Zone</p>
                <p className="font-medium">{vendor.zone}</p>
              </div>
            )}
            {vendor.address && (
              <div className="space-y-1 md:col-span-2">
                <p className="text-sm text-muted-foreground">Full Address</p>
                <p className="font-medium">{vendor.address}</p>
              </div>
            )}
            {vendor.otherProducts && (
              <div className="space-y-1 md:col-span-3">
                <p className="text-sm text-muted-foreground">Other Products/Services</p>
                <p className="font-medium">{vendor.otherProducts}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Products, Contacts, Transactions */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            Products ({vendorProducts.length})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <Users className="h-4 w-4 mr-2" />
            Contacts ({vendorContacts.length})
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <DollarSign className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Supplied Products</CardTitle>
                <CardDescription>Products supplied by this vendor</CardDescription>
              </div>
              <Button onClick={() => setIsAddProductOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </CardHeader>
            <CardContent>
              {vendorProducts.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No products assigned to this vendor</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setIsAddProductOpen(true)}
                  >
                    Add First Product
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Supplier Code</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Min Order Qty</TableHead>
                      <TableHead>Preferred</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorProducts.map((vp) => (
                      <TableRow key={vp.id}>
                        <TableCell className="font-medium">
                          {vp.product?.name || 'Unknown Product'}
                        </TableCell>
                        <TableCell>{vp.product?.sku}</TableCell>
                        <TableCell>{vp.supplierCode || '-'}</TableCell>
                        <TableCell>{vp.price ? `₹${vp.price}` : '-'}</TableCell>
                        <TableCell>{vp.leadTimeDays ? `${vp.leadTimeDays} days` : '-'}</TableCell>
                        <TableCell>{vp.minimumOrderQuantity || '-'}</TableCell>
                        <TableCell>
                          {vp.isPreferred && <Check className="h-4 w-4 text-green-600" />}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Remove this product from vendor?')) {
                                removeProduct.mutate(vp.productId);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Vendor Contacts</CardTitle>
                <CardDescription>Contact persons for this vendor</CardDescription>
              </div>
              <Button onClick={() => setIsAddContactOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </CardHeader>
            <CardContent>
              {vendorContacts.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No contacts added for this vendor</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setIsAddContactOpen(true)}
                  >
                    Add First Contact
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {vendorContacts.map((contact) => (
                    <Card key={contact.id}>
                      <CardContent className="flex items-center justify-between pt-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{contact.name}</p>
                            {contact.isPrimary && (
                              <Badge variant="secondary">Primary</Badge>
                            )}
                          </div>
                          {contact.designation && (
                            <p className="text-sm text-muted-foreground">{contact.designation}</p>
                          )}
                          <div className="flex gap-4 mt-2">
                            {contact.phone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </div>
                            )}
                            {contact.email && (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingContact(contact)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Delete this contact?')) {
                                deleteContact.mutate(contact.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Purchase orders and transactions with this vendor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No transactions recorded yet</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Product Dialog */}
      <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Product to Vendor</DialogTitle>
            <DialogDescription>
              Select a product and configure supplier details
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="product">Product</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplierCode">Supplier Code</Label>
                <Input
                  id="supplierCode"
                  value={productDetails.supplierCode}
                  onChange={(e) => setProductDetails(prev => ({ ...prev, supplierCode: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor="price">Price (₹)</Label>
                <Input
                  id="price"
                  type="number"
                  value={productDetails.price}
                  onChange={(e) => setProductDetails(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="leadTime">Lead Time (days)</Label>
                <Input
                  id="leadTime"
                  type="number"
                  value={productDetails.leadTimeDays}
                  onChange={(e) => setProductDetails(prev => ({ ...prev, leadTimeDays: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor="minQty">Min Order Quantity</Label>
                <Input
                  id="minQty"
                  type="number"
                  value={productDetails.minimumOrderQuantity}
                  onChange={(e) => setProductDetails(prev => ({ ...prev, minimumOrderQuantity: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPreferred"
                checked={productDetails.isPreferred}
                onChange={(e) => setProductDetails(prev => ({ ...prev, isPreferred: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isPreferred">Mark as preferred supplier</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddProductOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => addProduct.mutate()}
              disabled={!selectedProductId || addProduct.isPending}
            >
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Contact Dialog */}
      <Dialog open={isAddContactOpen || !!editingContact} onOpenChange={(open) => {
        if (!open) {
          setIsAddContactOpen(false);
          setEditingContact(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
            <DialogDescription>
              {editingContact ? 'Update contact information' : 'Add a new contact person for this vendor'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const contact = {
              name: formData.get('name') as string,
              designation: formData.get('designation') as string,
              phone: formData.get('phone') as string,
              email: formData.get('email') as string,
              isPrimary: formData.get('isPrimary') === 'on',
            };
            
            if (editingContact) {
              updateContact.mutate({ contactId: editingContact.id, ...contact });
            } else {
              addContact.mutate(contact);
            }
          }}>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingContact?.name}
                  required
                />
              </div>
              <div>
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  name="designation"
                  defaultValue={editingContact?.designation}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={editingContact?.phone}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={editingContact?.email}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isPrimary"
                  name="isPrimary"
                  defaultChecked={editingContact?.isPrimary}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isPrimary">Set as primary contact</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setIsAddContactOpen(false);
                setEditingContact(null);
              }}>
                Cancel
              </Button>
              <Button type="submit">
                {editingContact ? 'Update' : 'Add'} Contact
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
