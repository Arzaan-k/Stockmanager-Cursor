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
  currentFlow: 'idle' | 'awaiting_name' | 'adding_stock' | 'creating_order' | 'collecting_order_details' | 'awaiting_invoice' | 'checking_stock';
  
  // For stock addition flow
  pendingStockAddition?: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    currentStock: number;
    awaitingConfirmation: boolean;
    awaitingQuantity?: boolean;
    awaitingProductSelection?: boolean;
    candidates?: Array<{ productId: string; productName: string; sku: string }>
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
  private lastSendAtByRecipient: Map<string, number> = new Map();

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
    intent: 'add_stock' | 'create_order' | 'check_stock' | 'select_product' | 'list_products' | 'unknown';
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
    
    // Check for list products request
    if (/\b(list|show|all|products?|inventory|catalog)\b/i.test(msg)) {
      return { intent: 'list_products', confidence: 0.8 };
    }
    
    return { intent: 'unknown', confidence: 0 };
  }

  // Extract product and quantity from message
  private async extractProductAndQuantity(message: string): Promise<{
    productName?: string;
    quantity?: number;
    product?: any;
    products?: any[];
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
    let products = [];
    if (productName && productName.length > 0) {
      // First try exact search
      const exactProducts = await storage.searchProducts(productName);
      // Then try fuzzy search
      const fuzzyProducts = await storage.searchProductsFuzzy(productName);
      
      // Combine and deduplicate results
      const allProducts = [...exactProducts];
      fuzzyProducts.forEach(fp => {
        if (!allProducts.find(p => p.id === fp.id)) {
          allProducts.push(fp);
        }
      });
      
      if (allProducts.length > 0) {
        if (allProducts.length === 1) {
          // Single product found
          product = allProducts[0];
        } else {
          // Multiple products found - return all for selection
          products = allProducts.slice(0, 5); // Limit to 5 for buttons
        }
      }
    }
    
    return { productName, quantity, product, products };
  }

  // Handle stock addition flow
  private async handleStockAddition(userPhone: string, message: string, state: ConversationState): Promise<string> {
    console.log('handleStockAddition called:', {
      currentFlow: state.currentFlow,
      hasPendingStockAddition: !!state.pendingStockAddition,
      awaitingQuantity: state.pendingStockAddition?.awaitingQuantity,
      awaitingConfirmation: state.pendingStockAddition?.awaitingConfirmation,
      userName: state.userName,
      message: message,
      pendingStockAddition: state.pendingStockAddition
    });
    
    // If we're waiting for a quantity, lock product and parse number only
    if (state.currentFlow === 'adding_stock' && state.pendingStockAddition?.awaitingQuantity) {
      const qtyMatch = message.match(/(\d+)/);
      const qty = qtyMatch ? Math.abs(parseInt(qtyMatch[1])) : undefined;
      if (!qty || qty <= 0) {
        return `Please enter a valid number for quantity to add for ${state.pendingStockAddition.productName}.`;
      }
      state.pendingStockAddition.quantity = qty;
      state.pendingStockAddition.awaitingQuantity = false;
      state.pendingStockAddition.awaitingConfirmation = true;
      const { productName, sku, currentStock } = state.pendingStockAddition;
      return `📦 Stock Addition Request:\n` +
             `Product: ${productName} (SKU: ${sku})\n` +
             `Current: ${currentStock} • Add: ${qty} • New: ${currentStock + qty}` +
             `\n\nReply with "yes" to confirm or "no" to cancel.`;
    }
    // Check if we're awaiting user name (either in awaiting_name flow or adding_stock flow with pendingStockAddition)
    if ((state.currentFlow === 'awaiting_name' || state.currentFlow === 'adding_stock') && 
        state.pendingStockAddition && 
        !state.pendingStockAddition.awaitingConfirmation && 
        !state.userName) {
      console.log('Processing user name input:', message);
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
    
    // Check if we have pendingStockAddition but user already provided name - process confirmation
    if (state.pendingStockAddition && 
        state.pendingStockAddition.awaitingConfirmation && 
        state.userName && 
        !/^(yes|y|confirm|ok|correct|no|n|cancel)$/i.test(message.trim())) {
      console.log('User provided name but not confirmation, processing as name input:', message);
      state.userName = message.trim();
      
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
          
          // Ensure a valid user exists for purchases FK
          const waUser = await storage.getOrCreateUserByPhone(state.userPhone);
          const purchase = await storage.createPurchase({
            userId: waUser.id,
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
    
    // If awaiting product selection from typed query
    if (state.pendingStockAddition?.awaitingProductSelection && state.pendingStockAddition.candidates?.length) {
      const choiceIdx = parseInt(message.trim(), 10);
      if (!isNaN(choiceIdx) && choiceIdx >= 1 && choiceIdx <= state.pendingStockAddition.candidates.length) {
        const selected = state.pendingStockAddition.candidates[choiceIdx - 1];
        const selectedProduct = await storage.getProduct(selected.productId);
        if (selectedProduct) {
          state.pendingStockAddition.productId = selectedProduct.id;
          state.pendingStockAddition.productName = selectedProduct.name;
          state.pendingStockAddition.sku = selectedProduct.sku || '';
          state.pendingStockAddition.currentStock = selectedProduct.stockAvailable || 0;
          state.pendingStockAddition.awaitingProductSelection = false;
        }
      } else {
        return `Please reply with a number between 1 and ${state.pendingStockAddition.candidates.length}.`;
      }
    }

    // Extract product and quantity from message
    const { productName, quantity, product, products } = await this.extractProductAndQuantity(message);
    
    if (!product && !productName && !products?.length) {
      return `❓ I couldn't understand your request. Please specify:\n` +
             `- Product name or SKU\n` +
             `- Quantity to add\n\n` +
             `Example: "Add 50 units of socket plugs"`;
    }
    
    // If multiple products found, show selection buttons
    if (products && products.length > 1) {
      // Store the context for product selection
      state.lastContext = {
        type: 'product_selection',
        productQuery: productName,
        quantity: quantity || 1,
        action: 'add_stock',
        products: products
      };

      // Send product selection buttons
      await this.sendProductSelectionButtons(userPhone, products, quantity || 1, 'add_stock');
      return "";
    }
    
    // If user typed a brand or partial like "daikin", show candidate list to select exact product
    if (!product && productName && !products?.length) {
      const candidates = await storage.searchProductsFuzzy(productName);
      if (candidates && candidates.length > 1) {
        const top = candidates.slice(0, 5); // Limit to 5 for buttons
        
        // Store the context for product selection
        state.lastContext = {
          type: 'product_selection',
          productQuery: productName,
          quantity: quantity || 1,
          action: 'add_stock',
          products: top
        };

        // Send product selection buttons
        await this.sendProductSelectionButtons(userPhone, top, quantity || 1, 'add_stock');
        return "";
      }
    }

    // Set up pending stock addition
    state.pendingStockAddition = {
      productId: product?.id || '',
      productName: product?.name || productName || '',
      sku: product?.sku || '',
      quantity: quantity || 0,
      currentStock: product?.stockAvailable || 0,
      awaitingConfirmation: false,
      awaitingQuantity: !quantity
    };
    
    // If quantity missing but we have a product, prompt for quantity
    if (state.pendingStockAddition.awaitingQuantity) {
      await this.sendWhatsAppMessage(userPhone, `How many units of ${state.pendingStockAddition.productName} should I add?`);
      // Keep flow in adding_stock and do not re-run extraction next turn
      return "";
    }

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
        console.log('Processing collecting_items step:', { 
          message, 
          orderItems: order.items.length, 
          currentFlow: state.currentFlow,
          hasPendingOrder: !!state.pendingOrder 
        });
        
        // Check if user wants to proceed with collected items
        if (order.items.length > 0 && /^(yes|y|done|proceed|next)$/i.test(message.trim())) {
          // Validate that we have items
          if (order.items.length === 0) {
            return `❌ No items in your order. Please add items before proceeding.\n\n` +
                   `Example: "10 units of socket plugs"`;
          }
          
          order.step = 'collecting_customer_info';
          order.currentQuestion = 'customer_name';
          return `Great! I need some details for the order.\n\n` +
                 `Please provide the customer's name:`;
        }
        
        // Try to extract product and quantity
        const { product, quantity, products } = await this.extractProductAndQuantity(message);
        console.log('Product extraction result:', { product: product?.name, quantity, productsCount: products?.length });
        
        // If multiple products found, show selection buttons
        if (products && products.length > 1) {
          // Store the context for product selection
          state.lastContext = {
            type: 'product_selection',
            productQuery: message,
            quantity: quantity || 1,
            action: 'create_order',
            products: products
          };

          // Send product selection buttons
          await this.sendProductSelectionButtons(userPhone, products, quantity || 1, 'create_order');
          return "";
        }
        
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
          
          await this.sendInteractiveButtons(
            userPhone,
            `✅ Added to order\n\n${product.name} - ${quantity} units\n\n📋 Current order:\n${itemsList}`,
            [
              { id: "order:add_more", title: "Add More" },
              { id: "order:proceed", title: "Proceed" },
              { id: "order:cancel", title: "Cancel Order" }
            ],
            "Order actions"
          );
          return "";
        }
        
        // If no product found, show helpful message
        if (!product && !products?.length) {
          return `❌ No products found matching your request. Please try a different product name.\n\n` +
                 `Example: "10 units of socket plugs"`;
        }
        
        await this.sendInteractiveButtons(
          userPhone,
          `Add items to your order.`,
          [
            { id: "main:check_stock", title: "Check Stock" },
            { id: "main:add_stock", title: "Add Stock" },
            { id: "main:create_order", title: "Create Order" }
          ],
          "Need help?"
        );
        return "";
      }
      
      case 'collecting_customer_info': {
        // Handle customer information collection
        if (order.currentQuestion === 'customer_name') {
          const name = message.trim();
          if (!name || name.length < 2) {
            return `❌ Please provide a valid customer name (at least 2 characters).`;
          }
          order.customerName = name;
          order.currentQuestion = 'customer_phone';
          await this.sendInteractiveButtons(
            userPhone,
            `Customer name: ${order.customerName}\nPlease provide the customer's phone number:`,
            [ { id: "order:cancel", title: "Cancel" } ]
          );
          return "";
        }
        
        if (order.currentQuestion === 'customer_phone') {
          const phone = message.trim();
          if (!phone || phone.length < 10) {
            return `❌ Please provide a valid phone number (at least 10 digits).`;
          }
          order.customerPhone = phone;
          order.currentQuestion = 'customer_email';
          await this.sendInteractiveButtons(
            userPhone,
            `Phone: ${order.customerPhone}\nProvide customer's email?`,
            [ { id: "cust:skip_email", title: "Skip Email" }, { id: "order:cancel", title: "Cancel" } ],
            "Customer info"
          );
          return "";
        }
        
        if (order.currentQuestion === 'customer_email') {
          if (message.toLowerCase() !== 'skip') {
            order.customerEmail = message.trim();
          }
          order.currentQuestion = 'container_number';
          await this.sendInteractiveButtons(
            userPhone,
            `Please provide the container number:`,
            [ { id: "order:cancel", title: "Cancel" } ]
          );
          return "";
        }
        
        if (order.currentQuestion === 'container_number') {
          order.containerNumber = message.trim();
          order.currentQuestion = 'job_id';
          await this.sendInteractiveButtons(
            userPhone,
            `Container: ${order.containerNumber}\nProvide the job ID:`,
            [ { id: "order:cancel", title: "Cancel" } ]
          );
          return "";
        }
        
        if (order.currentQuestion === 'job_id') {
          order.jobId = message.trim();
          order.currentQuestion = 'purchaser_name';
          await this.sendInteractiveButtons(
            userPhone,
            `Job ID: ${order.jobId}\nYour name (person placing the order):`,
            [ { id: "order:cancel", title: "Cancel" } ]
          );
          return "";
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
            // Validate required fields
            if (!order.customerName || !order.customerPhone) {
              return `❌ Missing required information. Please provide customer name and phone number.`;
            }
            
            if (!order.items || order.items.length === 0) {
              return `❌ No items in order. Please add items before confirming.`;
            }
            
            // First, create or find customer
            let customer;
            try {
              const existingCustomers = await storage.getCustomers();
              customer = existingCustomers.find(c => c.phone === order.customerPhone || c.name === order.customerName);
              
              if (!customer) {
                customer = await storage.createCustomer({
                  name: order.customerName,
                  phone: order.customerPhone,
                  email: order.customerEmail
                });
              }
            } catch (customerError) {
              console.error("Error creating/finding customer:", customerError);
              return `❌ Error processing customer information. Please try again.`;
            }
            
            // Validate and process order items
            const orderItems = [];
            let subtotal = 0;
            let needsApproval = false;
            
            for (const item of order.items) {
              const product = await storage.getProduct(item.productId);
              if (!product) {
                return `❌ Product not found: ${item.productName || item.productId}. Please remove this item and try again.`;
              }
              
              // Validate quantity
              if (!item.quantity || item.quantity <= 0) {
                return `❌ Invalid quantity for ${item.productName}. Please check your order.`;
              }
              
              // Get product price (default to 0 if not set)
              const unitPrice = Number(product.price || 0);
              const totalPrice = item.quantity * unitPrice;
              subtotal += totalPrice;
              
              // Check if item needs approval (out of stock)
              if ((product.stockAvailable || 0) < item.quantity) {
                needsApproval = true;
              }
              
              orderItems.push({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: unitPrice.toString(),
                totalPrice: totalPrice.toString()
              });
            }
            
            const tax = 0;
            const total = subtotal + tax;
            
            // Create order
            let newOrder;
            try {
              newOrder = await storage.createOrder({
                customerId: customer.id,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                customerPhone: order.customerPhone,
                containerNumber: order.containerNumber,
                jobOrder: order.jobId,
                status: "pending",
                approvalStatus: needsApproval ? "needs_approval" : "pending",
                subtotal: subtotal.toString(),
                tax: tax.toString(),
                total: total.toString(),
                notes: `Order placed via WhatsApp by ${order.purchaserName || 'Unknown'}\nContainer: ${order.containerNumber || 'N/A'}\nJob ID: ${order.jobId || 'N/A'}`
              }, orderItems);
            } catch (orderError) {
              console.error("Error creating order:", orderError);
              return `❌ Error creating order: ${(orderError as Error).message || 'Unknown error'}. Please try again.`;
            }
            
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

  // Handle product selection button click
  private async handleProductSelectionButton(userPhone: string, buttonId: string, state: ConversationState): Promise<string> {
    console.log('Processing button click:', buttonId);
    
    // Parse button ID: select_product_{productId}_{action}_{quantity}
    // Since action can contain underscores (e.g., "add_stock"), we need to parse differently
    const parts = buttonId.split('_');
    console.log('Button ID parts:', parts);
    
    if (parts.length < 6) {
      console.log('Invalid button ID format, parts length:', parts.length);
      return "Invalid selection. Please try again.";
    }

    // For button ID: select_product_{productId}_add_stock_{quantity}
    // parts[0] = 'select'
    // parts[1] = 'product' 
    // parts[2] = productId
    // parts[3] = 'add'
    // parts[4] = 'stock'
    // parts[5] = quantity
    const productId = parts[2];
    const action = `${parts[3]}_${parts[4]}`; // Reconstruct "add_stock"
    const quantity = parseInt(parts[5]);
    
    console.log('Parsed values:', { productId, action, quantity });

    // Get the product details
    const product = await storage.getProduct(productId);
    console.log('Product found:', product ? product.name : 'Not found');
    
    if (!product) {
      return "Product not found. Please try again.";
    }

    // Clear the product selection context
    state.lastContext = undefined;

    if (action === 'add_stock') {
      console.log('Processing add_stock action');
      // Proceed with stock addition
      state.currentFlow = 'adding_stock';
      state.pendingStockAddition = {
        productId,
        productName: product.name,
        sku: product.sku || '',
        quantity,
        currentStock: product.stockAvailable || 0,
        awaitingConfirmation: false, // Set to false initially, will be true after name
        awaitingQuantity: false
      };
      
      return `Selected: ${product.name} (SKU: ${product.sku})\nCurrent stock: ${product.stockAvailable} units\nYou want to add: ${quantity} units\nPlease tell me your name for the record:`;
    } else if (action === 'create_order') {
      console.log('Processing create_order action');
      // Proceed with order creation
      state.currentFlow = 'creating_order';
      
      // Initialize or add to existing order
      if (!state.pendingOrder) {
        state.pendingOrder = {
          items: [],
          step: 'collecting_items'
        };
      }
      
      // Add new item to existing order
      state.pendingOrder.items.push({
        productId,
        productName: product.name,
        sku: product.sku || 'NA',
        quantity,
        unitPrice: product.price
      });
      
      const itemsList = state.pendingOrder.items.map((item, i) => 
        `${i + 1}. ${item.productName} - ${item.quantity} units`
      ).join('\n');
      
      await this.sendInteractiveButtons(
        userPhone,
        `✅ Added to order\n\n${product.name} - ${quantity} units\n\n📋 Current order:\n${itemsList}`,
        [
          { id: "order:add_more", title: "Add More" },
          { id: "order:proceed", title: "Proceed" },
          { id: "order:cancel", title: "Cancel Order" }
        ],
        "Order actions"
      );
      return "";
    }

    console.log('Unsupported action:', action);
    return "Action not supported. Please try again.";
  }

  // Handle numeric product selection (fallback for text-based selection)
  private async handleNumericProductSelection(userPhone: string, selectionText: string, state: ConversationState): Promise<string> {
    if (state.lastContext?.type !== 'product_selection') {
      return "I'm not currently waiting for a product selection. Please try again.";
    }

    const selectedIndex = parseInt(selectionText) - 1;
    const products = state.lastContext.products;
    
    if (selectedIndex < 0 || selectedIndex >= products.length) {
      return "Invalid selection. Please choose a valid number.";
    }

    const selectedProduct = products[selectedIndex];
    const action = state.lastContext.action;
    const quantity = state.lastContext.quantity;

    console.log('Numeric selection:', { selectedIndex, action, quantity, productName: selectedProduct.name });

    // Clear the product selection context
    state.lastContext = undefined;

    if (action === 'add_stock') {
      // Proceed with stock addition
      state.currentFlow = 'adding_stock';
      state.pendingStockAddition = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        sku: selectedProduct.sku || '',
        quantity,
        currentStock: selectedProduct.stockAvailable || 0,
        awaitingConfirmation: false, // Set to false initially, will be true after name
        awaitingQuantity: false
      };
      
      return `Selected: ${selectedProduct.name} (SKU: ${selectedProduct.sku})\nCurrent stock: ${selectedProduct.stockAvailable} units\nYou want to add: ${quantity} units\nPlease tell me your name for the record:`;
    } else if (action === 'create_order') {
      // Proceed with order creation
      state.currentFlow = 'creating_order';
      
      // Initialize or add to existing order
      if (!state.pendingOrder) {
        state.pendingOrder = {
          items: [],
          step: 'collecting_items'
        };
      }
      
      // Add new item to existing order
      state.pendingOrder.items.push({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        sku: selectedProduct.sku || 'NA',
        quantity,
        unitPrice: selectedProduct.price
      });
      
      const itemsList = state.pendingOrder.items.map((item, i) => 
        `${i + 1}. ${item.productName} - ${item.quantity} units`
      ).join('\n');
      
      await this.sendInteractiveButtons(
        userPhone,
        `✅ Added to order\n\n${selectedProduct.name} - ${quantity} units\n\n📋 Current order:\n${itemsList}`,
        [
          { id: "order:add_more", title: "Add More" },
          { id: "order:proceed", title: "Proceed" },
          { id: "order:cancel", title: "Cancel Order" }
        ],
        "Order actions"
      );
      return "";
    }

    return "Action not supported. Please try again.";
  }
  
  // Handle check stock flow with enhanced catalog system
  private async handleCheckStock(userPhone: string, message: string, state: ConversationState): Promise<string> {
    console.log('handleCheckStock called:', { message, currentFlow: state.currentFlow });
    
    // Handle special commands
    if (message.toLowerCase() === 'menu' || message.toLowerCase() === 'main') {
      await this.sendCatalogMainMenu(userPhone);
      return "";
    }
    
    // Handle search queries
    const { product, products } = await this.extractProductAndQuantity(message);
    
    // If multiple products found, show them with stock levels
    if (products && products.length > 1) {
      const stockList = products.slice(0, 10).map((p, i) => {
        const stockIcon = this.getStockIcon(p);
        return `${i + 1}. ${stockIcon} **${p.name}** (SKU: ${p.sku})\n   Available: ${p.stockAvailable || 0} | Total: ${p.stockTotal || 0} | Price: $${p.price || 0}`;
      }).join('\n\n');
      
      const response = `🔍 **Found ${products.length} products matching "${message}":**\n\n${stockList}${products.length > 10 ? `\n\n... and ${products.length - 10} more products` : ''}\n\n**To view details:** Type the product name or SKU.`;
      
      // Reset flow to allow new search
      state.currentFlow = 'checking_stock';
      return response;
    }
    // If single product found, show detailed info
    else if (product) {
      await this.sendProductDetails(userPhone, product.id);
      return "";
    } 
    // If no products found, provide helpful suggestions
    else {
      const suggestions = `❌ **No products found matching "${message}"**\n\n` +
        `**Try these suggestions:**\n` +
        `• Use partial names: "sensor" instead of "carrier data recorder sensor"\n` +
        `• Use SKU codes: "Q-002032"\n` +
        `• Use broader terms: "plug", "cable", "sensor"\n\n` +
        `**Or type "menu" to browse by category.**`;
      
      // Reset flow to allow new search
      state.currentFlow = 'checking_stock';
      return suggestions;
    }
  }
  
  // Send catalog main menu with categories and search options
  private async sendCatalogMainMenu(userPhone: string): Promise<void> {
    try {
      // Get product categories and counts
      const products = await storage.getProducts({});
      const categories = this.getProductCategories(products);
      
      const categoryButtons = categories.slice(0, 3).map(cat => ({
        id: `catalog:category:${cat.name}`,
        title: `${cat.name} (${cat.count})`
      }));
      
      const buttons = [
        ...categoryButtons,
        { id: "catalog:search", title: "🔍 Search" },
        { id: "catalog:all", title: "📋 All Products" },
        { id: "catalog:low_stock", title: "⚠️ Low Stock" },
        { id: "catalog:out_of_stock", title: "❌ Out of Stock" }
      ];
      
      const message = `🏪 **Stock Catalog**\n\n` +
        `**Total Products:** ${products.length}\n` +
        `**Categories Available:** ${categories.length}\n\n` +
        `Choose how you'd like to browse:`;
      
      await this.sendInteractiveButtons(
        userPhone,
        message,
        buttons,
        "Catalog Menu"
      );
    } catch (error) {
      console.error("Error sending catalog main menu:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't load the catalog. Please try again.");
    }
  }
  
  // Get product categories with counts
  private getProductCategories(products: any[]): Array<{name: string, count: number, type: string}> {
    const categoryMap = new Map<string, number>();
    
    products.forEach(product => {
      if (product.type) {
        const count = categoryMap.get(product.type) || 0;
        categoryMap.set(product.type, count + 1);
      }
    });
    
    return Array.from(categoryMap.entries())
      .map(([type, count]) => ({ name: type, count, type }))
      .sort((a, b) => b.count - a.count);
  }
  
  // Get stock icon for a product
  private getStockIcon(product: any): string {
    const available = product.stockAvailable || 0;
    const minLevel = product.minStockLevel || 10;
    
    if (available === 0) return "❌";
    if (available <= minLevel) return "⚠️";
    return "✅";
  }
  
  // Send detailed product view
  private async sendProductDetails(userPhone: string, productId: string): Promise<void> {
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        await this.sendWhatsAppMessage(userPhone, "❌ Product not found.");
        return;
      }
      
      const stockStatus = this.getStockStatus(product);
      const stockIcon = this.getStockIcon(product);
      
      const message = `📊 **${product.name}**\n\n` +
        `**SKU:** ${product.sku}\n` +
        `**Type:** ${product.type || 'N/A'}\n` +
        `**Status:** ${stockIcon} ${stockStatus}\n\n` +
        `📈 **Stock Information:**\n` +
        `• Available: ${product.stockAvailable || 0} units\n` +
        `• Total: ${product.stockTotal || 0} units\n` +
        `• Used: ${product.stockUsed || 0} units\n` +
        `• Min Level: ${product.minStockLevel || 0} units\n\n` +
        `💰 **Price:** $${product.price || 0}\n` +
        `📦 **Group:** ${product.groupName || 'N/A'}\n` +
        `🏷️ **Part Code:** ${product.crystalPartCode || 'N/A'}\n\n` +
        `**What would you like to do?**`;
      
      const buttons = [
        { id: `product:add:${product.id}`, title: "➕ Add Stock" },
        { id: `product:order:${product.id}`, title: "🛒 Create Order" },
        { id: "catalog:main", title: "🏠 Main Menu" },
        { id: "catalog:search", title: "🔍 Search Again" }
      ];
      
      await this.sendInteractiveButtons(
        userPhone,
        message,
        buttons,
        "Product Actions"
      );
    } catch (error) {
      console.error("Error sending product details:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't load the product details. Please try again.");
    }
  }
  
  // Get stock status for a product
  private getStockStatus(product: any): string {
    const available = product.stockAvailable || 0;
    const minLevel = product.minStockLevel || 10;
    
    if (available === 0) return "Out of Stock";
    if (available <= minLevel) return "Low Stock";
    return "In Stock";
  }
  
  // Send search interface
  private async sendSearchInterface(userPhone: string): Promise<void> {
    const message = `🔍 **Search Products**\n\n` +
      `**Search Options:**\n` +
      `• Type product name (e.g., "sensor")\n` +
      `• Type SKU code (e.g., "Q-002032")\n` +
      `• Type partial name (e.g., "carrier")\n\n` +
      `**Quick Filters:**\n` +
      `• "low" - Show low stock items\n` +
      `• "out" - Show out of stock items\n` +
      `• "new" - Show recently added\n\n` +
      `Type your search query:`;
    
    await this.sendWhatsAppMessage(userPhone, message);
  }
  
  // Send products by category
  private async sendProductsByCategory(userPhone: string, category: string): Promise<void> {
    try {
      const products = await storage.getProducts({ category });
      const productsWithStock = products.filter(p => p.stockAvailable > 0);
      const lowStockProducts = products.filter(p => p.stockAvailable > 0 && p.stockAvailable <= (p.minStockLevel || 10));
      const outOfStockProducts = products.filter(p => p.stockAvailable === 0);
      
      if (products.length === 0) {
        await this.sendWhatsAppMessage(userPhone, `❌ No products found in category "${category}".`);
        return;
      }
      
      // Create product rows for interactive list (max 10 due to WhatsApp limits)
      const productRows = products.slice(0, 10).map(product => {
        const stockStatus = this.getStockStatus(product);
        const stockIcon = this.getStockIcon(product);
        const title = `${stockIcon} ${product.name.substring(0, 20)}${product.name.length > 20 ? '...' : ''}`;
        const description = `SKU: ${product.sku} | Stock: ${product.stockAvailable}`;
        
        return {
          id: `product:view:${product.id}`,
          title,
          description
        };
      });
      
      const message = `📦 **${category} Products**\n\n` +
        `**Total:** ${products.length} products\n` +
        `**In Stock:** ${productsWithStock.length}\n` +
        `**Low Stock:** ${lowStockProducts.length}\n` +
        `**Out of Stock:** ${outOfStockProducts.length}\n\n` +
        `Select a product to view details:`;
      
      await this.sendInteractiveList(
        userPhone,
        message,
        productRows,
        "Select Product",
        category
      );
    } catch (error) {
      console.error("Error sending products by category:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't load the products. Please try again.");
    }
  }
  
  // Send all products with pagination
  private async sendAllProducts(userPhone: string, page: number = 0): Promise<void> {
    try {
      const products = await storage.getProducts({});
      const pageSize = 10;
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const pageProducts = products.slice(startIndex, endIndex);
      
      if (pageProducts.length === 0) {
        await this.sendWhatsAppMessage(userPhone, "❌ No products found.");
        return;
      }
      
      const productRows = pageProducts.map(product => {
        const stockStatus = this.getStockStatus(product);
        const stockIcon = this.getStockIcon(product);
        const title = `${stockIcon} ${product.name.substring(0, 20)}${product.name.length > 20 ? '...' : ''}`;
        const description = `SKU: ${product.sku} | Stock: ${product.stockAvailable}`;
        
        return {
          id: `product:view:${product.id}`,
          title,
          description
        };
      });
      
      const message = `📋 **All Products** (Page ${page + 1})\n\n` +
        `**Showing:** ${startIndex + 1}-${Math.min(endIndex, products.length)} of ${products.length}\n\n` +
        `Select a product to view details:`;
      
      const buttons = [];
      if (page > 0) buttons.push({ id: `catalog:all:${page - 1}`, title: "⬅️ Previous" });
      if (endIndex < products.length) buttons.push({ id: `catalog:all:${page + 1}`, title: "Next ➡️" });
      buttons.push({ id: "catalog:main", title: "🏠 Main Menu" });
      
      await this.sendInteractiveList(
        userPhone,
        message,
        productRows,
        "Select Product",
        "All Products"
      );
      
      if (buttons.length > 0) {
        await this.sendInteractiveButtons(
          userPhone,
          "",
          buttons,
          "Navigation"
        );
      }
    } catch (error) {
      console.error("Error sending all products:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't load the products. Please try again.");
    }
  }
  
  // Send low stock products
  private async sendLowStockProducts(userPhone: string): Promise<void> {
    try {
      const products = await storage.getProducts({});
      const lowStockProducts = products.filter(p => 
        p.stockAvailable > 0 && p.stockAvailable <= (p.minStockLevel || 10)
      );
      
      if (lowStockProducts.length === 0) {
        await this.sendWhatsAppMessage(userPhone, "✅ No low stock products found. All products are well stocked!");
        return;
      }
      
      const productRows = lowStockProducts.slice(0, 10).map(product => {
        const title = `⚠️ ${product.name.substring(0, 20)}${product.name.length > 20 ? '...' : ''}`;
        const description = `SKU: ${product.sku} | Stock: ${product.stockAvailable}/${product.minStockLevel || 10}`;
        
        return {
          id: `product:view:${product.id}`,
          title,
          description
        };
      });
      
      const message = `⚠️ **Low Stock Products**\n\n` +
        `**Found:** ${lowStockProducts.length} products below minimum stock level\n\n` +
        `Select a product to view details:`;
      
      await this.sendInteractiveList(
        userPhone,
        message,
        productRows,
        "Select Product",
        "Low Stock"
      );
    } catch (error) {
      console.error("Error sending low stock products:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't load the low stock products. Please try again.");
    }
  }
  
  // Send out of stock products
  private async sendOutOfStockProducts(userPhone: string): Promise<void> {
    try {
      const products = await storage.getProducts({});
      const outOfStockProducts = products.filter(p => p.stockAvailable === 0);
      
      if (outOfStockProducts.length === 0) {
        await this.sendWhatsAppMessage(userPhone, "✅ No out of stock products found. All products are available!");
        return;
      }
      
      const productRows = outOfStockProducts.slice(0, 10).map(product => {
        const title = `❌ ${product.name.substring(0, 20)}${product.name.length > 20 ? '...' : ''}`;
        const description = `SKU: ${product.sku} | Last Stock: ${product.stockTotal || 0}`;
        
        return {
          id: `product:view:${product.id}`,
          title,
          description
        };
      });
      
      const message = `❌ **Out of Stock Products**\n\n` +
        `**Found:** ${outOfStockProducts.length} products with zero stock\n\n` +
        `Select a product to view details:`;
      
      await this.sendInteractiveList(
        userPhone,
        message,
        productRows,
        "Select Product",
        "Out of Stock"
      );
    } catch (error) {
      console.error("Error sending out of stock products:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't load the out of stock products. Please try again.");
    }
  }
  
  // Main message handler
  async handleTextMessage(userPhone: string, messageText: string): Promise<void> {
    try {
      const state = this.getConversationState(userPhone);
      state.messageCount++;
      state.lastMessageTime = new Date();
      
      const message = messageText.trim();
      let response = '';
      
      // Debug logging
      console.log('handleTextMessage called:', {
        message,
        currentFlow: state.currentFlow,
        hasPendingStockAddition: !!state.pendingStockAddition,
        awaitingConfirmation: state.pendingStockAddition?.awaitingConfirmation,
        userName: state.userName,
        lastContextType: state.lastContext?.type,
        pendingOrder: !!state.pendingOrder
      });
      
      // Check if this is a product selection button click
      if (message.startsWith('select_product_')) {
        response = await this.handleProductSelectionButton(userPhone, message, state);
      }
      // Check if this is a numeric selection (fallback for text-based selection)
      else if (state.lastContext?.type === 'product_selection' && /^\d+$/.test(message)) {
        response = await this.handleNumericProductSelection(userPhone, message, state);
      }
      // Check if we're in the middle of a flow - PRIORITIZE this check
      else if (state.pendingStockAddition || 
               state.currentFlow === 'awaiting_name' || 
               state.currentFlow === 'adding_stock') {
        console.log('Processing as stock addition flow - state:', {
          pendingStockAddition: !!state.pendingStockAddition,
          currentFlow: state.currentFlow,
          awaitingConfirmation: state.pendingStockAddition?.awaitingConfirmation,
          userName: state.userName,
          message: message
        });
        response = await this.handleStockAddition(userPhone, message, state);
      }
      // Additional check for stock addition flow - if we have a pending stock addition but it's not being caught above
      else if (state.pendingStockAddition && !state.pendingStockAddition.awaitingConfirmation && !state.userName) {
        console.log('Processing as stock addition flow (fallback) - state:', {
          pendingStockAddition: !!state.pendingStockAddition,
          currentFlow: state.currentFlow,
          awaitingConfirmation: state.pendingStockAddition?.awaitingConfirmation,
          userName: state.userName,
          message: message
        });
        response = await this.handleStockAddition(userPhone, message, state);
      } else if (state.currentFlow === 'creating_order' || 
                 state.currentFlow === 'collecting_order_details' ||
                 state.pendingOrder) {
        console.log('Processing as create order flow');
        response = await this.handleOrderCreation(userPhone, message, state);
      } else if (state.currentFlow === 'checking_stock') {
        console.log('Processing as check stock flow');
        response = await this.handleCheckStock(userPhone, message, state);
      } else if (state.pendingImageProcessing?.awaitingProductSelection) {
        response = await this.handleProductSelection(userPhone, message, state);
      } else {
        console.log('Falling through to normal intent detection - state:', {
          pendingStockAddition: !!state.pendingStockAddition,
          currentFlow: state.currentFlow,
          lastContextType: state.lastContext?.type,
          message: message
        });
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
      
      // Check if we have a pending action from gemini.ts that needs to be processed
      if (state.lastContext?.pendingAction) {
        const pendingAction = state.lastContext.pendingAction;
        console.log('Processing pending action from gemini:', pendingAction);
        
        if (pendingAction.type === 'add_stock' && pendingAction.productId && pendingAction.quantity) {
          // Set up the stock addition flow
          state.currentFlow = 'adding_stock';
          state.pendingStockAddition = {
            productId: pendingAction.productId,
            productName: '', // Will be filled when we get the product
            sku: '',
            quantity: pendingAction.quantity,
            currentStock: 0,
            awaitingConfirmation: false,
            awaitingQuantity: false
          };
          
          // Get the product details
          const product = await storage.getProduct(pendingAction.productId);
          if (product) {
            state.pendingStockAddition.productName = product.name;
            state.pendingStockAddition.sku = product.sku || '';
            state.pendingStockAddition.currentStock = product.stockAvailable || 0;
          }
          
          // Clear the pending action
          state.lastContext.pendingAction = undefined;
        }
      }
      
      // Send response only if non-empty
      if (response && response.trim().length > 0) {
        // Check if this is a special response for multiple products
        if (response.startsWith('MULTIPLE_PRODUCTS_FOUND:')) {
          const parts = response.split(':');
          if (parts.length >= 5) {
            const productCount = parseInt(parts[1]);
            const productQuery = parts[2];
            const quantity = parseInt(parts[3]);
            const action = parts[4];
            
            // Get the products from the pending action
            const products = state.lastContext?.products || [];
            if (products.length > 0) {
              await this.sendProductSelectionButtons(userPhone, products, quantity, action);
              return; // Don't send the text message
            }
          }
        }
        
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
    const normalized = message.trim().toLowerCase();
    if (normalized === 'menu' || normalized === 'help' || normalized === 'start') {
      await this.sendMainMenu(userPhone);
      return "";
    }
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
        const { product, products } = await this.extractProductAndQuantity(message);
        
        // If multiple products found, show them with stock levels
        if (products && products.length > 1) {
          const stockList = products.slice(0, 10).map((p, i) => 
            `${i + 1}. **${p.name}** (SKU: ${p.sku})\n   Available: ${p.stockAvailable || 0} | Total: ${p.stockTotal || 0} | Price: $${p.price || 0}`
          ).join('\n\n');
          
          const response = `📦 **Found ${products.length} products matching "${message}":**\n\n${stockList}${products.length > 10 ? `\n\n... and ${products.length - 10} more products` : ''}\n\n**To check specific product:** Type the exact product name or SKU.`;
          
          await this.sendWhatsAppMessage(userPhone, response);
          return "";
        }
        // If single product found, show detailed info
        else if (product) {
          const stockInfo = `📊 **${product.name}**\n` +
            `SKU: ${product.sku}\n` +
            `Type: ${product.type || 'N/A'}\n\n` +
            `📈 **Stock Levels:**\n` +
            `• Available: ${product.stockAvailable || 0} units\n` +
            `• Total: ${product.stockTotal || 0} units\n` +
            `• Used: ${product.stockUsed || 0} units\n` +
            `• Min Level: ${product.minStockLevel || 0} units\n\n` +
            `💰 **Price:** $${product.price || 0}\n\n` +
            `**What would you like to do?**`;
          
          await this.sendInteractiveButtons(
            userPhone,
            stockInfo,
            [
              { id: `product:add:${product.id}`, title: "Add Stock" },
              { id: `product:order:${product.id}`, title: "Create Order" },
              { id: "main:check_stock", title: "Check Another" }
            ],
            "Stock Info"
          );
          return "";
        } 
        // If no products found, provide helpful suggestions
        else {
          const suggestions = `❌ **No products found matching "${message}"**\n\n` +
            `**Try these suggestions:**\n` +
            `• Use partial names: "sensor" instead of "carrier data recorder sensor"\n` +
            `• Use SKU codes: "Q-002032"\n` +
            `• Use broader terms: "plug", "cable", "sensor"\n\n` +
            `**Or type "list" to see all available products.**`;
          
          await this.sendWhatsAppMessage(userPhone, suggestions);
          return "";
        }
      }
        
      case 'list_products': {
        const products = await storage.getProducts({});
        if (products.length === 0) {
          await this.sendWhatsAppMessage(userPhone, "❌ No products found in inventory.");
          return "";
        }
        
        // Show first 20 products with basic info
        const productList = products.slice(0, 20).map((p, i) => 
          `${i + 1}. **${p.name}** (SKU: ${p.sku}) - Stock: ${p.stockAvailable || 0} | Price: $${p.price || 0}`
        ).join('\n');
        
        const response = `📦 **All Products (${products.length} total):**\n\n${productList}${products.length > 20 ? `\n\n... and ${products.length - 20} more products` : ''}\n\n**To check specific product:** Type the product name or SKU.`;
        
        await this.sendWhatsAppMessage(userPhone, response);
        return "";
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
    
    // If no specific command recognized, show action buttons
    const product = await storage.getProduct(productId);
    if (product) {
      await this.sendInteractiveButtons(
        userPhone,
        `For *${product.name}* (SKU: ${product.sku}) choose an action:`,
        [
          { id: `product:add:${product.id}`, title: "Add Stock" },
          { id: `product:order:${product.id}`, title: "Create Order" },
          { id: `product:check:${product.id}`, title: "Check Stock" }
        ]
      );
      return "";
    }
    return `What would you like to do with this product?`;
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

  // Small utility sleep
  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  // Core sender with timeout, retry, and light rate limiting per recipient
  private async postToWhatsApp(
    payload: any,
    purpose: string,
    to: string,
    options: { timeoutMs?: number; maxRetries?: number } = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 10000;
    const maxRetries = options.maxRetries ?? 3;

    if (!this.accessToken || !this.phoneNumberId) {
      console.error(`[WA] Missing credentials; cannot send ${purpose}`);
      return;
    }

    const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;

    // Light per-recipient pacing (avoid sending bursts)
    const last = this.lastSendAtByRecipient.get(to) || 0;
    const since = Date.now() - last;
    if (since < 350) {
      await this.sleep(350 - since);
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          this.lastSendAtByRecipient.set(to, Date.now());
          return;
        }

        const text = await res.text();
        const retriable = res.status >= 500 || res.status === 429;
        console.warn(`[WA] Send failed (status ${res.status}) for ${purpose}: ${text}${retriable && attempt <= maxRetries ? ` — retrying (${attempt}/${maxRetries})` : ''}`);
        if (!retriable || attempt > maxRetries) {
          return;
        }
      } catch (err: any) {
        clearTimeout(timer);
        const isAbort = err?.name === 'AbortError';
        console.warn(`[WA] ${isAbort ? 'Timeout' : 'Network'} error for ${purpose}${attempt <= maxRetries ? ` — retrying (${attempt}/${maxRetries})` : ''}`, err?.message || err);
        if (attempt > maxRetries) {
          return;
        }
      }

      // Exponential backoff with jitter
      const backoff = Math.min(2000, 300 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 150);
      await this.sleep(backoff);
    }
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
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: truncatedText }
      } as const;

      await this.postToWhatsApp(payload, 'text', to);
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
      // Swallow to avoid cascading failures in flows; already logged
    }
  }
  
  // Send WhatsApp image
  private async sendWhatsAppImage(to: string, imageUrl: string, caption?: string): Promise<void> {
    try {
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl },
        caption: caption || ''
      } as const;
      await this.postToWhatsApp(payload, 'image', to);
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
      await this.postToWhatsApp(payload, 'interactive_buttons', to);
    } catch (error) {
      console.error("Error sending interactive buttons:", error);
      // Fallback to text
      await this.sendWhatsAppMessage(to, bodyText + "\n\n(" + buttons.map(b => b.title).join(" | ") + ")");
    }
  }

  // Send product selection buttons
  private async sendProductSelectionButtons(
    to: string,
    products: Array<{ id: string; name: string; sku: string; stockAvailable: number }>,
    quantity: number,
    action: string
  ): Promise<void> {
    try {
      // Create buttons for top 3 most relevant products
      const topProducts = products.slice(0, 3);
      const buttons = topProducts.map((product, index) => {
        const buttonId = `select_product_${product.id}_${action}_${quantity}`;
        console.log(`Creating button ${index + 1}:`, {
          productId: product.id,
          productName: product.name,
          action,
          quantity,
          buttonId
        });
        return {
          id: buttonId,
          title: `${product.name.substring(0, 15)}...` // Truncate for button display
        };
      });

      const bodyText = `Found ${products.length} products. Please select the correct one:\n\n${topProducts.map((p, i) => 
        `${i + 1}. ${p.name} (SKU: ${p.sku}) - Stock: ${p.stockAvailable}`
      ).join('\n')}${products.length > 3 ? `\n\n... and ${products.length - 3} more products` : ''}`;

      console.log('Sending buttons:', buttons);
      await this.sendInteractiveButtons(
        to,
        bodyText,
        buttons,
        "Product Selection",
        `Quantity: ${quantity} units`
      );
    } catch (error) {
      console.error("Error sending product selection buttons:", error);
      // Fallback to text message
      const textMessage = `Found ${products.length} products. Please reply with the number:\n\n${products.slice(0, 3).map((p, i) => 
        `${i + 1}. ${p.name} (SKU: ${p.sku}) - Stock: ${p.stockAvailable}`
      ).join('\n')}\n\nReply with the number (1-3) to select.`;
      await this.sendWhatsAppMessage(to, textMessage);
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
                rows: rows.map(r => ({ id: r.id, title: r.title, description: r.description }))
              }
            ]
          }
        }
      } as any;
      await this.postToWhatsApp(payload, 'interactive_list', to);
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
        // Set flow state for check stock
        state.currentFlow = 'checking_stock';
        await this.sendCatalogMainMenu(userPhone);
        return;
      }

      // Catalog system handlers
      if (id === "catalog:main") {
        state.currentFlow = 'checking_stock';
        await this.sendCatalogMainMenu(userPhone);
        return;
      }
      if (id === "catalog:search") {
        state.currentFlow = 'checking_stock';
        await this.sendSearchInterface(userPhone);
        return;
      }
      if (id === "catalog:all") {
        state.currentFlow = 'checking_stock';
        await this.sendAllProducts(userPhone);
        return;
      }
      if (id === "catalog:low_stock") {
        state.currentFlow = 'checking_stock';
        await this.sendLowStockProducts(userPhone);
        return;
      }
      if (id === "catalog:out_of_stock") {
        state.currentFlow = 'checking_stock';
        await this.sendOutOfStockProducts(userPhone);
        return;
      }
      if (id.startsWith("catalog:category:")) {
        const category = id.split(":")[2];
        state.currentFlow = 'checking_stock';
        await this.sendProductsByCategory(userPhone, category);
        return;
      }
      if (id.startsWith("catalog:all:")) {
        const page = parseInt(id.split(":")[2]) || 0;
        state.currentFlow = 'checking_stock';
        await this.sendAllProducts(userPhone, page);
        return;
      }
      if (id.startsWith("product:view:")) {
        const productId = id.split(":")[2];
        state.currentFlow = 'checking_stock';
        await this.sendProductDetails(userPhone, productId);
        return;
      }

      // Product selection buttons (new format)
      if (id.startsWith("select_product_")) {
        console.log('Handling select_product_ button:', id);
        const response = await this.handleProductSelectionButton(userPhone, id, state);
        console.log('Button response:', response);
        if (response && response.trim()) {
          await this.sendWhatsAppMessage(userPhone, response);
        }
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
          const stockInfo = `📊 *${product.name}*\n` +
            `SKU: ${product.sku}\n` +
            `Type: ${product.type || 'N/A'}\n\n` +
            `📈 Stock Levels:\n` +
            `• Available: ${product.stockAvailable || 0} units\n` +
            `• Total: ${product.stockTotal || 0} units\n` +
            `• Used: ${product.stockUsed || 0} units\n` +
            `• Min Level: ${product.minStockLevel || 0} units\n\n` +
            `💰 Price: $${product.price || 0}\n\n` +
            `What would you like to do?`;
          
          await this.sendInteractiveButtons(
            userPhone,
            stockInfo,
            [
              { id: `product:add:${product.id}`, title: "Add Stock" },
              { id: `product:order:${product.id}`, title: "Create Order" },
              { id: "main:check_stock", title: "Check Another" }
            ],
            "Stock Info"
          );
        } else {
          await this.sendWhatsAppMessage(userPhone, "❌ Product not found.");
        }
        return;
      }
      if (id.startsWith("product:select:")) {
        const productId = id.split(":")[2];
        if (state.pendingStockAddition?.awaitingProductSelection) {
          const selected = await storage.getProduct(productId);
          if (selected) {
            state.pendingStockAddition.productId = selected.id;
            state.pendingStockAddition.productName = selected.name;
            state.pendingStockAddition.sku = selected.sku || '';
            state.pendingStockAddition.currentStock = selected.stockAvailable || 0;
            state.pendingStockAddition.awaitingProductSelection = false;
            if (state.pendingStockAddition.awaitingQuantity) {
              await this.sendWhatsAppMessage(userPhone, `How many units of ${selected.name} should I add?`);
              return;
            }
          }
        }
        await this.handleProductIdentified(userPhone, productId, state);
        return;
      }

      // Order step helpers
      if (id === "order:add_more") {
        // Preserve existing items when adding more
        if (!state.pendingOrder) {
          state.pendingOrder = { items: [], step: 'collecting_items' } as any;
        }
        state.pendingOrder.step = 'collecting_items';
        await this.sendWhatsAppMessage(userPhone, "Add another item. Example: '5 units of bolts'");
        return;
      }
      if (id === "order:proceed") {
        const response = await this.handleOrderCreation(userPhone, "proceed", state);
        if (response && response.trim()) await this.sendWhatsAppMessage(userPhone, response);
        return;
      }
      if (id === "cust:skip_email") {
        if (state.pendingOrder && state.pendingOrder.currentQuestion === 'customer_email') {
          const response = await this.handleOrderCreation(userPhone, "skip", state);
          if (response && response.trim()) await this.sendWhatsAppMessage(userPhone, response);
          return;
        }
      }
      if (id === "order:cancel") {
        if (state.pendingOrder) {
          state.pendingOrder = undefined;
          state.currentFlow = 'idle';
          await this.sendWhatsAppMessage(userPhone, "❌ Order cancelled. How can I help you?");
          return;
        }
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
          const waUser = await storage.getOrCreateUserByPhone(state.userPhone);
          const purchase = await storage.createPurchase({
            userId: waUser.id,
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
