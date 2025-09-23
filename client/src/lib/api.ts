import { apiRequest } from "./queryClient";

export const api = {
  // Auth
  login: (credentials: { username: string; password: string }) =>
    apiRequest("POST", "/api/auth/login", credentials),

  // Dashboard
  getDashboardStats: () => apiRequest("GET", "/api/dashboard/stats"),
  getRecentMovements: () => apiRequest("GET", "/api/dashboard/recent-movements"),
  getLowStockProducts: () => apiRequest("GET", "/api/dashboard/low-stock"),

  // Products
  getProducts: (filters?: { search?: string; category?: string; warehouseId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.category) params.append("category", filters.category);
    if (filters?.warehouseId) params.append("warehouseId", filters.warehouseId);
    
    return apiRequest("GET", `/api/products?${params.toString()}`);
  },
  getProduct: (id: string) => apiRequest("GET", `/api/products/${id}`),
  getProductUsage: (id: string) => apiRequest("GET", `/api/products/${id}/usage`),
  createProduct: (product: any) => apiRequest("POST", "/api/products", product),
  updateProduct: (id: string, product: any) => apiRequest("PUT", `/api/products/${id}`, product),
  deleteProduct: (id: string) => apiRequest("DELETE", `/api/products/${id}`),
  // Product images
  uploadProductImage: async (id: string, file: File) => {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`/api/products/${id}/images`, {
      method: 'POST',
      body: form,
    });
    return res;
  },
  uploadProductImageFromUrl: (id: string, imageUrl: string) => apiRequest("POST", `/api/products/${id}/images/from-url`, { imageUrl }),
  getProductImages: (id: string) => apiRequest("GET", `/api/products/${id}/images`),
  deleteProductImage: (id: string, imageUrl: string) => apiRequest("DELETE", `/api/products/${id}/images`, { imageUrl }),
  updateStock: (id: string, data: any) => apiRequest("POST", `/api/products/${id}/stock`, data),
  importProductsCSV: (payload: { csv: string; warehouseId?: string }) => apiRequest("POST", "/api/products/import-csv", payload),

  // Warehouses
  getWarehouses: () => apiRequest("GET", "/api/warehouses"),
  createWarehouse: (warehouse: any) => apiRequest("POST", "/api/warehouses", warehouse),

  // Orders
  getOrders: (filters?: {
    status?: string;
    approvalStatus?: string;
    customer?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    minTotal?: string | number;
    maxTotal?: string | number;
    sortBy?: "createdAt" | "total" | "status" | "approvalStatus" | "customer";
    sortDir?: "asc" | "desc";
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", String(filters.status));
    if (filters?.approvalStatus) params.append("approvalStatus", String(filters.approvalStatus));
    if (filters?.customer) params.append("customer", String(filters.customer));
    if (filters?.dateFrom) params.append("dateFrom", (filters.dateFrom instanceof Date ? filters.dateFrom.toISOString() : String(filters.dateFrom)));
    if (filters?.dateTo) params.append("dateTo", (filters.dateTo instanceof Date ? filters.dateTo.toISOString() : String(filters.dateTo)));
    if (filters?.minTotal !== undefined) params.append("minTotal", String(filters.minTotal));
    if (filters?.maxTotal !== undefined) params.append("maxTotal", String(filters.maxTotal));
    if (filters?.sortBy) params.append("sortBy", String(filters.sortBy));
    if (filters?.sortDir) params.append("sortDir", String(filters.sortDir));
    const qs = params.toString();
    return apiRequest("GET", `/api/orders${qs ? `?${qs}` : ""}`);
  },
  getOrder: (id: string) => apiRequest("GET", `/api/orders/${id}`),
  // PO Drafts
  getPoDraft: (orderId: string) => apiRequest("GET", `/api/orders/${orderId}/po-draft`),
  savePoDraft: (orderId: string, draft: any) => apiRequest("PUT", `/api/orders/${orderId}/po-draft`, draft),
  deletePoDraft: (orderId: string) => apiRequest("DELETE", `/api/orders/${orderId}/po-draft`),
  createOrder: (orderData: any) => apiRequest("POST", "/api/orders", orderData),
  updateOrderStatus: (id: string, status: string) => apiRequest("PUT", `/api/orders/${id}/status`, { status }),
  requestApproval: (id: string, payload: any) => apiRequest("POST", `/api/orders/${id}/request-approval`, payload),
  approveOrder: (id: string, approvedBy: string, notes?: string) => apiRequest("POST", `/api/orders/${id}/approve`, { approvedBy, notes }),
  getOrderGrn: (id: string) => apiRequest("GET", `/api/orders/${id}/grn`),

  // Purchase Orders (PDF)
  getOrderPoUrl: (id: string) => `/api/orders/${id}/po.pdf`,
  getOrderPoDownloadUrl: (id: string) => `/api/orders/${id}/po.pdf/download`,

  // Customers
  getCustomers: () => apiRequest("GET", "/api/customers"),
  createCustomer: (customer: any) => apiRequest("POST", "/api/customers", customer),

  // Stock movements
  getStockMovements: (productId?: string) => {
    const params = new URLSearchParams();
    if (productId) params.append("productId", productId);
    return apiRequest("GET", `/api/stock-movements?${params.toString()}`);
  },

  // WhatsApp
  sendWhatsAppMessage: (payload: { phone: string; message: string }) =>
    apiRequest("POST", "/api/whatsapp/send", payload),
  listWhatsappConversations: (filters?: { status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    const qs = params.toString();
    return apiRequest("GET", `/api/whatsapp/conversations${qs ? `?${qs}` : ""}`).then(res => res.json()).then(data => data.value || data);
  },
  getWhatsappConversationMessages: (conversationId: string) =>
    apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/messages`).then(res => res.json()).then(data => data.value || data),
  assignWhatsappConversation: (conversationId: string, payload: { agentUserId?: string | null; status?: "open" | "pending" | "closed" }) =>
    apiRequest("POST", `/api/whatsapp/conversations/${conversationId}/assign`, payload),
  replyWhatsappConversation: (conversationId: string, message: string) =>
    apiRequest("POST", `/api/whatsapp/conversations/${conversationId}/reply`, { message }),
  getWhatsAppLogs: () => apiRequest("GET", "/api/whatsapp/logs").then(res => res.json()).then(data => data.value || data),
};
