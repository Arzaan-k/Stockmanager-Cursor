import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  MessageCircle,
  Send,
  Phone,
  Settings,
  BarChart3,
  Image,
  CheckCircle,
  AlertCircle,
  Clock,
  Bot,
  Smartphone,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

interface WhatsAppMessage {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: string;
  imageUrl?: string;
  status?: "sent" | "delivered" | "read";
}

interface WhatsAppLog {
  id: string;
  userPhone: string;
  productId?: string;
  action?: string;
  quantity?: number;
  aiResponse?: string;
  imageUrl?: string;
  confidence?: string;
  status?: string;
  createdAt: string;
  meta?: Record<string, any>;
}

export default function WhatsApp() {
  const [newMessage, setNewMessage] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+1 (555) 123-4567");
  const [aiModel, setAiModel] = useState("clip-ocr-v2");
  const [autoNotifications, setAutoNotifications] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // WhatsApp conversations state
  const [statusFilter, setStatusFilter] = useState<string | undefined>("open");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [agentReply, setAgentReply] = useState("");
  // Fetch WhatsApp logs
  const logsQuery = useQuery({
    queryKey: ["whatsapp-logs"],
    queryFn: () => api.getWhatsAppLogs(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Check for token expiration in logs
  const tokenExpired = Array.isArray(logsQuery.data) && logsQuery.data.some(
    (log: WhatsAppLog) => 
      (log.status === "error" && 
      log.aiResponse && (
        log.aiResponse.includes("token expired") || 
        log.aiResponse.includes("authentication failed") ||
        log.aiResponse.includes("Error validating access token"))) ||
      (log.action === "token" && log.aiResponse && log.aiResponse.includes("expired"))
  );

  const sendMutation = useMutation({
    mutationFn: (payload: { phone: string; message: string }) => api.sendWhatsAppMessage(payload),
    onSuccess: () => {
      toast({ title: "Message sent", description: "WhatsApp message sent successfully." });
      setNewMessage("");
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to send message";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    },
  });

  // Fetch conversations
  const conversationsQuery = useQuery({
    queryKey: ["wa:conversations", statusFilter, searchTerm],
    queryFn: () => api.listWhatsappConversations({ status: statusFilter, search: searchTerm || undefined }),
    onError: (err: any) => {
      const msg = err?.message || "Failed to load conversations";
      toast({ 
        title: "Error loading conversations", 
        description: msg.includes("token") ? "WhatsApp authentication token has expired. Please contact your administrator to refresh the token." : msg, 
        variant: "destructive" 
      });
    },
  });

  // Fetch messages for selected conversation
  const messagesQuery = useQuery({
    queryKey: ["wa:messages", selectedConversationId],
    enabled: !!selectedConversationId,
    queryFn: async () => {
      const data = await api.getWhatsappConversationMessages(selectedConversationId as string);
      return data as { conversation: any; messages: any[] };
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to load messages";
      toast({ 
        title: "Error loading messages", 
        description: msg.includes("token") ? "WhatsApp authentication token has expired. Please contact your administrator to refresh the token." : msg, 
        variant: "destructive" 
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (payload: { conversationId: string; status?: "open" | "pending" | "closed"; agentUserId?: string | null }) =>
      api.assignWhatsappConversation(payload.conversationId, { status: payload.status, agentUserId: payload.agentUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa:conversations"] });
      toast({ title: "Updated", description: "Conversation updated." });
    },
  });

  const replyMutation = useMutation({
    mutationFn: (payload: { conversationId: string; message: string }) =>
      api.replyWhatsappConversation(payload.conversationId, payload.message),
    onSuccess: async () => {
      setAgentReply("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wa:messages", selectedConversationId] }),
        queryClient.invalidateQueries({ queryKey: ["wa:conversations"] }),
      ]);
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message || "Failed to send reply", variant: "destructive" });
    },
  });

  // Mock analytics data
  const analyticsData = {
    imagesProcessed: 47,
    stockUpdates: 23,
    ordersCreated: 8,
    accuracy: 94.2,
  };

  const handleSendMessage = () => {
    const msg = newMessage.trim();
    const phone = phoneNumber.trim();
    if (!msg) return;
    if (!phone) {
      toast({ title: "Phone required", description: "Enter a WhatsApp phone number (including country code).", variant: "destructive" });
      return;
    }
    // Basic normalization: remove spaces, parentheses, dashes
    const normalized = phone.replace(/[^+\d]/g, "");
    sendMutation.mutate({ phone: normalized, message: msg });
  };

  const handleConfigurationSave = () => {
    toast({
      title: "Configuration saved",
      description: "WhatsApp AI settings have been updated successfully.",
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations + Messages */}
        <Card className="lg:col-span-1">
          <CardHeader className="bg-green-50 dark:bg-green-950/20">
            <CardTitle className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">WhatsApp Conversations</h3>
                <p className="text-sm text-muted-foreground">Take over chats and manage orders</p>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {/* Left: Conversation list */}
              <div className="md:col-span-1 border-r border-border">
                <div className="p-3 flex items-center gap-2">
                  <Input placeholder="Search phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="h-96 overflow-y-auto">
                  {conversationsQuery.isLoading && <div className="p-3 text-sm text-muted-foreground">Loading...</div>}
                  {conversationsQuery.isError && <div className="p-3 text-sm text-destructive">Failed to load</div>}
                  {!conversationsQuery.isLoading && !conversationsQuery.isError && !conversationsQuery.data && (
                    <div className="p-3 text-sm text-muted-foreground">Failed to load conversations</div>
                  )}
                  {Array.isArray(conversationsQuery.data) ? conversationsQuery.data.map((c: any) => (
                    <div key={c.id} className={`p-3 cursor-pointer hover:bg-muted/40 ${selectedConversationId === c.id ? "bg-muted/60" : ""}`} onClick={() => setSelectedConversationId(c.id)}>
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{c.userPhone}</div>
                        <Badge variant={c.status === "open" ? "default" : c.status === "pending" ? "secondary" : "outline"}>{c.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(c.updatedAt || c.createdAt).toLocaleString()}</div>
                      {c.assignedToUserId && <div className="text-xs text-primary mt-1">Assigned to: {c.assignedToUserId}</div>}
                    </div>
                  )) : (
                    <div className="p-3 text-sm text-destructive">Invalid data format</div>
                  )}
                </div>
              </div>

              {/* Right: Message thread */}
              <div className="md:col-span-2 flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="text-sm text-muted-foreground">
                    {messagesQuery.data?.conversation ? (
                      <>
                        <div className="font-medium">{messagesQuery.data.conversation.userPhone}</div>
                        <div className="text-xs">
                          Status: <Badge variant={messagesQuery.data.conversation.status === "open" ? "default" : messagesQuery.data.conversation.status === "pending" ? "secondary" : "outline"}>
                            {messagesQuery.data.conversation.status}
                          </Badge>
                          {messagesQuery.data.conversation.assignedToUserId && (
                            <span className="ml-2">Assigned to: {messagesQuery.data.conversation.assignedToUserId}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      "Select a conversation"
                    )}
                  </div>
                  {messagesQuery.data?.conversation && (
                    <div className="flex gap-2">
                      <Select value={messagesQuery.data.conversation.status} onValueChange={(v) => {
                        assignMutation.mutate({ conversationId: messagesQuery.data!.conversation.id, status: v as any });
                      }}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex-1 h-80 p-4 space-y-4 overflow-y-auto bg-muted/20">
                  {(messagesQuery.data?.messages || []).map((m: any) => {
                    const isUser = m.direction === "inbound";
                    return (
                      <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-xs lg:max-w-md ${isUser ? "order-2" : "order-1"}`}>
                          <div className={`p-3 rounded-lg ${isUser ? "bg-card border border-border" : "bg-primary text-primary-foreground"}`}>
                            <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                            <div className="flex items-center justify-end mt-1">
                              <span className="text-[10px] opacity-70">{new Date(m.createdAt).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? "bg-muted mr-3 order-1" : "bg-primary/10 ml-3 order-2"}`}>
                          {isUser ? <Smartphone className="w-4 h-4 text-muted-foreground" /> : <Bot className="w-4 h-4 text-primary" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 border-t border-border bg-background">
                  {selectedConversationId && (
                    <>
                      <div className="flex gap-2 mb-2">
                        <Select 
                          value={messagesQuery.data?.conversation?.status || "open"}
                          onValueChange={(value) => {
                            assignMutation.mutate({
                              conversationId: selectedConversationId,
                              status: value as "open" | "pending" | "closed",
                            });
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Button 
                          variant={messagesQuery.data?.conversation?.assignedToUserId ? "outline" : "default"}
                          onClick={() => {
                            assignMutation.mutate({
                              conversationId: selectedConversationId,
                              agentUserId: messagesQuery.data?.conversation?.assignedToUserId ? null : "agent",
                            });
                          }}
                          className="flex-1"
                        >
                          {messagesQuery.data?.conversation?.assignedToUserId ? "Release Conversation" : "Take Over Conversation"}
                        </Button>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={selectedConversationId ? "Type a reply..." : "Select a conversation to reply"}
                      value={agentReply}
                      onChange={(e) => setAgentReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && selectedConversationId && agentReply.trim()) {
                          replyMutation.mutate({ conversationId: selectedConversationId, message: agentReply.trim() });
                        }
                      }}
                      disabled={!selectedConversationId || replyMutation.isPending}
                    />
                    <Button
                      onClick={() => selectedConversationId && agentReply.trim() && replyMutation.mutate({ conversationId: selectedConversationId, message: agentReply.trim() })}
                      disabled={!selectedConversationId || replyMutation.isPending || !agentReply.trim()}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Send Custom + AI Configuration & Stats */}
        <div className="space-y-6">
          {/* Send Custom Message */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Send className="w-5 h-5" />
                <span>Send Custom WhatsApp Message</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="custom-phone">Recipient Number</Label>
                <Input
                  id="custom-phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  data-testid="input-custom-phone"
                />
              </div>
              <div>
                <Label htmlFor="custom-message">Message</Label>
                <Input
                  id="custom-message"
                  placeholder="Type message to send on WhatsApp..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  data-testid="input-custom-message"
                />
              </div>
              <Button onClick={handleSendMessage} disabled={sendMutation.isPending} data-testid="button-send-custom">
                <Send className="w-4 h-4 mr-2" />
                Send WhatsApp
              </Button>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>AI Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="phone-number">WhatsApp Number</Label>
                <Input
                  id="phone-number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  data-testid="input-phone-number"
                />
              </div>

              <div>
                <Label htmlFor="ai-model">AI Model</Label>
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger data-testid="select-ai-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clip-ocr-v2">CLIP + OCR v2.1</SelectItem>
                    <SelectItem value="gpt-4-vision">GPT-4 Vision</SelectItem>
                    <SelectItem value="custom-model">Custom Model</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-notifications">Auto-notifications</Label>
                  <p className="text-sm text-muted-foreground">Send low stock alerts automatically</p>
                </div>
                <Switch
                  id="auto-notifications"
                  checked={autoNotifications}
                  onCheckedChange={setAutoNotifications}
                  data-testid="switch-auto-notifications"
                />
              </div>

              <Button onClick={handleConfigurationSave} className="w-full" data-testid="button-save-config">
                Save Configuration
              </Button>
            </CardContent>
          </Card>

          {/* Today's Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>Today's Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Image className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Images Processed</span>
                </div>
                <Badge variant="secondary" data-testid="badge-images-processed">
                  {analyticsData.imagesProcessed}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Stock Updates</span>
                </div>
                <Badge variant="secondary" data-testid="badge-stock-updates">
                  {analyticsData.stockUpdates}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Orders Created</span>
                </div>
                <Badge variant="secondary" data-testid="badge-orders-created">
                  {analyticsData.ordersCreated}
                </Badge>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Recognition Accuracy</span>
                <Badge variant="default" data-testid="badge-accuracy">
                  {analyticsData.accuracy}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                data-testid="button-test-integration"
                onClick={() => {
                  const phone = phoneNumber.trim().replace(/[^+\d]/g, "");
                  if (!phone) {
                    toast({ title: "Phone required", description: "Enter a WhatsApp phone number first.", variant: "destructive" });
                    return;
                  }
                  sendMutation.mutate({ phone, message: "✅ Test message from StockSmartHub dashboard." });
                }}
                disabled={sendMutation.isPending}
              >
                <Phone className="w-4 h-4 mr-2" />
                Test Integration
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                data-testid="button-view-logs"
                onClick={() => toast({ title: "Coming soon", description: "Logs viewer will be added in a future update." })}
              >
                <Settings className="w-4 h-4 mr-2" />
                View WhatsApp Logs
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                data-testid="button-send-test-alert"
                onClick={() => {
                  const phone = phoneNumber.trim().replace(/[^+\d]/g, "");
                  if (!phone) {
                    toast({ title: "Phone required", description: "Enter a WhatsApp phone number first.", variant: "destructive" });
                    return;
                  }
                  sendMutation.mutate({
                    phone,
                    message: "🚨 LOW STOCK ALERT\n\nProduct: Demo Part\nSKU: DEMO-001\nCurrent Stock: 2\nMinimum Level: 5\n\nPlease restock this item soon!",
                  });
                }}
                disabled={sendMutation.isPending}
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Send Test Alert
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Token Expiration Alert */}
      {tokenExpired && (
        <Alert variant="destructive" className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>WhatsApp Token Expired</AlertTitle>
          <AlertDescription>
            The WhatsApp API token has expired. Messages cannot be sent or received until the token is refreshed.
            Please check the <a href="/WHATSAPP_SETUP.md" className="underline" target="_blank">WhatsApp setup guide</a> for instructions on how to refresh the token.
          </AlertDescription>
          <div className="mt-4">
            <Button variant="outline" size="sm" className="mt-2">
              <RefreshCw className="mr-2 h-4 w-4" />
              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">
                Go to Meta Developer Portal
              </a>
            </Button>
          </div>
        </Alert>
      )}

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 ${tokenExpired ? 'bg-red-500' : 'bg-green-500'} rounded-full animate-pulse`}></div>
              <div>
                <p className="font-medium text-foreground">WhatsApp API</p>
                <p className="text-sm text-muted-foreground">{tokenExpired ? 'Token Expired' : 'Connected'}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium text-foreground">AI Model</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium text-foreground">Webhook</p>
                <p className="text-sm text-muted-foreground">Listening</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Recent WhatsApp Logs */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent System Logs</CardTitle>
          <CardDescription>Recent WhatsApp system events and errors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[300px] overflow-y-auto">
            {logsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading logs...</p>
            ) : logsQuery.error ? (
              <p className="text-sm text-red-500">Error loading logs</p>
            ) : !Array.isArray(logsQuery.data) ? (
              <p className="text-sm text-red-500">Invalid logs data format</p>
            ) : logsQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No logs found</p>
            ) : (
              logsQuery.data.slice(0, 10).map((log: WhatsAppLog) => (
                <div key={log.id} className="border-b pb-2">
                  <div className="flex justify-between items-start">
                    <Badge variant={log.status === 'error' ? 'destructive' : log.status === 'warning' ? 'warning' : 'secondary'}>
                      {(log.status || 'INFO').toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{log.aiResponse || log.action || 'No message'}</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" onClick={() => logsQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Logs
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
