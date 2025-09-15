import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, User, Package, Calendar, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export default function OrderDetail() {
  const [match, params] = useRoute("/orders/:id");
  const orderId = params?.id as string | undefined;
  const qc = useQueryClient();

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["/api/orders", orderId],
    queryFn: () => api.getOrder(orderId!).then((r) => r.json()),
    enabled: !!orderId,
  });

  // Lightweight approval request notes
  const [approvalNotes, setApprovalNotes] = useState("");

  const requestApproval = useMutation({
    mutationFn: async () => {
      const payload = { requestedBy: "staff", notes: approvalNotes };
      return api.requestApproval(orderId!, payload).then(r => r.json());
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
  });

  const approve = useMutation({
    mutationFn: async () => api.approveOrder(orderId!, "admin").then(r => r.json()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
  });

  if (!match) return null;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "secondary" as const;
      case "shipped":
        return "default" as const;
      case "delivered":
        return "default" as const;
      case "cancelled":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

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

  if (error || !order) {
    return <div className="text-destructive">Failed to load order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/orders"><a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4 mr-1"/>Back to Orders</a></Link>
          <h2 className="text-2xl font-bold text-foreground">Order #{order.orderNumber}</h2>
          <Badge variant={getStatusColor(order.status)}>{order.status?.[0]?.toUpperCase() + order.status?.slice(1)}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Order info and items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4"/>Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Meta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Created</div>
                <div className="font-medium flex items-center gap-2"><Calendar className="w-4 h-4"/>{new Date(order.createdAt).toLocaleString()}</div>
              </div>
              {order.jobOrder && (
                <div>
                  <div className="text-muted-foreground">Job Order</div>
                  <div className="font-medium">{order.jobOrder}</div>
                </div>
              )}
              {order.containerNumber && (
                <div>
                  <div className="text-muted-foreground">Container Number</div>
                  <div className="font-medium">{order.containerNumber}</div>
                </div>
              )}
              {order.location && (
                <div>
                  <div className="text-muted-foreground">Location</div>
                  <div className="font-medium flex items-center gap-2"><MapPin className="w-4 h-4"/>{order.location}</div>
                </div>
              )}
            </div>

            <Separator />

            {/* Items */}
            <div>
              <h4 className="font-medium text-foreground mb-3 flex items-center"><Package className="w-4 h-4 mr-2"/>Items</h4>
              <div className="space-y-3">
                {order.items?.map((item: any) => (
                  <div key={item.orderItem.id} className="flex items-center justify-between border rounded p-3">
                    <div>
                      <div className="font-medium">{item.product?.name}</div>
                      <div className="text-xs text-muted-foreground">SKU: {item.product?.sku}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div>{item.orderItem.quantity} × {formatCurrency(parseFloat(item.orderItem.unitPrice))}</div>
                      <div className="font-semibold">{formatCurrency(parseFloat(item.orderItem.totalPrice))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(parseFloat(order.subtotal))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(parseFloat(order.tax))}</span></div>
              <div className="flex justify-between font-semibold border-t pt-2"><span>Total</span><span>{formatCurrency(parseFloat(order.total))}</span></div>
            </div>

            {/* Purchase Order actions */}
            <Separator />
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  if (!orderId) return;
                  const url = api.getOrderPoUrl(orderId);
                  window.open(url, "_blank");
                }}
              >
                View PO (PDF)
              </Button>
              <Button
                onClick={() => {
                  if (!orderId) return;
                  const url = api.getOrderPoDownloadUrl(orderId);
                  window.open(url, "_blank");
                }}
              >
                Download PO (PDF)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Approval */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Approval Status:</span>
              <Badge variant={(order.approvalStatus === "approved" ? "default" : order.approvalStatus === "needs_approval" ? "secondary" : "secondary") as any}>
                {(order.approvalStatus || "n/a").replace(/_/g, " ")}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Notes for approver (optional)</div>
              <Textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} placeholder="Notes for approver" />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => requestApproval.mutate()} disabled={requestApproval.isPending || !orderId}>
                {requestApproval.isPending ? "Requesting..." : "Request Approval"}
              </Button>
              <Button variant="secondary" onClick={() => approve.mutate()} disabled={approve.isPending || !orderId}>
                {approve.isPending ? "Approving..." : "Approve"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Customer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4"/>Customer</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Name: </span><span className="font-medium">{order.customerName}</span></div>
            {order.customerEmail && (<div><span className="text-muted-foreground">Email: </span><span>{order.customerEmail}</span></div>)}
            {order.customerPhone && (<div><span className="text-muted-foreground">Phone: </span><span>{order.customerPhone}</span></div>)}
            {order.customerAddress && (<div><span className="text-muted-foreground">Address: </span><span>{order.customerAddress}</span></div>)}
            {order.notes && (
              <>
                <Separator />
                <div className="text-muted-foreground">Notes</div>
                <div>{order.notes}</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
