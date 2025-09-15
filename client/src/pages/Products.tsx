import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import * as XLSX from "xlsx";
import { useDropzone } from "react-dropzone";
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  Upload,
  MapPin,
  Users,
  Image as ImageIcon,
} from "lucide-react";
import { ProductImageUpload } from "@/components/product-image-upload";

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  sku: z.string().min(1, "SKU is required"),
  type: z.string().min(1, "Product type is required"),
  price: z.string().min(0, "Price must be a positive number"),
  stockTotal: z.number().min(0, "Stock total must be non-negative"),
  minStockLevel: z.number().min(0, "Minimum stock level must be non-negative"),
  imageUrl: z.string().url().optional().or(z.literal("")),
  warehouseId: z.string().optional(),
  // Extended fields
  groupCode: z.string().optional(),
  groupName: z.string().optional(),
  crystalPartCode: z.string().optional(),
  listOfItems: z.string().optional(),
  photos: z.string().optional(), // comma/space separated URLs input; backend expects array/string handled server-side on CSV only
  mfgPartCode: z.string().optional(),
  importance: z.string().optional(),
  highValue: z.string().optional(),
  maximumUsagePerMonth: z.string().optional(),
  sixMonthsUsage: z.string().optional(),
  averagePerDay: z.string().optional(),
  leadTimeDays: z.string().optional(),
  criticalFactorOneDay: z.string().optional(),
  units: z.string().optional(),
  minimumInventoryPerDay: z.string().optional(),
  maximumInventoryPerDay: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

export default function Products() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [imageManagementProduct, setImageManagementProduct] = useState<any>(null);
  const { toast } = useToast();

  // Import helpers
  const [fileName, setFileName] = useState<string>("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [workbook, setWorkbook] = useState<any>(null);
  const onDrop = useMemo(
    () =>
      async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;
        setFileName(file.name);
        const ext = file.name.toLowerCase().split(".").pop();
        try {
          if (ext === "csv") {
            const text = await file.text();
            setCsvText(text);
            setSheetNames([]);
            setSelectedSheet("");
          } else if (["xlsx", "xls"].includes(ext || "")) {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            setWorkbook(wb);
            setSheetNames(wb.SheetNames);
            const sheet = wb.SheetNames[0];
            setSelectedSheet(sheet);
            const ws = wb.Sheets[sheet];
            const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
            const csv = XLSX.utils.sheet_to_csv(ws);
            // If csv looks empty, fallback to building from json
            const finalCsv = csv && csv.trim().length > 0 ? csv : XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(json));
            setCsvText(finalCsv);
          } else {
            toast({ title: "Unsupported file type", description: "Please upload a CSV or XLSX file", variant: "destructive" });
          }
        } catch (e: any) {
          toast({ title: "Failed to read file", description: e?.message || String(e), variant: "destructive" });
        }
      },
    []
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false, accept: { "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] } });

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    if (workbook && workbook.Sheets[sheet]) {
      const ws = workbook.Sheets[sheet];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const csv = XLSX.utils.sheet_to_csv(ws);
      const finalCsv = csv && csv.trim().length > 0 ? csv : XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(json));
      setCsvText(finalCsv);
    }
  };

  const clearImportData = () => {
    setCsvText("");
    setFileName("");
    setSheetNames([]);
    setSelectedSheet("");
    setWorkbook(null);
  };

  const { data: products, isLoading } = useQuery({
    queryKey: ["/api/products", { search: searchTerm, category: selectedCategory }],
    queryFn: () => api.getProducts({ search: searchTerm, category: selectedCategory }).then(res => res.json()),
  });

  const importCsvMutation = useMutation({
    mutationFn: (payload: { csv: string; warehouseId?: string }) => api.importProductsCSV(payload).then(res => res.json()),
    onSuccess: (result) => {
      toast({ title: `Imported ${result?.imported || 0} products` });
      setIsImportDialogOpen(false);
      clearImportData();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => toast({ title: "Failed to import CSV", variant: "destructive" }),
  });

  const { data: warehouses } = useQuery({
    queryKey: ["/api/warehouses"],
    queryFn: () => api.getWarehouses().then(res => res.json()),
  });

  const createProductMutation = useMutation({
    mutationFn: (data: ProductFormData) => api.createProduct(data).then(res => res.json()),
    onSuccess: () => {
      toast({ title: "Product created successfully" });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({ title: "Failed to create product", variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductFormData> }) =>
      api.updateProduct(id, data).then(res => res.json()),
    onSuccess: () => {
      toast({ title: "Product updated successfully" });
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => {
      toast({ title: "Product deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      sku: "",
      type: "",
      price: "0",
      stockTotal: 0,
      minStockLevel: 10,
      imageUrl: "",
      warehouseId: "",
    },
  });

  const onSubmit = (data: ProductFormData) => {
    // Coerce values to match backend schema
    const toInt = (v?: string) => (v !== undefined && v !== "" ? parseInt(v) : undefined);
    const toStr = (v?: any) => (v !== undefined && v !== null && v !== "" ? String(v) : undefined);
    const payload: any = {
      name: data.name,
      description: toStr(data.description),
      sku: data.sku,
      type: data.type,
      price: data.price,
      stockTotal: data.stockTotal,
      minStockLevel: data.minStockLevel,
      imageUrl: toStr(data.imageUrl),
      // extended
      groupCode: toStr(data.groupCode),
      groupName: toStr(data.groupName),
      crystalPartCode: toStr(data.crystalPartCode),
      listOfItems: toStr(data.listOfItems),
      mfgPartCode: toStr(data.mfgPartCode),
      importance: toStr(data.importance),
      highValue: toStr(data.highValue),
      maximumUsagePerMonth: toInt(data.maximumUsagePerMonth),
      sixMonthsUsage: toInt(data.sixMonthsUsage),
      averagePerDay: toStr(data.averagePerDay),
      leadTimeDays: toInt(data.leadTimeDays),
      criticalFactorOneDay: toInt(data.criticalFactorOneDay),
      units: toStr(data.units),
      minimumInventoryPerDay: toInt(data.minimumInventoryPerDay),
      maximumInventoryPerDay: toInt(data.maximumInventoryPerDay),
    };
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      if (!data.warehouseId) {
        toast({ title: "Please select a warehouse", variant: "destructive" });
        return;
      }
      createProductMutation.mutate({ ...payload, warehouseId: data.warehouseId });
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      description: product.description || "",
      sku: product.sku,
      type: product.type,
      price: product.price || "0",
      stockTotal: product.stockTotal,
      minStockLevel: product.minStockLevel,
      imageUrl: product.imageUrl || "",
      groupCode: product.groupCode || "",
      groupName: product.groupName || "",
      crystalPartCode: product.crystalPartCode || "",
      listOfItems: product.listOfItems || "",
      mfgPartCode: product.mfgPartCode || "",
      importance: product.importance || "",
      highValue: product.highValue || "",
      maximumUsagePerMonth: product.maximumUsagePerMonth?.toString?.() || "",
      sixMonthsUsage: product.sixMonthsUsage?.toString?.() || "",
      averagePerDay: product.averagePerDay?.toString?.() || "",
      leadTimeDays: product.leadTimeDays?.toString?.() || "",
      criticalFactorOneDay: product.criticalFactorOneDay?.toString?.() || "",
      units: product.units || "",
      minimumInventoryPerDay: product.minimumInventoryPerDay?.toString?.() || "",
      maximumInventoryPerDay: product.maximumInventoryPerDay?.toString?.() || "",
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutation.mutate(id);
    }
  };

  const getStockStatus = (product: any) => {
    if (product.stockAvailable <= 0) {
      return { label: "Out of Stock", variant: "destructive" as const };
    } else if (product.stockAvailable <= product.minStockLevel) {
      return { label: "Low Stock", variant: "secondary" as const };
    } else {
      return { label: "In Stock", variant: "default" as const };
    }
  };

  const categories = Array.from(new Set(products?.map((p: any) => p.type) || []));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Products</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your inventory and stock levels
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-csv">
                    <Upload className="w-4 h-4 mr-2" />
                    Import CSV
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import Products from CSV</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Select Warehouse (optional)</Label>
                      <Select onValueChange={(v) => form.setValue("warehouseId", v)} value={form.watch("warehouseId") || undefined}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select warehouse to apply initial stock" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses?.map((w: any) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Upload File (CSV/XLSX)</Label>
                      <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted'} `}
                      >
                        <input {...getInputProps()} />
                        <p className="text-sm text-muted-foreground">
                          {isDragActive ? 'Drop the file here...' : 'Drag & drop a CSV/XLSX file here, or click to select'}
                        </p>
                        {fileName && (
                          <p className="text-xs mt-2">Selected: {fileName}</p>
                        )}
                      </div>
                    </div>

                    {sheetNames.length > 1 && (
                      <div>
                        <Label>Select Sheet</Label>
                        <Select value={selectedSheet} onValueChange={handleSheetChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose sheet" />
                          </SelectTrigger>
                          <SelectContent>
                            {sheetNames.map((name) => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">Changing sheets will automatically update the CSV content below.</p>
                      </div>
                    )}

                    <div>
                      <Label>CSV Content</Label>
                      <Textarea
                        className="min-h-48"
                        placeholder="Paste CSV with headers here or upload a file above"
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-2">Expected headers include Group Code, Group Name, Crystal Part Code, List of Items, Photos, MFG Part Code, Importance, High Value, Maximum Usage Per Month, 6 Months Usage, Average per day, Lead Time days, Critical Factor - One Day, Units, Minimum Inventory Per Day, Maximum Inventory Per Day, CURRENT STOCK AVAILABLE.</p>
                    </div>

                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => {
                        setIsImportDialogOpen(false);
                        clearImportData();
                      }}>Cancel</Button>
                      <Button
                        onClick={() => importCsvMutation.mutate({ csv: csvText, warehouseId: form.getValues().warehouseId })}
                        disabled={importCsvMutation.isPending || !csvText.trim()}
                      >
                        {importCsvMutation.isPending ? "Importing..." : "Import"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={isCreateDialogOpen || !!editingProduct} onOpenChange={(open) => {
                if (!open) {
                  setIsCreateDialogOpen(false);
                  setEditingProduct(null);
                  form.reset();
                }
              }}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-product">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingProduct ? "Edit Product" : "Add New Product"}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Product Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter product name" {...field} data-testid="input-product-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="sku"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SKU</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter SKU" {...field} data-testid="input-product-sku" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Engine Parts" {...field} data-testid="input-product-type" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Price</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-product-price" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Extended business fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="groupCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Group Code</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="groupName" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Group Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Daikin" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="crystalPartCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Crystal Part Code</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Q-001001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="listOfItems" render={({ field }) => (
                          <FormItem>
                            <FormLabel>List of Items</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Daikin Reefer Unit" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="mfgPartCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel>MFG Part Code</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 2536721" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="importance" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Importance</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Critical" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="highValue" render={({ field }) => (
                          <FormItem>
                            <FormLabel>High Value</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Yes/No" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="maximumUsagePerMonth" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Maximum Usage Per Month</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g. 24" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="sixMonthsUsage" render={({ field }) => (
                          <FormItem>
                            <FormLabel>6 Months Usage</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g. 9" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="averagePerDay" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Average per day</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="e.g. 0.13" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="leadTimeDays" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lead Time days</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g. 2" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="criticalFactorOneDay" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Critical Factor - One Day</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g. 2" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="units" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Units</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Nos." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="minimumInventoryPerDay" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Minimum Inventory Per Day</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g. 2" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="maximumInventoryPerDay" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Maximum Inventory Per Day</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g. 4" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="warehouseId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Warehouse</FormLabel>
                              <FormControl>
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={(v) => field.onChange(v)}
                                >
                                  <SelectTrigger className="w-full" data-testid="select-product-warehouse">
                                    <SelectValue placeholder="Select warehouse" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {warehouses?.map((w: any) => (
                                      <SelectItem key={w.id} value={w.id}>
                                        {w.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Enter product description" {...field} data-testid="textarea-product-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="stockTotal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Initial Stock</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  data-testid="input-product-stock"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="minStockLevel"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Min Stock Level</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  data-testid="input-product-min-stock"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="imageUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Image URL</FormLabel>
                              <FormControl>
                                <Input placeholder="https://..." {...field} data-testid="input-product-image" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Image Upload Section - Only show when editing existing product */}
                      {editingProduct && (
                        <div className="border-t pt-4">
                          <ProductImageUpload 
                            productId={editingProduct.id} 
                            productName={editingProduct.name} 
                          />
                        </div>
                      )}

                      <div className="flex justify-end space-x-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsCreateDialogOpen(false);
                            setEditingProduct(null);
                            form.reset();
                          }}
                          data-testid="button-cancel-product"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createProductMutation.isPending || updateProductMutation.isPending}
                          data-testid="button-save-product"
                        >
                          {createProductMutation.isPending || updateProductMutation.isPending
                            ? "Saving..."
                            : editingProduct
                            ? "Update Product"
                            : "Create Product"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              
              {/* Manage Images Dialog */}
              <Dialog 
                open={!!imageManagementProduct} 
                onOpenChange={(open) => {
                  if (!open) setImageManagementProduct(null);
                }}
              >
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {imageManagementProduct ? `Manage Images: ${imageManagementProduct.name}` : 'Manage Images'}
                    </DialogTitle>
                  </DialogHeader>
                  {imageManagementProduct && (
                    <ProductImageUpload 
                      productId={imageManagementProduct.id} 
                      productName={imageManagementProduct.name} 
                    />
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        {/* Filters */}
        <div className="px-6 pb-6">
          <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4 bg-muted/20 p-4 rounded-lg">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-products"
                />
              </div>
            </div>
            <Select value={selectedCategory || 'all'} onValueChange={(v) => setSelectedCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(categories as string[]).map((category: string) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                  <div className="w-12 h-12 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-48" />
                    <div className="h-3 bg-muted rounded w-32" />
                  </div>
                  <div className="w-24 h-8 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : products?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Product</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">SKU</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Stock</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((product: any) => {
                    const stockStatus = getStockStatus(product);
                    
                    return (
                      <tr key={product.id} className="hover:bg-muted/50" data-testid={`row-product-${product.id}`}>
                        <td className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-full h-full rounded-lg object-cover"
                                />
                              ) : (
                                <Package className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-foreground" data-testid={`text-product-name-${product.id}`}>
                                {product.name}
                              </p>
                              <p className="text-sm text-muted-foreground" data-testid={`text-product-type-${product.id}`}>
                                {product.type}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-foreground" data-testid={`text-product-sku-${product.id}`}>
                          {product.sku}
                        </td>
                        <td className="p-4">
                          <div className="text-sm">
                            <p className="font-medium text-foreground" data-testid={`text-product-total-stock-${product.id}`}>
                              Total: {product.stockTotal}
                            </p>
                            <p className="text-muted-foreground" data-testid={`text-product-stock-breakdown-${product.id}`}>
                              Used: {product.stockUsed} • Available: {product.stockAvailable}
                            </p>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-medium text-foreground" data-testid={`text-product-price-${product.id}`}>
                          {formatCurrency(parseFloat(product.price || "0"))}
                        </td>
                        <td className="p-4">
                          <Badge variant={stockStatus.variant} data-testid={`badge-product-status-${product.id}`}>
                            {stockStatus.label}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(product)}
                              data-testid={`button-edit-product-${product.id}`}
                              title="Edit Product"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.location.href = `/vendors?product=${product.id}`}
                              data-testid={`button-vendors-product-${product.id}`}
                              title="View Vendors"
                            >
                              <Users className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setImageManagementProduct(product)}
                              data-testid={`button-images-product-${product.id}`}
                              title="Manage Images"
                            >
                              <ImageIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(product.id)}
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-product-${product.id}`}
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
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
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No products found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || selectedCategory
                  ? "Try adjusting your search filters"
                  : "Get started by adding your first product"}
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-first-product">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
