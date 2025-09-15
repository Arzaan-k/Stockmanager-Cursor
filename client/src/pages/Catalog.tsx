import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import ProductCard from "@/components/ProductCard";
import { api } from "@/lib/api";
import { Grid, List, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Catalog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [availability, setAvailability] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: products, isLoading } = useQuery({
    queryKey: ["/api/products", { search: searchTerm, category: selectedCategory }],
    queryFn: () => api.getProducts({ search: searchTerm, category: selectedCategory }).then(res => res.json()),
  });

  const filteredProducts = products?.filter((product: any) => {
    let matches = true;

    // Price range filter
    if (priceRange) {
      const price = parseFloat(product.price || "0");
      switch (priceRange) {
        case "0-50":
          matches = matches && price <= 50;
          break;
        case "50-200":
          matches = matches && price > 50 && price <= 200;
          break;
        case "200+":
          matches = matches && price > 200;
          break;
      }
    }

    // Availability filter
    if (availability) {
      switch (availability) {
        case "in-stock":
          matches = matches && product.stockAvailable > product.minStockLevel;
          break;
        case "low-stock":
          matches = matches && product.stockAvailable > 0 && product.stockAvailable <= product.minStockLevel;
          break;
        case "out-of-stock":
          matches = matches && product.stockAvailable <= 0;
          break;
      }
    }

    return matches;
  }) || [];

  const categories = Array.from(new Set(products?.map((p: any) => p.type) || []));

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="aspect-square bg-muted animate-pulse" />
              <CardContent className="p-3 sm:p-4 space-y-2">
                <div className="h-3 sm:h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                <div className="h-5 sm:h-6 bg-muted rounded w-1/2 animate-pulse" />
                <div className="h-7 sm:h-8 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Product Catalog</h2>
          <p className="text-muted-foreground mt-1">Browse and order spare parts from our inventory</p>
        </div>
        <div className="flex items-center space-x-3 mt-4 md:mt-0">
          <div className="flex items-center space-x-2 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="h-8 w-8 p-0"
              data-testid="button-grid-view"
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-8 w-8 p-0"
              data-testid="button-list-view"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Select value={selectedCategory || 'all'} onValueChange={(v) => setSelectedCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-category-filter">
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

            <Select value={priceRange || 'all'} onValueChange={(v) => setPriceRange(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-price-filter">
                <SelectValue placeholder="Price Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Prices</SelectItem>
                <SelectItem value="0-50">{formatCurrency(0)} - {formatCurrency(50)}</SelectItem>
                <SelectItem value="50-200">{formatCurrency(50)} - {formatCurrency(200)}</SelectItem>
                <SelectItem value="200+">{formatCurrency(200)}+</SelectItem>
              </SelectContent>
            </Select>

            <Select value={availability || 'all'} onValueChange={(v) => setAvailability(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-availability-filter">
                <SelectValue placeholder="Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="low-stock">Low Stock</SelectItem>
                <SelectItem value="out-of-stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-catalog"
              />
            </div>

            {(searchTerm || selectedCategory || priceRange || availability) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                  setPriceRange("");
                  setAvailability("");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" data-testid="text-results-count">
          {filteredProducts.length} products found
        </p>
        {(searchTerm || selectedCategory || priceRange || availability) && (
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters applied</span>
          </div>
        )}
      </div>

      {/* Product Grid/List */}
      {filteredProducts.length > 0 ? (
        <div className={cn(
          viewMode === "grid" 
            ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6"
            : "space-y-3 sm:space-y-4"
        )}>
          {filteredProducts.map((product: any) => (
            viewMode === "grid" ? (
              <ProductCard key={product.id} product={product} />
            ) : (
              <Card key={product.id} className="overflow-hidden" data-testid={`card-product-list-${product.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
                          <span className="text-muted-foreground text-xs">No image</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-foreground" data-testid={`text-list-product-name-${product.id}`}>
                          {product.name}
                        </h3>
                        <Badge 
                          variant={product.stockAvailable > 0 ? "default" : "destructive"}
                          data-testid={`badge-list-product-status-${product.id}`}
                        >
                          {product.stockAvailable > 0 ? "In Stock" : "Out of Stock"}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2" data-testid={`text-list-product-sku-${product.id}`}>
                        SKU: {product.sku} • {product.type}
                      </p>
                      
                      {product.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {product.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <span className="text-lg font-bold text-foreground" data-testid={`text-list-product-price-${product.id}`}>
                            {formatCurrency(parseFloat(product.price || "0"))}
                          </span>
                          <span className="text-sm text-muted-foreground" data-testid={`text-list-product-stock-${product.id}`}>
                            {product.stockAvailable} available
                          </span>
                        </div>
                        
                        <ProductCard product={product} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No products found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || selectedCategory || priceRange || availability
                ? "Try adjusting your search filters to find what you're looking for."
                : "No products are currently available in the catalog."}
            </p>
            {(searchTerm || selectedCategory || priceRange || availability) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                  setPriceRange("");
                  setAvailability("");
                }}
                data-testid="button-clear-all-filters"
              >
                Clear All Filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
