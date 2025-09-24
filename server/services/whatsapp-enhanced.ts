import { storage } from "../storage";
import { imageRecognitionService } from "./image-recognition";
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import sharp from 'sharp';

// Enhanced conversation state interface
interface ConversationState {
  userId: string;
  userName?: string;
  userPhone: string;
  currentFlow: 'idle' | 'awaiting_name' | 'adding_stock' | 'creating_order' | 'collecting_order_details' | 'awaiting_invoice';
  
  // For stock addition flow
  pendingStockAddition?: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    currentStock: number;
    awaitingConfirmation: boolean;
  };
  
  // For image-based product identification
  pendingImageProcessing?: {
    imageUrl: string;
    processingStarted: boolean;
    awaitingProductSelection?: boolean;
    candidates?: Array<{
      productId: string;
      productName: string;
      sku: string;
      confidence: number;
    }>;
  };
  
  // For order creation flow
  pendingOrder?: {
    items: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice?: number;
    }>;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    containerNumber?: string;
    jobId?: string;
    purchaserName?: string;
    step: 'collecting_items' | 'collecting_customer_info' | 'confirming_order' | 'processing' | 'awaiting_backorder_choice';
    currentQuestion?: string;
    pendingItem?: {
      product: any;
      requestedQuantity: number;
      availableQuantity: number;
    };
  };
  
  // For purchase invoice flow
  awaiting_invoice?: boolean;
  pendingPurchaseId?: string;
  
  lastMessageTime: Date;
  messageCount: number;
  lastContext?: {
    type: string;
    productId?: string;
    productName?: string;
    timestamp: Date;
  };
}

export class EnhancedWhatsAppService {
  private webhookToken: string;
  private accessToken: string;
  private phoneNumberId: string;
  private graphVersion: string;
  private conversations: Map<string, ConversationState> = new Map();
  private uploadDir: string;

  constructor() {
    this.webhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN || "";
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";
    this.uploadDir = path.join(process.cwd(), 'uploads', 'purchases');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // Get or create conversation state
  private getConversationState(userPhone: string): ConversationState {
    if (!this.conversations.has(userPhone)) {
      this.conversations.set(userPhone, {
        userId: userPhone,
        userPhone,
        currentFlow: 'idle',
        lastMessageTime: new Date(),
        messageCount: 0
      });
    }
    return this.conversations.get(userPhone)!;
  }

  // Parse user intent from message
  private async detectIntent(message: string, state: ConversationState): Promise<{
    intent: 'add_stock' | 'create_order' | 'check_stock' | 'select_product' | 'unknown';
    confidence: number;
  }> {
    const msg = message.toLowerCase().trim();
    
    // Check for stock addition keywords
    if (/\b(add|put|insert|stock in|received|adding)\b.*\b(stock|inventory|units?|pieces?)\b/i.test(msg) ||
        /\b\d+\s*(units?|pieces?|pcs?)\s*(of\s+)?.*\s*(add|put|stock|inventory)/i.test(msg)) {
      return { intent: 'add_stock', confidence: 0.9 };
    }
    
    // Check for order creation keywords
    if (/\b(order|buy|purchase)\b/i.test(msg) ||
        /\b(create|place|make)\s*(an?\s+)?order\b/i.test(msg) ||
        /\bI\s+(want|need)\s+to\s+(order|buy|purchase)\b/i.test(msg)) {
      return { intent: 'create_order', confidence: 0.9 };
    }
    
    // Check for stock inquiry
    if (/\b(check|show|display|what|how much|how many)\b.*\b(stock|inventory|available)\b/i.test(msg)) {
      return { intent: 'check_stock', confidence: 0.8 };
    }
    
    // Check for product selection (from image recognition results)
    if (state.pendingImageProcessing?.awaitingProductSelection && /^\d+$/.test(msg.trim())) {
      return { intent: 'select_product', confidence: 0.9 };
    }
    
    return { intent: 'unknown', confidence: 0 };
  }

  // Extract product and quantity from message
  private async extractProductAndQuantity(message: string): Promise<{
    productName?: string;
    quantity?: number;
    product?: any;
  }> {
    // Extract quantity
    const quantityMatch = message.match(/(\d+)\s*(units?|pieces?|pcs?|nos?\.?)/i);
    const quantity = quantityMatch ? parseInt(quantityMatch[1]) : undefined;
    
    // Extract product name - remove quantity and action words
    let productName = message
      .replace(/\d+\s*(units?|pieces?|pcs?|nos?\.?)/gi, '')
      .replace(/\b(add|put|insert|stock|inventory|order|want|need|buy|place|i|to|for|of|in|from|the|also|and)\b/gi, '')
      .replace(/^\s*only\s*/i, '') // Remove "only" at the beginning
      .replace(/\s+anyway\s*$/i, '') // Remove "anyway" at the end
      .trim();
    
    // Clean up multiple spaces
    productName = productName.replace(/\s+/g, ' ').trim();
    
    // Search for product in database
    let product = undefined;
    if (productName && productName.length > 0) {
      // First try exact search
      const products = await storage.searchProducts(productName);
      if (products.length > 0) {
        // If multiple products found, try to find best match
        const exactMatch = products.find(p => 
          p.name.toLowerCase() === productName.toLowerCase() ||
          p.name.toLowerCase().includes(productName.toLowerCase())
        );
        product = exactMatch || products[0];
      } else {
        // Try fuzzy search
        const fuzzyProducts = await storage.searchProductsFuzzy(productName);
        if (fuzzyProducts.length > 0) {
          product = fuzzyProducts[0];
        }
      }
    }
    
    return { productName, quantity, product };
  }

  // Handle stock addition flow
  private async handleStockAddition(userPhone: string, message: string, state: ConversationState): Promise<string> {
    // Check if we're awaiting user name
    if (state.currentFlow === 'awaiting_name' && state.pendingStockAddition) {
      state.userName = message.trim();
      state.currentFlow = 'adding_stock';
      state.pendingStockAddition.awaitingConfirmation = true;
      
      const { productName, quantity, currentStock } = state.pendingStockAddition;
      return `Thank you, ${state.userName}! 👤\n\n` +
             `📦 Confirming stock addition:\n` +
             `Product: ${productName}\n` +
             `Adding: ${quantity} units\n` +
             `Current stock: ${currentStock} units\n` +
             `New stock will be: ${currentStock + quantity} units\n\n` +
             `Reply with "yes" to confirm or "no" to cancel.`;
    }
    
    // Check if we're confirming a pending stock addition
    if (state.pendingStockAddition?.awaitingConfirmation) {
      if (/^(yes|y|confirm|ok|correct)$/i.test(message.trim())) {
        const { productId, productName, quantity, currentStock } = state.pendingStockAddition;
        
        try {
          // Update stock in database
          const product = await storage.getProduct(productId);
          if (!product) {
            throw new Error(`Product not found: ${productId}`);
          }
          
          const newTotal = (product.stockTotal || 0) + quantity;
          const newAvailable = (product.stockAvailable || 0) + quantity;
          
          await storage.updateProduct(productId, {
            stockTotal: newTotal,
            stockAvailable: newAvailable,
          });
          
          // Create stock movement record
          await storage.createStockMovement({
            productId,
            action: "add",
            quantity,
            previousStock: currentStock,
            newStock: newAvailable,
            reason: `Stock added via WhatsApp by ${state.userName || userPhone}`,
          });
          
          // Create purchase record
          const purchaseItem = {
            productId,
            productName,
            sku: product.sku || '',
            quantity,
            unitPrice: 0,
            total: 0,
          };
          
          const purchase = await storage.createPurchase({
            userId: state.userPhone,
            items: [purchaseItem],
            totalAmount: 0,
            status: 'pending',
            notes: `Stock added by ${state.userName || state.userPhone}`
          });
          
          // Set state for invoice
          state.awaiting_invoice = true;
          state.pendingPurchaseId = purchase.id;
          
          // Log the transaction
          await storage.createWhatsappLog({
            userPhone,
            productId,
            action: "stock_added",
            quantity,
            aiResponse: `Added ${quantity} units by ${state.userName}`,
            status: "processed"
          });
          
          // Clear pending stock addition
          state.pendingStockAddition = undefined;
          state.currentFlow = 'idle';
          
          return `✅ Stock successfully updated!\n\n` +
                 `📦 Product: ${productName}\n` +
                 `Added: ${quantity} units\n` +
                 `New stock level: ${newAvailable} units\n` +
                 `Updated by: ${state.userName}\n` +
                 `Time: ${new Date().toLocaleString()}\n\n` +
                 `Please send the invoice image to confirm the purchase details.`;
        } catch (error: any) {
          console.error("Error updating stock:", error);
          const errorMsg = (error as Error).message || 'Unknown error';
          
          // Log the failed attempt
          await storage.createWhatsappLog({
            userPhone,
            productId: state.pendingStockAddition?.productId || null,
            action: "stock_add_failed",
            quantity: state.pendingStockAddition?.quantity || null,
            aiResponse: `Failed to add ${state.pendingStockAddition?.quantity || 0} units: ${errorMsg}`,
            status: "failed"
          });
          
          // Clear pending state
          state.pendingStockAddition = undefined;
          state.currentFlow = 'idle';
          
          return `❌ Failed to update stock\n\n` +
                 `Product: ${state.pendingStockAddition?.productName}\n` +
                 `Error: ${errorMsg}\n\n` +
                 `Please try again or contact support if the problem persists.`;
        }
      } else if (/^(no|n|cancel|stop)$/i.test(message.trim())) {
        if (state.awaiting_invoice && state.pendingPurchaseId) {
          await storage.updatePurchase(state.pendingPurchaseId, { status: 'cancelled' });
          state.awaiting_invoice = false;
          state.pendingPurchaseId = undefined;
        }
        state.pendingStockAddition = undefined;
        state.currentFlow = 'idle';
        return `❌ Stock addition cancelled. How can I help you?`;
      }
    }
    
    // Extract product and quantity from message
    const { productName, quantity, product } = await this.extractProductAndQuantity(message);
    
    if (!product && !productName) {
      return `❓ I couldn't understand your request. Please specify:\n` +
             `- Product name or SKU\n` +
             `- Quantity to add\n\n` +
             `Example: "Add 50 units of socket plugs"`;
    }
    
    // Set up pending stock addition
    state.pendingStockAddition = {
      productId: product?.id || '',
      productName: product?.name || productName || '',
      sku: product?.sku || '',
      quantity: quantity || 0,
      currentStock: product?.stockAvailable || 0,
      awaitingConfirmation: false
    };
    
    // Check if we have user name
    if (!state.userName) {
      state.currentFlow = 'awaiting_name';
      return `📦 Found product: ${state.pendingStockAddition.productName} (SKU: ${state.pendingStockAddition.sku})\n` +
             `Current stock: ${state.pendingStockAddition.currentStock} units\n` +
             `You want to add: ${state.pendingStockAddition.quantity} units\n\n` +
             `Please tell me your name for the record:`;
    }
    
    // We have everything, ask for confirmation
    state.pendingStockAddition.awaitingConfirmation = true;
      await this.sendInteractiveButtons(
        userPhone,
        `📦 Stock Addition Request\n\n` +
        `Product: ${state.pendingStockAddition.productName} (SKU: ${state.pendingStockAddition.sku})\n` +
        `Current: ${state.pendingStockAddition.currentStock} • Add: ${state.pendingStockAddition.quantity} • New: ${state.pendingStockAddition.currentStock + state.pendingStockAddition.quantity}`,
        [
          { id: "stock:confirm", title: "Confirm" },
          { id: "stock:cancel", title: "Cancel" }
        ],
        "Confirm Stock Addition"
      );
      return "";
  }
  
  // Handle order creation flow
  private async handleOrderCreation(userPhone: string, message: string, state: ConversationState): Promise<string> {
    // Initialize order if not exists
    if (!state.pendingOrder) {
      state.pendingOrder = {
        items: [],
        step: 'collecting_items'
      };
    }
    
    const order = state.pendingOrder;
    
    // Handle different order steps
    switch (order.step) {
      case 'awaiting_backorder_choice': {
        // Handle backorder choice
        if (!order.pendingItem) {
          order.step = 'collecting_items';
          return `Please specify the product and quantity.\n` +
                 `Example: "50 units of socket plugs"`;
        }
        
        const choice = message.trim();
        const { product, requestedQuantity, availableQuantity } = order.pendingItem;
        
        if (choice === '1' || /^order.*available/i.test(message)) {
          // Order available stock only
          order.items.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: availableQuantity,
            unitPrice: product.price
          });
          order.pendingItem = undefined;
          order.step = 'collecting_items';
          
          const itemsList = order.items.map((item, i) => 
            `${i + 1}. ${item.productName} - ${item.quantity} units`
          ).join('\n');
          
          return `✅ Added to order:\n${product.name} - ${availableQuantity} units (available stock)\n\n` +
                 `📋 Current order:\n${itemsList}\n\n` +
                 `Add more items or type "done" to proceed with checkout.`;
        } else if (choice === '2' || /^(place|order).*anyway|backorder/i.test(message)) {
          // Place backorder for requested quantity
          order.items.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: requestedQuantity,
            unitPrice: product.price
          });
          order.pendingItem = undefined;
          order.step = 'collecting_items';
          
          const itemsList = order.items.map((item, i) => 
            `${i + 1}. ${item.productName} - ${item.quantity} units`
          ).join('\n');
          
          return `✅ Added to order:\n${product.name} - ${requestedQuantity} units (BACKORDER)\n\n` +
                 `📋 Current order:\n${itemsList}\n\n` +
                 `⚠️ Note: This item will be on backorder as requested quantity exceeds available stock.\n\n` +
                 `Add more items or type "done" to proceed with checkout.`;
        } else if (choice === '3' || /^cancel/i.test(message)) {
          // Cancel this item
          order.pendingItem = undefined;
          order.step = 'collecting_items';
          return `Item cancelled.\n\n` +
                 (order.items.length > 0 
                   ? `📋 Current order has ${order.items.length} item(s).\nAdd more items or type "done" to proceed.`
                   : `What would you like to order?`);
        } else {
          // Invalid choice
          return `Please choose:\n` +
                 `Reply "1" for ${availableQuantity} units (available stock)\n` +
                 `Reply "2" for ${requestedQuantity} units (backorder)\n` +
                 `Reply "3" to cancel this item`;
        }
      }
      
      case 'collecting_items': {
        // Check if user wants to proceed with collected items
        if (order.items.length > 0 && /^(yes|y|done|proceed|next)$/i.test(message.trim())) {
          order.step = 'collecting_customer_info';
          order.currentQuestion = 'customer_name';
          return `Great! I need some details for the order.\n\n` +
                 `Please provide the customer's name:`;
        }
        
        // Try to extract product and quantity
        const { product, quantity } = await this.extractProductAndQuantity(message);
        
        if (product && quantity) {
          // Check stock availability
          const available = product.stockAvailable || 0;
          if (available < quantity) {
            // Store pending item and switch to backorder choice state
            order.pendingItem = {
              product,
              requestedQuantity: quantity,
              availableQuantity: available
            };
            order.step = 'awaiting_backorder_choice';
            
            await this.sendInteractiveButtons(
              userPhone,
              `⚠️ Limited stock!\n\n` +
              `Product: ${product.name}\nRequested: ${quantity} • Available: ${available}`,
              [
                { id: "order:available", title: `Order ${available}` },
                { id: "order:backorder", title: `Backorder ${quantity}` },
                { id: "order:cancel", title: "Cancel Item" }
              ],
              "Choose an option"
            );
            return "";
          }
          
          // Add to order - stock is sufficient
          order.items.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku || 'NA',
            quantity,
            unitPrice: product.price
          });
          
          const itemsList = order.items.map((item, i) => 
            `${i + 1}. ${item.productName} - ${item.quantity} units`
          ).join('\n');
          
          return `✅ Added to order:\n${product.name} - ${quantity} units\n\n` +
                 `📋 Current order:\n${itemsList}\n\n` +
                 `Add more items or type "done" to proceed with checkout.`;
        }
        
        return `Please specify the product and quantity.\n` +
               `Example: "50 units of socket plugs"`;
      }
      
      case 'collecting_customer_info': {
        // Handle customer information collection
        if (order.currentQuestion === 'customer_name') {
          order.customerName = message.trim();
          order.currentQuestion = 'customer_phone';
          return `Customer name: ${order.customerName}\n\n` +
                 `Please provide the customer's phone number:`;
        }
        
        if (order.currentQuestion === 'customer_phone') {
          order.customerPhone = message.trim();
          order.currentQuestion = 'customer_email';
          return `Phone: ${order.customerPhone}\n\n` +
                 `Please provide the customer's email (or type "skip"):`;
        }
        
        if (order.currentQuestion === 'customer_email') {
          if (message.toLowerCase() !== 'skip') {
            order.customerEmail = message.trim();
          }
          order.currentQuestion = 'container_number';
          return `Please provide the container number:`;
        }
        
        if (order.currentQuestion === 'container_number') {
          order.containerNumber = message.trim();
          order.currentQuestion = 'job_id';
          return `Container: ${order.containerNumber}\n\n` +
                 `Please provide the job ID:`;
        }
        
        if (order.currentQuestion === 'job_id') {
          order.jobId = message.trim();
          order.currentQuestion = 'purchaser_name';
          return `Job ID: ${order.jobId}\n\n` +
                 `Please provide your name (person placing this order):`;
        }
        
        if (order.currentQuestion === 'purchaser_name') {
          order.purchaserName = message.trim();
          order.step = 'confirming_order';
          
          // Build order summary
          const itemsList = order.items.map((item, i) => 
            `${i + 1}. ${item.productName} (${item.sku}) - ${item.quantity} units`
          ).join('\n');
          
          await this.sendInteractiveButtons(
            userPhone,
            `📋 ORDER SUMMARY\n\n` +
            `Items:\n${itemsList}\n\n` +
            `Customer: ${order.customerName}\nPhone: ${order.customerPhone}\nEmail: ${order.customerEmail || 'Not provided'}\nContainer: ${order.containerNumber}\nJob ID: ${order.jobId}\nOrdered by: ${order.purchaserName}`,
            [
              { id: "order:confirm", title: "Confirm Order" },
              { id: "order:abort", title: "Cancel" }
            ],
            "Review and confirm"
          );
          return "";
        }
        break;
      }
      
      case 'confirming_order': {
        if (/^(confirm|yes|y|ok|place order)$/i.test(message.trim())) {
          // Create the order in database
          try {
            // First, create or find customer
            let customer = (await storage.getCustomers()).find(c => c.phone === order.customerPhone || c.name === order.customerName);
            
            if (!customer) {
              customer = await storage.createCustomer({
                name: order.customerName!,
                phone: order.customerPhone,
                email: order.customerEmail
              });
            }
            
            // Calculate subtotal and total
            const subtotal = order.items.reduce((sum, item) => sum + (item.quantity * Number(item.unitPrice || 0)), 0);
            const tax = 0;
            const total = subtotal + tax;
            
            // Pre-compute approval status with await
            let needsApproval = false;
            for (const item of order.items) {
              const product = await storage.getProduct(item.productId);
              if (product && (product.stockAvailable || 0) < item.quantity) {
                needsApproval = true;
                break;
              }
            }
            
            // Create order items with await
            const orderItems = [];
            for (const item of order.items) {
              const product = await storage.getProduct(item.productId);
              if (product) {
                orderItems.push({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: Number(product.price || 0).toString(),
                  totalPrice: (item.quantity * Number(product.price || 0)).toString()
                });
              } else {
                throw new Error(`Product not found: ${item.productId}`);
              }
            }
            
            // Create order
            const newOrder = await storage.createOrder({
              customerId: customer.id,
              customerName: order.customerName!,
              customerEmail: order.customerEmail,
              customerPhone: order.customerPhone,
              containerNumber: order.containerNumber,
              jobOrder: order.jobId,
              status: "pending",
              approvalStatus: needsApproval ? "needs_approval" : "pending",
              subtotal: subtotal.toString(),
              tax: tax.toString(),
              total: total.toString(),
              notes: `Order placed via WhatsApp by ${order.purchaserName}\nContainer: ${order.containerNumber}\nJob ID: ${order.jobId}`
            }, orderItems);
            
            // Log without meta
            await storage.createWhatsappLog({
              userPhone,
              action: "order_created",
              aiResponse: `Order ${newOrder.orderNumber} created`,
              status: "processed"
            });
            
            // Clear state
            state.pendingOrder = undefined;
            state.currentFlow = 'idle';
            
            return `✅ ORDER PLACED SUCCESSFULLY!\n\n` +
                   `Order Number: ${newOrder.orderNumber}\n` +
                   `Customer: ${order.customerName}\n` +
                   `Items: ${order.items.length}\n` +
                   `Status: ${newOrder.approvalStatus === "needs_approval" ? "⚠️ Pending Approval (Low Stock)" : "✅ Confirmed"}\n\n` +
                   `You will receive updates about this order.\n` +
                   `Thank you for using StockSmartHub!`;
          } catch (error) {
            console.error("Error creating order:", error);
            const errorMsg = (error as Error).message || 'Unknown error';
            
            await storage.createWhatsappLog({
              userPhone,
              action: "order_create_failed",
              aiResponse: `Failed to create order: ${errorMsg}`,
              status: "failed"
            });
            
            return `❌ Sorry, there was an error creating the order. Please try again or contact support.`;
          }
        }
        
        if (/^(cancel|no|abort|stop)$/i.test(message.trim())) {
          state.pendingOrder = undefined;
          state.currentFlow = 'idle';
          return `❌ Order cancelled. How can I help you?`;
        }
        
        return `Please reply "confirm" to place the order or "cancel" to abort.`;
      }
    }
    
    return `Something went wrong. Please start over.`;
  }
  
  // Handle image message
  async handleImageMessage(userPhone: string, imageUrl: string): Promise<void> {
    try {
      const state = this.getConversationState(userPhone);
      state.messageCount++;
      state.lastMessageTime = new Date();
      
      // Initialize image processing state
      state.pendingImageProcessing = {
        imageUrl,
        processingStarted: false
      };
      
      // Send initial processing message
      await this.sendWhatsAppMessage(userPhone, 
        "🔍 I'm analyzing your image to identify the product. Please wait a moment...");
      
      try {
        // Process the image
        state.pendingImageProcessing.processingStarted = true;
        const result = await imageRecognitionService.processImageFromUrl(imageUrl);
        
        // Log the image processing attempt
        await storage.createWhatsappLog({
          userPhone,
          imageUrl,
          action: "image_processing",
          aiResponse: `Processed image with ${result.matches.length} matches`,
          status: result.success ? "processed" : "failed",
          confidence: result.matches.length > 0 ? result.matches[0].confidence.toString() : null
        });
        
        if (!result.success) {
          // Create a clean error message without potentially long error details
          let errorMsg = `❌ Sorry, I couldn't process your image properly.\n\n`;
          
          // Only add short, user-friendly error details
          if (result.error && result.error.length < 100 && !result.error.includes('data:image')) {
            errorMsg += `Error: ${result.error}\n\n`;
          }
          
          errorMsg += `Please try sending a clearer image or describe the product in text.`;
          
          await this.sendWhatsAppMessage(userPhone, errorMsg);
          return;
        }
        
        if (result.matches.length === 0) {
          let response = "❓ I couldn't identify any products from your image.\n\n";
          response += "Please try:\n" +
                     "• Sending a clearer image\n" +
                     "• Describing the product in text\n" +
                     "• Including product labels or SKU in the image\n\n" +
                     "How can I help you with inventory management?";
          
          await this.sendWhatsAppMessage(userPhone, response);
          state.pendingImageProcessing = undefined;
          return;
        }
        
        // If we have matches, present them to the user
        if (result.matches.length === 1 && result.matches[0].confidence > 0.8) {
          // High confidence single match - proceed directly
          const match = result.matches[0];
          await this.handleProductIdentified(userPhone, match.productId, state);
        } else {
          // Multiple matches or low confidence - let user choose
          state.pendingImageProcessing.candidates = result.matches.slice(0, 5).map(m => ({
            productId: m.productId,
            productName: m.productName,
            sku: m.sku,
            confidence: m.confidence
          }));
          state.pendingImageProcessing.awaitingProductSelection = true;
          
          const rows = result.matches.slice(0, 10).map((m, idx) => ({
            id: `product:select:${m.productId}`,
            title: `${m.productName}`,
            description: `SKU: ${m.sku} • ${Math.round(m.confidence * 100)}%`
          }));
          await this.sendInteractiveList(
            userPhone,
            "🎯 I found these possible matches for your image:",
            rows,
            "Select",
            "Matched Products",
            "Select a product",
            "If none match, reply 'none'"
          );
        }
        
      } catch (processingError) {
        console.error("Error processing image:", processingError);
        await this.sendWhatsAppMessage(userPhone,
          "❌ Sorry, I encountered an error while processing your image. Please try again or describe the product in text.");
        state.pendingImageProcessing = undefined;
      }
      
      // Log conversation
      const conversation = await storage.getOrCreateConversation(userPhone);
      await storage.addWhatsappMessage({
        conversationId: conversation.id,
        direction: "outbound",
        sender: "ai",
        body: "Image processing completed",
        meta: { imageUrl, state }
      });
      
    } catch (error) {
      console.error("Error handling image message:", error);
      await this.sendWhatsAppMessage(userPhone,
        "Sorry, I encountered an error processing your image. Please try again.");
    }
  }
  
  // Handle when a product is identified (either from image or selection)
  private async handleProductIdentified(userPhone: string, productId: string, state: ConversationState): Promise<void> {
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        await this.sendWhatsAppMessage(userPhone, "❌ Product not found. Please try again.");
        return;
      }
      
      // Clear image processing state
      state.pendingImageProcessing = undefined;
      
      // Present product information and action options with buttons
      const response = `✅ Product Identified:\n\n` +
                      `📦 *${product.name}*\n` +
                      `SKU: ${product.sku}\n` +
                      `Available: ${product.stockAvailable || 0} | Total: ${product.stockTotal || 0}`;
      await this.sendInteractiveButtons(
        userPhone,
        response,
        [
          { id: `product:add:${product.id}`, title: "Add Stock" },
          { id: `product:order:${product.id}`, title: "Create Order" },
          { id: `product:check:${product.id}`, title: "Check Stock" }
        ],
        "Choose an action"
      );
      
      // Store context for next message
      state.lastContext = {
        type: 'product_identified',
        productId: product.id,
        productName: product.name,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error("Error handling product identification:", error);
      await this.sendWhatsAppMessage(userPhone,
        "Sorry, I encountered an error. Please try again.");
    }
  }
  
  // Handle product selection from image recognition results
  private async handleProductSelection(userPhone: string, selectionText: string, state: ConversationState): Promise<string> {
    if (!state.pendingImageProcessing?.candidates || !state.pendingImageProcessing.awaitingProductSelection) {
      return "❓ No product selection in progress. Please send an image first.";
    }
    
    const trimmed = selectionText.trim().toLowerCase();
    
    if (trimmed === 'none' || trimmed === 'cancel') {
      state.pendingImageProcessing = undefined;
      return "❌ Product selection cancelled. How can I help you?";
    }
    
    const selection = parseInt(trimmed);
    if (isNaN(selection) || selection < 1 || selection > state.pendingImageProcessing.candidates.length) {
      return `Please reply with a number between 1 and ${state.pendingImageProcessing.candidates.length}, or 'none' to cancel.`;
    }
    
    const selectedProduct = state.pendingImageProcessing.candidates[selection - 1];
    await this.handleProductIdentified(userPhone, selectedProduct.productId!, state);
    
    return "Product selected successfully! What would you like to do next?";
  }
  
  // Main message handler
  async handleTextMessage(userPhone: string, messageText: string): Promise<void> {
    try {
      const state = this.getConversationState(userPhone);
      state.messageCount++;
      state.lastMessageTime = new Date();
      
      const message = messageText.trim();
      let response = '';
      
      // Check if we're in the middle of a flow
      if (state.currentFlow === 'awaiting_name' || 
          state.currentFlow === 'adding_stock' || 
          state.pendingStockAddition?.awaitingConfirmation) {
        response = await this.handleStockAddition(userPhone, message, state);
      } else if (state.currentFlow === 'creating_order' || 
                 state.currentFlow === 'collecting_order_details' ||
                 state.pendingOrder) {
        response = await this.handleOrderCreation(userPhone, message, state);
      } else if (state.pendingImageProcessing?.awaitingProductSelection) {
        response = await this.handleProductSelection(userPhone, message, state);
      } else {
        // Check if this is a follow-up to product identification
        if (state.lastContext?.type === 'product_identified') {
          const contextResponse = await this.handleProductContextMessage(userPhone, message, state);
          if (contextResponse) {
            response = contextResponse;
          } else {
            // Fall through to normal intent detection
            const { intent } = await this.detectIntent(message, state);
            response = await this.handleIntentBasedMessage(userPhone, message, state, intent);
          }
        } else {
          // Normal intent detection
          const { intent } = await this.detectIntent(message, state);
          response = await this.handleIntentBasedMessage(userPhone, message, state, intent);
        }
      }
      
      // Send response only if non-empty
      if (response && response.trim().length > 0) {
        await this.sendWhatsAppMessage(userPhone, response);
      } else {
        console.log(`Skipping empty response for ${userPhone}`);
      }
      
      // Log conversation
      const conversation = await storage.getOrCreateConversation(userPhone);
      await storage.addWhatsappMessage({
        conversationId: conversation.id,
        direction: "outbound",
        sender: "ai",
        body: response,
        meta: { state }
      });
      
    } catch (error) {
      console.error("Error handling text message:", error);
      await this.sendWhatsAppMessage(userPhone, 
        "Sorry, I encountered an error. Please try again or contact support.");
    }
  }
  
  // Handle intent-based messages
  private async handleIntentBasedMessage(userPhone: string, message: string, state: ConversationState, intent: string): Promise<string> {
    switch (intent) {
      case 'add_stock':
        state.currentFlow = 'adding_stock';
        return await this.handleStockAddition(userPhone, message, state);
        
      case 'create_order':
        state.currentFlow = 'creating_order';
        return await this.handleOrderCreation(userPhone, message, state);
        
      case 'select_product':
        return await this.handleProductSelection(userPhone, message, state);
        
      case 'check_stock': {
        const { product } = await this.extractProductAndQuantity(message);
        if (product) {
          return `📦 Stock Information:\n` +
                `Product: ${product.name}\n` +
                `SKU: ${product.sku}\n` +
                `Available: ${product.stockAvailable || 0} units\n` +
                `Total: ${product.stockTotal || 0} units\n` +
                `Reserved: ${product.stockUsed || 0} units\n\n` +
                `What would you like to do?`;
        } else {
          return `Please specify which product you want to check.\n` +
                `Example: "Check stock for socket plugs"`;
        }
      }
        
      default:
        await this.sendMainMenu(userPhone);
        return "";
    }
  }
  
  // Handle product context messages (after product identification)
  private async handleProductContextMessage(userPhone: string, message: string, state: ConversationState): Promise<string | null> {
    if (!state.lastContext || state.lastContext.type !== 'product_identified') {
      return null;
    }
    
    const productId = state.lastContext.productId;
    const msg = message.toLowerCase().trim();
    
    // Check for add stock commands
    if (msg.includes('add') || msg.includes('stock')) {
      const quantityMatch = message.match(/(\d+)/);
      if (quantityMatch) {
        const quantity = parseInt(quantityMatch[1]);
        // Trigger stock addition flow
        state.currentFlow = 'adding_stock';
        state.lastContext = undefined; // Clear context
        return await this.initiateStockAddition(userPhone, productId, quantity, state);
      } else {
        return "Please specify the quantity to add. Example: 'add 25 units'";
      }
    }
    
    // Check for order commands
    if (msg.includes('order') || msg.includes('buy')) {
      const quantityMatch = message.match(/(\d+)/);
      if (quantityMatch) {
        const quantity = parseInt(quantityMatch[1]);
        // Trigger order creation flow
        state.currentFlow = 'creating_order';
        state.lastContext = undefined; // Clear context
        return await this.initiateOrderCreation(userPhone, productId, quantity, state);
      } else {
        return "Please specify the quantity to order. Example: 'order 10 units'";
      }
    }
    
    // Check for stock check commands
    if (msg.includes('check') || msg.includes('stock') || msg.includes('info')) {
      state.lastContext = undefined; // Clear context
      const product = await storage.getProduct(productId);
      if (product) {
        return `📊 Detailed Stock Information:\n\n` +
               `📦 *${product.name}*\n` +
               `SKU: ${product.sku}\n` +
               `Type: ${product.type || 'N/A'}\n` +
               `Description: ${product.description || 'No description'}\n\n` +
               `📈 Stock Levels:\n` +
               `• Available: ${product.stockAvailable || 0} units\n` +
               `• Total: ${product.stockTotal || 0} units\n` +
               `• Used: ${product.stockUsed || 0} units\n` +
               `• Min Level: ${product.minStockLevel || 0} units\n\n` +
               `💰 Price: $${product.price || 0}\n\n` +
               `What would you like to do next?`;
      } else {
        return "❌ Product not found.";
      }
    }
    
    // If no specific command recognized, keep context and ask for clarification
    return `I can help you with this product (*${state.lastContext.productName}*):\n` +
           `• Type "add [quantity]" to add stock\n` +
           `• Type "order [quantity]" to create an order\n` +
           `• Type "check" for detailed stock info\n\n` +
           `What would you like to do?`;
  }
  
  // Helper method to initiate stock addition for identified product
  private async initiateStockAddition(userPhone: string, productId: string, quantity: number, state: ConversationState): Promise<string> {
    if (!productId) {
      return "❌ No product selected. Please send an image or describe the product.";
    }
    
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        return "❌ Product not found.";
      }
      
      // Set up pending stock addition similar to text-based flow
      state.pendingStockAddition = {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity,
        currentStock: product.stockAvailable || 0,
        awaitingConfirmation: false
      };
      
      // Check if we have user name
      if (!state.userName) {
        state.currentFlow = 'awaiting_name';
        return `📦 Stock Addition Request:\n` +
               `Product: ${product.name} (SKU: ${product.sku})\n` +
               `Current stock: ${product.stockAvailable || 0} units\n` +
               `Adding: ${quantity} units\n\n` +
               `Please tell me your name for the record:`;
      }
      
      // We have everything, ask for confirmation
      state.pendingStockAddition.awaitingConfirmation = true;
      await this.sendInteractiveButtons(
        userPhone,
        `📦 Stock Addition Request\n\n` +
        `Product: ${product.name} (SKU: ${product.sku})\n` +
        `Current: ${product.stockAvailable || 0} • Add: ${quantity} • New: ${(product.stockAvailable || 0) + quantity}`,
        [
          { id: "stock:confirm", title: "Confirm" },
          { id: "stock:cancel", title: "Cancel" }
        ],
        "Confirm Stock Addition"
      );
      return "";
      
    } catch (error) {
      console.error('Error initiating stock addition:', error);
      return "❌ Error processing stock addition. Please try again.";
    }
  }
  
  // Helper method to initiate order creation for identified product
  private async initiateOrderCreation(userPhone: string, productId: string, quantity: number, state: ConversationState): Promise<string> {
    if (!productId) {
      return "❌ No product selected. Please send an image or describe the product.";
    }
    
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        return "❌ Product not found.";
      }
      
      // Initialize order similar to text-based flow
      state.pendingOrder = {
        items: [],
        step: 'collecting_items'
      };
      
      // Check stock availability
      const available = product.stockAvailable || 0;
      if (available < quantity) {
        // Handle backorder scenario
        state.pendingOrder.pendingItem = {
          product,
          requestedQuantity: quantity,
          availableQuantity: available
        };
        state.pendingOrder.step = 'awaiting_backorder_choice';
        
        return `⚠️ Limited stock!\n` +
               `Product: ${product.name}\n` +
               `Requested: ${quantity} units\n` +
               `Available: ${available} units\n\n` +
               `Would you like to:\n` +
               `1. Order ${available} units (available stock)\n` +
               `2. Place order for ${quantity} units anyway (backorder)\n` +
               `3. Cancel this item`;
      }
      
      // Add to order - stock is sufficient
      state.pendingOrder.items.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku || 'NA',
        quantity,
        unitPrice: product.price
      });
      
      return `✅ Added to order:\n${product.name} - ${quantity} units\n\n` +
             `📋 Current order:\n1. ${product.name} - ${quantity} units\n\n` +
             `Add more items or type "done" to proceed with checkout.`;
      
    } catch (error) {
      console.error('Error initiating order creation:', error);
      return "❌ Error processing order creation. Please try again.";
    }
  }
  
  // Get WhatsApp media URL
  async getWhatsAppMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const url = `https://graph.facebook.com/${this.graphVersion}/${mediaId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });
      
      if (!response.ok) {
        console.error('Failed to get media URL:', await response.text());
        return null;
      }
      
      const data = await response.json();
      return data.url || null;
    } catch (error) {
      console.error('Error getting WhatsApp media URL:', error);
      return null;
    }
  }
  
  // Utility to ensure message fits WhatsApp limits
  private truncateMessage(text: string, maxLength: number = 3500): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    console.warn(`Message too long (${text.length} chars), truncating to ${maxLength}`);
    
    // Try to find a good breaking point
    const safeLength = maxLength - 50;
    const truncated = text.substring(0, safeLength);
    const lastNewline = truncated.lastIndexOf('\n');
    const lastSpace = truncated.lastIndexOf(' ');
    
    const breakPoint = lastNewline > safeLength - 200 ? lastNewline : 
                      lastSpace > safeLength - 100 ? lastSpace : safeLength;
    
    return text.substring(0, breakPoint) + '\n\n... (message truncated for length)';
  }

  // Send WhatsApp message
  async sendWhatsAppMessage(to: string, text: string): Promise<void> {
    try {
      // Ensure message is within WhatsApp limits
      const truncatedText = this.truncateMessage(text);
      if (!truncatedText || truncatedText.trim().length === 0) {
        console.warn(`Skipping empty message to ${to}`);
        return;
      }
      
      const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: truncatedText }
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WhatsApp API error: ${error}`);
      }
      
      console.log(`Message sent to ${to}`);
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
      throw error;
    }
  }
  
  // Send WhatsApp image
  private async sendWhatsAppImage(to: string, imageUrl: string, caption?: string): Promise<void> {
    try {
      const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "image",
          image: { link: imageUrl },
          caption: caption || ''
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WhatsApp API error: ${error}`);
      }
      
      console.log(`Image sent to ${to}`);
    } catch (error: any) {
      console.error("Error sending WhatsApp image:", error);
    }
  }

  // Send WhatsApp interactive buttons
  private async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ): Promise<void> {
    try {
      const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          header: headerText ? { type: "text", text: headerText } : undefined,
          body: { text: this.truncateMessage(bodyText, 1024) },
          footer: footerText ? { text: footerText } : undefined,
          action: {
            buttons: buttons.slice(0, 3).map(b => ({
              type: "reply",
              reply: { id: b.id, title: b.title }
            }))
          }
        }
      } as any;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WhatsApp API error: ${error}`);
      }
    } catch (error) {
      console.error("Error sending interactive buttons:", error);
      // Fallback to text
      await this.sendWhatsAppMessage(to, bodyText + "\n\n(" + buttons.map(b => b.title).join(" | ") + ")");
    }
  }

  // Send WhatsApp interactive list
  private async sendInteractiveList(
    to: string,
    bodyText: string,
    rows: Array<{ id: string; title: string; description?: string }>,
    listButtonLabel: string = "Select",
    sectionTitle: string = "Options",
    headerText?: string,
    footerText?: string
  ): Promise<void> {
    try {
      const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: headerText ? { type: "text", text: headerText } : undefined,
          body: { text: this.truncateMessage(bodyText, 1024) },
          footer: footerText ? { text: footerText } : undefined,
          action: {
            button: listButtonLabel,
            sections: [
              {
                title: sectionTitle,
                rows: rows.slice(0, 10).map(r => ({ id: r.id, title: r.title, description: r.description }))
              }
            ]
          }
        }
      } as any;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WhatsApp API error: ${error}`);
      }
    } catch (error) {
      console.error("Error sending interactive list:", error);
      // Fallback to text
      await this.sendWhatsAppMessage(to, bodyText + "\n\n" + rows.map(r => `- ${r.title}`).join('\n'));
    }
  }

  // Send Main Menu quick actions
  private async sendMainMenu(to: string): Promise<void> {
    await this.sendInteractiveButtons(
      to,
      "How can I help you today?",
      [
        { id: "main:add_stock", title: "Add Stock" },
        { id: "main:create_order", title: "Create Order" },
        { id: "main:check_stock", title: "Check Stock" }
      ],
      "StockSmartHub",
      "Choose an action"
    );
  }
  
  // Process incoming webhook
  async processIncomingMessage(messageData: any): Promise<void> {
    try {
      const value = messageData?.entry?.[0]?.changes?.[0]?.value;
      if (!value) return;
      
      const { messages, contacts } = value;
      if (!messages || messages.length === 0) return;
      
      const message = messages[0];
      const contact = contacts?.[0];
      const userPhone = contact?.wa_id;
      
      if (!userPhone) return;
      
      // Store message in conversation
      const conversation = await storage.getOrCreateConversation(userPhone);
      // Compose a readable body for logs
      const inboundBody = message.type === "text"
        ? (message.text?.body || "")
        : message.type === "interactive"
          ? (
            message.interactive?.button_reply?.title ||
            message.interactive?.list_reply?.title ||
            "[interactive]"
          )
          : `[${message.type}]`;

      await storage.addWhatsappMessage({
        conversationId: conversation.id,
        direction: "inbound",
        sender: "user",
        body: inboundBody,
        meta: message
      });
      
      // Handle message based on type
      if (message.type === "text") {
        await this.handleTextMessage(userPhone, message.text.body);
      } else if (message.type === "interactive") {
        await this.handleInteractiveReply(userPhone, message.interactive);
      } else if (message.type === "image") {
        const imageId = message.image?.id;
        if (imageId) {
          const imageUrl = await this.getWhatsAppMediaUrl(imageId);
          if (imageUrl) {
            const state = this.getConversationState(userPhone);
            
            if (state.awaiting_invoice && state.pendingPurchaseId) {
              // Handle invoice for purchase
              try {
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const imageBuffer = Buffer.from(response.data);
                
                // Save image
                const filename = `${state.pendingPurchaseId}_invoice_${Date.now()}.jpg`;
                const filepath = path.join(this.uploadDir, filename);
                await sharp(imageBuffer).jpeg({ quality: 90 }).toFile(filepath);
                
                const invoiceUrl = `/uploads/purchases/${filename}`;
                
                // Update purchase
                const updatedPurchase = await storage.updatePurchase(state.pendingPurchaseId, {
                  invoiceImageUrl: invoiceUrl,
                  status: 'confirmed'
                });
                
                // Log
                await storage.createWhatsappLog({
                  userPhone,
                  action: "purchase_confirmed",
                  aiResponse: `Invoice for purchase ${updatedPurchase.id} saved`,
                  status: "processed"
                });
                
                // Clear state
                state.awaiting_invoice = false;
                state.pendingPurchaseId = undefined;
                state.currentFlow = 'idle';
                
                // Send confirmation
                const responseMsg = `✅ Purchase confirmed with invoice!\n\n` +
                                   `Items: ${updatedPurchase.items.map(i => `${i.quantity} x ${i.productName} (${i.sku})`).join('\n')}\n` +
                                   `Total: ₹${updatedPurchase.totalAmount}\n` +
                                   `Invoice saved for records.\n\n` +
                                   `How can I help next?`;
                await this.sendWhatsAppMessage(userPhone, responseMsg);
                await this.sendWhatsAppImage(userPhone, `http://localhost:3000${invoiceUrl}`, 'Your invoice has been saved.');
                
                return;
              } catch (error: any) {
                console.error('Invoice processing failed:', error);
                await this.sendWhatsAppMessage(userPhone, '❌ Failed to process invoice. Please send the image again or contact support.');
                return;
              }
            } else {
              // Existing product image recognition
              await this.handleImageMessage(userPhone, imageUrl);
            }
          } else {
            await this.sendWhatsAppMessage(userPhone, '❌ Could not access image. Please try again.');
          }
        } else {
          await this.sendWhatsAppMessage(userPhone, '❌ No image data received. Please try sending the image again.');
        }
      }
      
    } catch (error) {
      console.error("Error processing incoming message:", error);
    }
  }

  // Handle interactive replies (buttons and lists)
  private async handleInteractiveReply(userPhone: string, interactive: any): Promise<void> {
    try {
      const state = this.getConversationState(userPhone);
      const type = interactive?.type;
      let id = "";
      let title = "";
      if (type === "button_reply") {
        id = interactive.button_reply?.id || "";
        title = interactive.button_reply?.title || "";
      } else if (type === "list_reply") {
        id = interactive.list_reply?.id || "";
        title = interactive.list_reply?.title || "";
      }

      if (!id) {
        console.warn("Interactive reply without id");
        return;
      }

      // Main menu actions
      if (id === "main:add_stock") {
        state.currentFlow = 'adding_stock';
        await this.sendWhatsAppMessage(userPhone, "Please type the product name and quantity to add. Example: 'Add 50 units of socket plugs'");
        return;
      }
      if (id === "main:create_order") {
        state.currentFlow = 'creating_order';
        await this.sendWhatsAppMessage(userPhone, "What would you like to order? Example: '10 units of socket plugs'");
        return;
      }
      if (id === "main:check_stock") {
        await this.sendWhatsAppMessage(userPhone, "Please type the product name to check stock. Example: 'Check stock for socket plugs'");
        return;
      }

      // Product actions with product id
      if (id.startsWith("product:add:")) {
        const productId = id.split(":")[2];
        state.lastContext = { type: 'product_identified', productId, timestamp: new Date() } as any;
        await this.sendWhatsAppMessage(userPhone, "Enter quantity to add. Example: 'add 25 units'");
        return;
      }
      if (id.startsWith("product:order:")) {
        const productId = id.split(":")[2];
        state.lastContext = { type: 'product_identified', productId, timestamp: new Date() } as any;
        state.currentFlow = 'creating_order';
        await this.sendWhatsAppMessage(userPhone, "Enter quantity to order. Example: 'order 10 units'");
        return;
      }
      if (id.startsWith("product:check:")) {
        const productId = id.split(":")[2];
        const product = await storage.getProduct(productId);
        if (product) {
          await this.sendWhatsAppMessage(userPhone,
            `📦 ${product.name} (SKU: ${product.sku})\nAvailable: ${product.stockAvailable || 0} | Total: ${product.stockTotal || 0}`);
        } else {
          await this.sendWhatsAppMessage(userPhone, "❌ Product not found.");
        }
        return;
      }
      if (id.startsWith("product:select:")) {
        const productId = id.split(":")[2];
        await this.handleProductIdentified(userPhone, productId, state);
        return;
      }

      // Stock confirmation
      if (id === "stock:confirm" || id === "stock:cancel") {
        if (!state.pendingStockAddition) {
          await this.sendWhatsAppMessage(userPhone, "No stock addition in progress.");
          return;
        }
        if (id === "stock:cancel") {
          if (state.awaiting_invoice && state.pendingPurchaseId) {
            await storage.updatePurchase(state.pendingPurchaseId, { status: 'cancelled' });
            state.awaiting_invoice = false;
            state.pendingPurchaseId = undefined;
          }
          state.pendingStockAddition = undefined;
          state.currentFlow = 'idle';
          await this.sendWhatsAppMessage(userPhone, "❌ Stock addition cancelled. How can I help you?");
          return;
        }
        // Confirm and apply stock addition
        const { productId, productName, quantity, currentStock } = state.pendingStockAddition;
        try {
          const product = await storage.getProduct(productId);
          if (!product) throw new Error(`Product not found: ${productId}`);
          const newTotal = (product.stockTotal || 0) + quantity;
          const newAvailable = (product.stockAvailable || 0) + quantity;
          await storage.updateProduct(productId, { stockTotal: newTotal, stockAvailable: newAvailable });
          await storage.createStockMovement({
            productId,
            action: "add",
            quantity,
            previousStock: currentStock,
            newStock: newAvailable,
            reason: `Stock added via WhatsApp by ${state.userName || userPhone}`,
          });
          const purchaseItem = { productId, productName, sku: product.sku || '', quantity, unitPrice: 0, total: 0 };
          const purchase = await storage.createPurchase({
            userId: state.userPhone,
            items: [purchaseItem],
            totalAmount: 0,
            status: 'pending',
            notes: `Stock added by ${state.userName || state.userPhone}`
          });
          state.awaiting_invoice = true;
          state.pendingPurchaseId = purchase.id;
          await storage.createWhatsappLog({ userPhone, productId, action: "stock_added", quantity, aiResponse: `Added ${quantity} units`, status: "processed" });
          state.pendingStockAddition = undefined;
          state.currentFlow = 'idle';
          await this.sendWhatsAppMessage(userPhone,
            `✅ Stock updated for ${productName}. New available: ${newAvailable}. Please send the invoice image to confirm.`);
        } catch (err: any) {
          await this.sendWhatsAppMessage(userPhone, `❌ Failed to update stock: ${(err as Error).message}`);
        }
        return;
      }

      // Backorder choice during order creation
      if (id === "order:available" || id === "order:backorder" || id === "order:cancel") {
        const choice = id === "order:available" ? "1" : id === "order:backorder" ? "2" : "3";
        const response = await this.handleOrderCreation(userPhone, choice, state);
        if (response && response.trim()) {
          await this.sendWhatsAppMessage(userPhone, response);
        }
        return;
      }

      // Order confirmation
      if (id === "order:confirm" || id === "order:abort") {
        const response = await this.handleOrderCreation(userPhone, id === "order:confirm" ? "confirm" : "cancel", state);
        if (response && response.trim()) {
          await this.sendWhatsAppMessage(userPhone, response);
        }
        return;
      }

      // Fallback
      console.log("Unhandled interactive id:", id, title);
    } catch (error) {
      console.error("Error handling interactive reply:", error);
    }
  }
  
  // Verify webhook
  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string | null> {
    if (mode === "subscribe" && token === this.webhookToken) {
      return challenge;
    }
    return null;
  }
}

export const enhancedWhatsAppService = new EnhancedWhatsAppService();
