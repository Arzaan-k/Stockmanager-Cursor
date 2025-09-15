import { storage } from "../storage";
import { analyzeProductImage, generateWhatsAppResponse, parseInventoryCommand } from "./gemini";

export class WhatsAppService {
  private webhookToken: string;
  private accessToken: string;
  private phoneNumberId: string;
  private graphVersion: string;
  private refreshToken: string;
  private tokenExpiryTime: number;
  private appId: string;
  private appSecret: string;

  constructor() {
    this.webhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN || "your-webhook-token";
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "your-access-token";
    this.refreshToken = process.env.WHATSAPP_REFRESH_TOKEN || "";
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";
    this.tokenExpiryTime = parseInt(process.env.WHATSAPP_TOKEN_EXPIRY || '0') || Date.now() + 24 * 60 * 60 * 1000; // Default 24h from now
    this.appId = process.env.META_APP_ID || "";
    this.appSecret = process.env.META_APP_SECRET || "";
  }

  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string | null> {
    if (mode === "subscribe" && token === this.webhookToken) {
      return challenge;
    }
    return null;
  }

  async processIncomingMessage(messageData: any): Promise<void> {
    try {
      const value = messageData?.entry?.[0]?.changes?.[0]?.value;
      if (!value) return;

      const { messages, contacts, statuses } = value;

      // Outbound delivery status updates (sent, delivered, read, failed)
      if (Array.isArray(statuses) && statuses.length > 0) {
        for (const s of statuses) {
          const recipient = s?.recipient_id;
          const status = s?.status;
          const errorInfo = s?.errors ? JSON.stringify(s.errors) : undefined;
          console.log("WhatsApp delivery status", { recipient, status, errorInfo });
          try {
            await storage.createWhatsappLog({
              userPhone: recipient,
              action: "outbound_status",
              aiResponse: errorInfo || `status:${status}`,
              status: status || "unknown",
            });
          } catch (logError) {
            console.error("Failed to log WhatsApp status:", logError);
          }
        }
      }

      // Inbound messages from users
      if (!messages || messages.length === 0) return;

      const message = messages[0];
      const contact = contacts?.[0];
      const userPhone = contact?.wa_id;
      if (!userPhone) return;

      // Ensure conversation and store inbound message
      const conv = await storage.getOrCreateConversation(userPhone);
      // Log all message types to chat history
      try {
        await storage.addWhatsappMessage({
          conversationId: conv.id,
          direction: "inbound",
          sender: "user",
          body: message.type === "text" ? (message.text.body || "") : `[${message.type}]`,
          meta: message,
        });
      } catch (logError) {
        console.error("Failed to log incoming WhatsApp message:", logError);
      }

      // Check token status before processing messages
      if (Date.now() >= this.tokenExpiryTime) {
        console.log("Token expired, attempting to refresh before processing message...");
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          // Log the issue but continue processing the message in the database
          console.warn("Token refresh failed, but will continue processing message in database");
          await storage.createWhatsappLog({
            userPhone,
            action: "token_expired_incoming",
            aiResponse: "Unable to respond due to expired tokens",
            status: "error",
          });
          
          // Still store the message in the database even if we can't respond
          return;
        }
      }

      // Handle different message types
      try {
        if (message.type === "image") {
          await this.handleImageMessage(userPhone, message);
        } else if (message.type === "text") {
          await this.handleTextMessage(userPhone, message.text.body);
        }
      } catch (processingError) {
        console.error("Error handling WhatsApp message:", processingError);
        // Try to notify the user about the error
        try {
          await this.sendWhatsAppMessage(userPhone, "Sorry, I'm having trouble processing your message right now. Our team has been notified.");
        } catch (notificationError) {
          console.error("Failed to send error notification to user:", notificationError);
        }
        
        // Log the error for admin visibility
        await storage.createWhatsappLog({
          userPhone,
          action: "message_processing_error",
          aiResponse: processingError.message || "Unknown error",
          status: "error",
        });
      }
    } catch (error) {
      console.error("Error processing WhatsApp message:", error);
    }
  }

  private async handleImageMessage(userPhone: string, message: any): Promise<void> {
    try {
      // Download image from WhatsApp
      const imageUrl = await this.downloadWhatsAppImage(message.image.id);
      
      // Convert to base64
      const base64Image = await this.imageUrlToBase64(imageUrl);
      
      // Analyze with AI
      const analysis = await analyzeProductImage(base64Image);
      
      // Try to find the product by SKU first
      let product = await storage.getProductBySku(analysis.suggestedSku || "");
      
      // If not found by SKU, try to find by name or possible matches
      if (!product) {
        // Try exact name match
        const productsByName = await storage.searchProducts(analysis.productName);
        if (productsByName.length > 0) {
          product = productsByName[0];
        } else if (analysis.possibleMatches && analysis.possibleMatches.length > 0) {
          // Try possible matches
          for (const possibleMatch of analysis.possibleMatches) {
            const matchedProducts = await storage.searchProducts(possibleMatch);
            if (matchedProducts.length > 0) {
              product = matchedProducts[0];
              break;
            }
          }
        }
      }
      
      // If still not found, try fuzzy search with product name
      if (!product) {
        const fuzzyResults = await storage.searchProductsFuzzy(analysis.productName);
        if (fuzzyResults.length > 0) {
          // Store the fuzzy search results in conversation state for later selection
          const conversation = await storage.getOrCreateConversation(userPhone);
          await storage.updateConversation(conversation.id, {
            state: {
              ...conversation.state,
              pendingProductSelection: fuzzyResults.slice(0, 5),
              detectedProductName: analysis.productName
            }
          });
        }
      }
      
      // Log the interaction
      await storage.createWhatsappLog({
        userPhone,
        productId: product?.id,
        action: "product_inquiry",
        aiResponse: `Detected: ${analysis.productName}`,
        imageUrl,
        confidence: analysis.confidence.toString(),
        status: "processed",
      });

      // Generate and send response
      let responseText = `🔍 I detected: ${analysis.productName}\n`;
      responseText += `Category: ${analysis.category}\n`;
      responseText += `Confidence: ${Math.round(analysis.confidence * 100)}%\n\n`;

      if (product) {
        responseText += `✅ Found in inventory!\n`;
        responseText += `SKU: ${product.sku}\n`;
        responseText += `Stock available: ${product.stockAvailable}\n\n`;
        responseText += `What would you like to do?\n`;
        responseText += `1️⃣ Add stock\n`;
        responseText += `2️⃣ Use stock for order\n`;
        responseText += `3️⃣ Check details`;
        
        // Store the identified product in conversation state
        const conversation = await storage.getOrCreateConversation(userPhone);
        await storage.updateConversation(conversation.id, {
          state: {
            ...conversation.state,
            lastIdentifiedProduct: product.id
          }
        });
      } else {
        const conversation = await storage.getOrCreateConversation(userPhone);
        const fuzzyResults = conversation.state?.pendingProductSelection;
        
        if (fuzzyResults && fuzzyResults.length > 0) {
          responseText += `❓ I couldn't find an exact match for "${analysis.productName}", but I found these similar products:\n\n`;
          fuzzyResults.forEach((p: any, index: number) => {
            responseText += `${index + 1}. ${p.name} (SKU: ${p.sku}) - Stock: ${p.stockAvailable}\n`;
          });
          responseText += `\nPlease reply with the number of the correct product, or type "none" if none of these match.`;
        } else {
          responseText += `❌ Product not found in inventory.\n`;
          responseText += `Would you like to add this as a new product?`;
        }
      }

      // Log the response message
      const conversation = await storage.getOrCreateConversation(userPhone);
      await storage.addWhatsappMessage({
        conversationId: conversation.id,
        direction: "outbound",
        sender: "ai",
        body: responseText,
        meta: { type: "text", text: { body: responseText } },
      });

      await this.sendWhatsAppMessage(userPhone, responseText);
    } catch (error) {
      console.error("Error handling image message:", error);
      const errorMsg = "Sorry, I couldn't process that image. Please try again.";
      
      // Log the error message
      const conversation = await storage.getOrCreateConversation(userPhone);
      await storage.addWhatsappMessage({
        conversationId: conversation.id,
        direction: "outbound",
        sender: "ai",
        body: errorMsg,
        meta: { type: "text", text: { body: errorMsg } },
      });
      
      await this.sendWhatsAppMessage(userPhone, errorMsg);
    }
  }

  private async handleTextMessage(userPhone: string, messageText: string): Promise<void> {
    try {
      // Conversation state
      const conversation = await storage.getOrCreateConversation(userPhone);
      const state: any = conversation.state || { cart: [], step: undefined, pendingSelection: undefined, pendingProductSelection: undefined, customer: {} };

      // Get recent context from logs
      const recentLogs = await storage.getWhatsappLogs();
      const userLogs = recentLogs.filter(log => log.userPhone === userPhone).slice(0, 5);
      const text = (messageText || "").trim();

      // First get the products for context
      const products = await storage.getProducts({});

      // Get AI response with potential actions
      const aiResponse = await generateWhatsAppResponse(messageText, { 
        products,
        userLogs,
        conversation: conversation
      }, userPhone);

      // Track if we've handled the message
      let messageHandled = false;

      // If there's a pending stock action, execute it
      if (aiResponse.pendingAction) {
        switch (aiResponse.pendingAction.type) {
          case 'confirm_stock': {
            const product = await storage.getProduct(aiResponse.pendingAction.productId!);
            if (product && aiResponse.pendingAction.quantity) {
              // Perform stock update
              const newTotal = (product.stockTotal ?? 0) + aiResponse.pendingAction.quantity;
              const newAvailable = (product.stockAvailable ?? 0) + aiResponse.pendingAction.quantity;
              await storage.updateProduct(product.id, {
                stockTotal: newTotal,
                stockAvailable: newAvailable,
              });
              await storage.createStockMovement({
                productId: product.id,
                action: "add",
                quantity: aiResponse.pendingAction.quantity,
                previousStock: product.stockAvailable,
                newStock: newAvailable,
                reason: "Added via WhatsApp"
              });
              await this.sendWhatsAppMessage(userPhone, 
                `✅ Successfully updated stock for ${product.name}.\nNew stock level: ${newAvailable} units`);
              messageHandled = true;
            }
            break;
          }
          case 'add_stock': {
            const product = await storage.getProduct(aiResponse.pendingAction.productId!);
            if (product && aiResponse.pendingAction.quantity) {
              // Confirm with user
              await this.sendWhatsAppMessage(userPhone,
                `Going to add ${aiResponse.pendingAction.quantity} units to ${product.name}. Current stock is ${product.stockAvailable}. Is this correct?`);
              messageHandled = true;
            }
            break;
          }
          case 'use_stock': {
            const product = await storage.getProduct(aiResponse.pendingAction.productId!);
            if (product && aiResponse.pendingAction.quantity) {
              if (product.stockAvailable < aiResponse.pendingAction.quantity) {
                await this.sendWhatsAppMessage(userPhone,
                  `⚠️ Cannot use ${aiResponse.pendingAction.quantity} units of ${product.name}. Only ${product.stockAvailable} units available.`);
                messageHandled = true;
                break;
              }
              // Confirm with user
              await this.sendWhatsAppMessage(userPhone,
                `Going to use ${aiResponse.pendingAction.quantity} units from ${product.name}. Current stock is ${product.stockAvailable}. Is this correct?`);
              messageHandled = true;
            }
            break;
          }
        }
      }

      // Only send AI response if we haven't handled the message through an action
      if (!messageHandled && aiResponse.response) {
        await this.sendWhatsAppMessage(userPhone, aiResponse.response);
        messageHandled = true;
      }

      // Helper: find last referenced product from logs or conversation state
      let product;
      if (state.lastIdentifiedProduct) {
        product = await storage.getProduct(state.lastIdentifiedProduct);
      } else {
        const lastWithProduct = userLogs.find(l => l.productId);
        product = lastWithProduct?.productId ? await storage.getProduct(lastWithProduct.productId) : undefined;
      }
      
      // Log the incoming message for dashboard chat history only if we haven't handled it yet
      if (!messageHandled) {
        await storage.addWhatsappMessage({
          conversationId: conversation.id,
          direction: "inbound",
          sender: "user",
          body: text,
          meta: { type: "text", text: { body: text } },
        });
      }

      // Helper: check for pending action awaiting quantity
      const pending = recentLogs.find(l => l.userPhone === userPhone && l.status === "pending" && (l.action === "stock_add_request" || l.action === "stock_use_request"));

      // If awaiting quantity, parse number and execute
      const qtyFromText = (() => {
        const m = text.match(/(-?\d+)/);
        return m ? Math.abs(parseInt(m[1], 10)) : undefined;
      })();

      if (pending && product && qtyFromText && qtyFromText > 0) {
        if (pending.action === "stock_add_request") {
          // Perform add
          const newTotal = (product.stockTotal ?? 0) + qtyFromText;
          const newAvailable = (product.stockAvailable ?? 0) + qtyFromText;
          await storage.updateProduct(product.id, {
            stockTotal: newTotal,
            stockAvailable: newAvailable,
          });
          await storage.createStockMovement({
            productId: product.id,
            action: "add",
            quantity: qtyFromText,
            previousStock: product.stockAvailable,
            newStock: newAvailable,
            reason: "Added via WhatsApp",
          });
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_add", quantity: qtyFromText, status: "processed" });
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_add_request", status: "processed" });
          await this.sendWhatsAppMessage(userPhone, `✅ Added ${qtyFromText} to ${product.name} (SKU: ${product.sku}). New available: ${newAvailable}`);
          
          // WebSocket broadcast temporarily disabled due to compilation issues
          // if ((global as any).webSocketService) {
          //   (global as any).webSocketService.broadcastInventoryUpdate(product.id);
          // }
          return;
        }
        if (pending.action === "stock_use_request") {
          // Perform use
          const newUsed = (product.stockUsed ?? 0) + qtyFromText;
          const newAvailable = (product.stockTotal ?? 0) - newUsed;
          await storage.updateProduct(product.id, {
            stockUsed: newUsed,
            stockAvailable: newAvailable,
          });
          await storage.createStockMovement({
            productId: product.id,
            action: "use",
            quantity: -qtyFromText,
            previousStock: product.stockAvailable,
            newStock: newAvailable,
            reason: "Used via WhatsApp",
          });
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_use", quantity: qtyFromText, status: "processed" });
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_use_request", status: "processed" });
          let msg = `✅ Used ${qtyFromText} from ${product.name} (SKU: ${product.sku}). New available: ${newAvailable}`;
          if (newAvailable <= (product.minStockLevel ?? 0)) {
            msg += `\n⚠️ Stock is at or below minimum level (${product.minStockLevel}).`;
          }
          await this.sendWhatsAppMessage(userPhone, msg);
          return;
        }
      }

      // Handle stateful customer detail collection for checkout
      if (state.step && text) {
        if (state.step === "collect_name") {
          state.customer = { ...(state.customer || {}), name: text };
          state.step = "collect_phone";
          await storage.updateConversation(conversation.id, { state });
          await this.sendWhatsAppMessage(userPhone, "Please share your phone number (or reply 'skip').");
          return;
        }
        if (state.step === "collect_phone") {
          if (text.toLowerCase() !== "skip") state.customer = { ...(state.customer || {}), phone: text };
          state.step = "collect_email";
          await storage.updateConversation(conversation.id, { state });
          await this.sendWhatsAppMessage(userPhone, "Please share your email (or reply 'skip').");
          return;
        }
        if (state.step === "collect_email") {
          if (text.toLowerCase() !== "skip") state.customer = { ...(state.customer || {}), email: text };
          state.step = "collect_address";
          await storage.updateConversation(conversation.id, { state });
          await this.sendWhatsAppMessage(userPhone, "Please share your address/location (or reply 'skip').");
          return;
        }
        if (state.step === "collect_address") {
          if (text.toLowerCase() !== "skip") state.customer = { ...(state.customer || {}), address: text };
          // Create order from cart
          const items = [] as any[];
          let subtotal = 0;
          let hasOutOfStockItems = false;
          const outOfStockDetails = [] as any[];
          
          for (const it of state.cart || []) {
            const p = await storage.getProduct(it.productId);
            if (!p) continue;
            const unitPrice = Number(p.price || 0);
            const totalPrice = unitPrice * it.quantity;
            subtotal += totalPrice;
            items.push({ productId: p.id, quantity: it.quantity, unitPrice: unitPrice.toString(), totalPrice: totalPrice.toString() });
            
            // Check if this item would exceed available stock
            if (it.quantity > (p.stockAvailable || 0)) {
              hasOutOfStockItems = true;
              outOfStockDetails.push({
                productName: p.name,
                requested: it.quantity,
                available: p.stockAvailable || 0
              });
            } else {
              // Update product stock immediately for in-stock items
              const newUsed = (p.stockUsed || 0) + it.quantity;
              const newAvailable = (p.stockTotal || 0) - newUsed;
              await storage.updateProduct(p.id, {
                stockUsed: newUsed,
                stockAvailable: newAvailable,
              });
              await storage.createStockMovement({
                productId: p.id,
                action: "use",
                quantity: -it.quantity,
                previousStock: p.stockAvailable,
                newStock: newAvailable,
                reason: "Used in WhatsApp order",
              });
              
              // WebSocket broadcast temporarily disabled due to compilation issues
              // if ((global as any).webSocketService) {
              //   (global as any).webSocketService.broadcastInventoryUpdate(p.id);
              // }
            }
          }
          
          const orderData = {
            customerName: state.customer?.name || "WhatsApp Customer",
            customerEmail: state.customer?.email,
            customerPhone: state.customer?.phone || userPhone,
            location: state.customer?.address,
            subtotal: subtotal.toString(),
            tax: "0",
            total: subtotal.toString(),
            notes: "Created via WhatsApp",
            status: hasOutOfStockItems ? "needs_approval" : "pending",
            approvalStatus: hasOutOfStockItems ? "needs_approval" : "not_needed",
            source: "whatsapp",
          } as any;
          
          const order = await storage.createOrder(orderData, items);
          
          // If order needs approval, create approval request
          if (hasOutOfStockItems) {
            await storage.requestApproval(order.id, "WhatsApp Bot", "Order created via WhatsApp with out-of-stock items");
          }
          
          // Prepare order confirmation message
          const orderConfirmationMessage = (() => {
            const parts = [] as string[];
            parts.push(`🧾 Order ${order.orderNumber} created with ${items.length} item(s). Total: ₹${subtotal}.`);
            
            if (hasOutOfStockItems) {
              parts.push("Some items exceed available stock:");
              for (const item of outOfStockDetails) {
                parts.push(`- ${item.productName}: requested ${item.requested}, available ${item.available}`);
              }
              parts.push("\nOrder sent for approval. You'll be notified once approved.");
            } else {
              parts.push("Order is confirmed. Thank you!");
            }
            return parts.join("\n");
          })();

          // Send single order confirmation message
          await this.sendWhatsAppMessage(userPhone, orderConfirmationMessage);
          messageHandled = true; // Prevent further responses for this message
          // Reset cart/state
          state.cart = [];
          state.step = undefined;
          state.pendingSelection = undefined;
          await storage.updateConversation(conversation.id, { state });
          return;
        }
      }

      // Handle product selection from fuzzy search results
      if (state.pendingProductSelection && /^\d+$/.test(text)) {
        const idx = parseInt(text, 10) - 1;
        const fuzzyResults = state.pendingProductSelection;
        
        if (idx >= 0 && idx < fuzzyResults.length) {
          const selectedProduct = fuzzyResults[idx];
          
          // Update conversation state with selected product
          state.lastIdentifiedProduct = selectedProduct.id;
          state.pendingProductSelection = undefined;
          await storage.updateConversation(conversation.id, { state });
          
          // Send confirmation message
          const responseText = `✅ Product confirmed: ${selectedProduct.name}\n` +
                             `SKU: ${selectedProduct.sku}\n` +
                             `Stock available: ${selectedProduct.stockAvailable}\n\n` +
                             `What would you like to do?\n` +
                             `1️⃣ Add stock\n` +
                             `2️⃣ Use stock for order\n` +
                             `3️⃣ Check details`;
          
          // Log the response message
          await storage.addWhatsappMessage({
            conversationId: conversation.id,
            direction: "outbound",
            sender: "ai",
            body: responseText,
            meta: { type: "text", text: { body: responseText } },
          });
          
          await this.sendWhatsAppMessage(userPhone, responseText);
          return;
        } else {
          const responseText = "Invalid selection. Please try again or type 'none' to cancel.";
          await storage.addWhatsappMessage({
            conversationId: conversation.id,
            direction: "outbound",
            sender: "ai",
            body: responseText,
            meta: { type: "text", text: { body: responseText } },
          });
          await this.sendWhatsAppMessage(userPhone, responseText);
          return;
        }
      }
      
      // Handle 'none' response for fuzzy search
      if (state.pendingProductSelection && text.toLowerCase() === "none") {
        state.pendingProductSelection = undefined;
        await storage.updateConversation(conversation.id, { state });
        
        const responseText = "No matching product selected. Would you like to add this as a new product?";
        await storage.addWhatsappMessage({
          conversationId: conversation.id,
          direction: "outbound",
          sender: "ai",
          body: responseText,
          meta: { type: "text", text: { body: responseText } },
        });
        await this.sendWhatsAppMessage(userPhone, responseText);
        return;
      }
      
      // Selection response for previous search (choose product by index and optional qty)
      if (state.pendingSelection && /^\d+/.test(text)) {
        const idx = parseInt(text.split(/\s+/)[0], 10) - 1;
        const qty = (() => { const m = text.match(/x\s*(\d+)/i); return m ? parseInt(m[1], 10) : 1; })();
        const candidate = state.pendingSelection[idx];
        if (candidate) {
          state.cart = state.cart || [];
          state.cart.push({ productId: candidate.id, quantity: qty });
          state.pendingSelection = undefined;
          await storage.updateConversation(conversation.id, { state });
          await this.sendWhatsAppMessage(userPhone, `Added ${qty} x ${candidate.name} (SKU: ${candidate.sku}) to your cart. Reply 'cart' to view or 'checkout' to proceed.`);
          return;
        }
      }

      // Quick add-to-cart: "order add <qty> <sku>"
      const mOrderAdd = text.match(/^order\s+add\s+(\d+)\s+(\S+)/i);
      if (mOrderAdd) {
        const qty = parseInt(mOrderAdd[1], 10);
        const sku = mOrderAdd[2];
        const prod = await storage.getProductBySku(sku);
        if (!prod) {
          await this.sendWhatsAppMessage(userPhone, `SKU ${sku} not found.`);
          return;
        }
        state.cart = state.cart || [];
        state.cart.push({ productId: prod.id, quantity: qty });
        await storage.updateConversation(conversation.id, { state });
        await this.sendWhatsAppMessage(userPhone, `Added ${qty} x ${prod.name} (SKU: ${prod.sku}) to your cart. Reply 'cart' to view or 'checkout' to proceed.`);
        return;
      }

      // Show cart
      if (/^cart$/i.test(text)) {
        if (!state.cart || state.cart.length === 0) {
          await this.sendWhatsAppMessage(userPhone, "Your cart is empty. Use 'order add <qty> <sku>' or type 'spare <name>' to search.");
          return;
        }
        let msg = "🛒 Your Cart:\n";
        for (const it of state.cart) {
          const p = await storage.getProduct(it.productId);
          if (!p) continue;
          msg += `• ${it.quantity} x ${p.name} (SKU: ${p.sku}) | Avl: ${p.stockAvailable}\n`;
        }
        msg += "\nReply 'checkout' to place the order, or 'spare <name>' to add more.";
        await this.sendWhatsAppMessage(userPhone, msg);
        return;
      }

      // Checkout
      if (/^checkout$/i.test(text)) {
        if (!state.cart || state.cart.length === 0) {
          await this.sendWhatsAppMessage(userPhone, "Your cart is empty. Add items first.");
          return;
        }
        state.step = "collect_name";
        await storage.updateConversation(conversation.id, { state });
        await this.sendWhatsAppMessage(userPhone, "Please share your name to proceed with the order.");
        return;
      }

      // Search spare parts/products by name
      const mSpare = text.match(/^(spare|find|search)\s+(.+)/i);
      if (mSpare) {
        const q = mSpare[2].trim();
        const results = (await storage.getProducts({ search: q })).slice(0, 5);
        if (!results.length) {
          await this.sendWhatsAppMessage(userPhone, `No products found for "${q}".`);
          return;
        }
        state.pendingSelection = results.map((r: any) => ({ id: r.id, sku: r.sku, name: r.name }));
        await storage.updateConversation(conversation.id, { state });
        let msg = `Found ${results.length} item(s). Reply with the number to add to cart (e.g., '1 x 2'):\n`;
        results.forEach((r: any, i: number) => {
          msg += `${i + 1}. ${r.name} (SKU: ${r.sku}) | Avl: ${r.stockAvailable}\n`;
        });
        await this.sendWhatsAppMessage(userPhone, msg);
        return;
      }

      // Stock commands: add/use quantity to SKU
      const mAdd = text.match(/^add\s+(\d+)\s+(\S+)/i);
      if (mAdd) {
        const qty = parseInt(mAdd[1], 10);
        const sku = mAdd[2];
        const prod = await storage.getProductBySku(sku);
        if (!prod) { await this.sendWhatsAppMessage(userPhone, `SKU ${sku} not found.`); return; }
        const newTotal = (prod.stockTotal ?? 0) + qty;
        const newAvailable = (prod.stockAvailable ?? 0) + qty;
        await storage.updateProduct(prod.id, { stockTotal: newTotal, stockAvailable: newAvailable });
        await storage.createStockMovement({ productId: prod.id, action: "add", quantity: qty, previousStock: prod.stockAvailable, newStock: newAvailable, reason: "Added via WhatsApp" });
        await this.sendWhatsAppMessage(userPhone, `✅ Added ${qty} to ${prod.name} (SKU: ${prod.sku}). New available: ${newAvailable}`);
        return;
      }
      const mUse = text.match(/^use\s+(\d+)\s+(\S+)/i);
      if (mUse) {
        const qty = parseInt(mUse[1], 10);
        const sku = mUse[2];
        const prod = await storage.getProductBySku(sku);
        if (!prod) { await this.sendWhatsAppMessage(userPhone, `SKU ${sku} not found.`); return; }
        const newUsed = (prod.stockUsed ?? 0) + qty;
        const newAvailable = (prod.stockTotal ?? 0) - newUsed;
        await storage.updateProduct(prod.id, { stockUsed: newUsed, stockAvailable: newAvailable });
        await storage.createStockMovement({ productId: prod.id, action: "use", quantity: -qty, previousStock: prod.stockAvailable, newStock: newAvailable, reason: "Used via WhatsApp" });
        let msg = `✅ Used ${qty} from ${prod.name} (SKU: ${prod.sku}). New available: ${newAvailable}`;
        if (newAvailable <= (prod.minStockLevel ?? 0)) msg += `\n⚠️ Stock is at/below minimum (${prod.minStockLevel ?? 0}).`;
        await this.sendWhatsAppMessage(userPhone, msg);
        return;
      }

      // Parse intents: 1(add), 2(use), 3(details) from previous AI image result
      if (product) {
        const lower = text.toLowerCase();
        if (lower === "1" || lower.startsWith("add")) {
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_add_request", status: "pending" });
          await this.sendWhatsAppMessage(userPhone, `How many units of ${product.name} (SKU: ${product.sku}) would you like to add?`);
          return;
        }
        if (lower === "2" || lower.startsWith("use")) {
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_use_request", status: "pending" });
          await this.sendWhatsAppMessage(userPhone, `How many units of ${product.name} (SKU: ${product.sku}) would you like to use?`);
          return;
        }
        if (lower === "3" || lower.includes("detail")) {
          const details = `📦 ${product.name} (SKU: ${product.sku})\nType: ${product.type}\nAvailable: ${product.stockAvailable}\nTotal: ${product.stockTotal}\nMin Level: ${product.minStockLevel ?? 0}`;
          await this.sendWhatsAppMessage(userPhone, details);
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "product_details", status: "processed" });
          return;
        }
      }

      // First try to parse as inventory command using NLP
      if (!messageHandled) {
        const inventoryCommand = await parseInventoryCommand(text, await storage.getProducts({}));
        if (inventoryCommand.action !== "unknown") {
          try {
            switch (inventoryCommand.action) {
              case "add_stock": {
                // Search for products by name first
                const addProducts = inventoryCommand.productName ? 
                  await storage.searchProducts(inventoryCommand.productName) : [];
                const addProd = addProducts.length > 0 ? addProducts[0] : null;
                
                if (!addProd) {
                  // Search for similar products using fuzzy search
                  const similarProducts = (await storage.getProducts({ search: inventoryCommand.productName })).slice(0, 5);
                  if (similarProducts.length > 0) {
                    state.pendingSelection = similarProducts.map((p: any) => ({ id: p.id, sku: p.sku, name: p.name }));
                    await storage.updateConversation(conversation.id, { state });
                    let msg = `I couldn't find "${inventoryCommand.productName}". Did you mean one of these? Reply with the number:\n`;
                    similarProducts.forEach((p: any, i: number) => {
                      msg += `${i + 1}. ${p.name} (SKU: ${p.sku}) | Avl: ${p.stockAvailable}\n`;
                    });
                    await this.sendWhatsAppMessage(userPhone, msg);
                    return;
                  } else {
                    await this.sendWhatsAppMessage(userPhone, `Product "${inventoryCommand.productName}" not found. Please check the spelling or try a different product.`);
                    return;
                  }
                }
                
                const addQty = inventoryCommand.quantity || 1;
                const newTotal = (addProd.stockTotal ?? 0) + addQty;
                const newAvailable = (addProd.stockAvailable ?? 0) + addQty;
                await storage.updateProduct(addProd.id, { stockTotal: newTotal, stockAvailable: newAvailable });
                await storage.createStockMovement({ 
                  productId: addProd.id, 
                  action: "add", 
                  quantity: addQty, 
                  previousStock: addProd.stockAvailable, 
                  newStock: newAvailable, 
                  reason: "Added via WhatsApp NLP command" 
                });
                await this.sendWhatsAppMessage(userPhone, `✅ Added ${addQty} to ${addProd.name} (SKU: ${addProd.sku}). New available stock: ${newAvailable}`);
                return;
              }
            
              case "use_stock": {
                // Search for products by name first
                const useProducts = inventoryCommand.productName ?
                  await storage.searchProducts(inventoryCommand.productName) : [];
                const useProd = useProducts.length > 0 ? useProducts[0] : null;
                
                if (!useProd) {
                  // Search for similar products using fuzzy search
                  const similarProducts = (await storage.getProducts({ search: inventoryCommand.productName })).slice(0, 5);
                  if (similarProducts.length > 0) {
                    state.pendingSelection = similarProducts.map((p: any) => ({ id: p.id, sku: p.sku, name: p.name }));
                    await storage.updateConversation(conversation.id, { state });
                    let msg = `I couldn't find "${inventoryCommand.productName}". Did you mean one of these? Reply with the number:\n`;
                    similarProducts.forEach((p: any, i: number) => {
                      msg += `${i + 1}. ${p.name} (SKU: ${p.sku}) | Avl: ${p.stockAvailable}\n`;
                    });
                    await this.sendWhatsAppMessage(userPhone, msg);
                    return;
                  } else {
                    await this.sendWhatsAppMessage(userPhone, `Product "${inventoryCommand.productName}" not found. Please check the spelling or try a different product.`);
                    return;
                  }
                }
                
                const useQty = inventoryCommand.quantity || 1;
                if (useProd.stockAvailable < useQty) {
                  await this.sendWhatsAppMessage(userPhone, `⚠️ Not enough stock! ${useProd.name} has only ${useProd.stockAvailable} available, but you requested ${useQty}.`);
                  return;
                }
                
                const newUsed = (useProd.stockUsed ?? 0) + useQty;
                const newAvailableAfterUse = (useProd.stockAvailable ?? 0) - useQty;
                await storage.updateProduct(useProd.id, { stockUsed: newUsed, stockAvailable: newAvailableAfterUse });
                await storage.createStockMovement({ 
                  productId: useProd.id, 
                  action: "use", 
                  quantity: -useQty, 
                  previousStock: useProd.stockAvailable, 
                  newStock: newAvailableAfterUse, 
                  reason: "Used via WhatsApp NLP command" 
                });
                
                let useMsg = `✅ Used ${useQty} from ${useProd.name} (SKU: ${useProd.sku}). New available stock: ${newAvailableAfterUse}`;
                if (newAvailableAfterUse <= (useProd.minStockLevel ?? 0)) {
                  useMsg += `\n⚠️ Stock is at/below minimum level (${useProd.minStockLevel ?? 0}). Consider restocking.`;
                }
                await this.sendWhatsAppMessage(userPhone, useMsg);
                return;
              }
            
              case "create_order": {
                // For order creation, we'll use the existing cart system
                const orderProd = inventoryCommand.productName ?
                  await storage.getProductBySku(inventoryCommand.productName) : null;
                if (!orderProd) {
                  // Search for similar products
                  const similarProducts = (await storage.getProducts({ search: inventoryCommand.productName })).slice(0, 5);
                  if (similarProducts.length > 0) {
                    state.pendingSelection = similarProducts.map((p: any) => ({ id: p.id, sku: p.sku, name: p.name }));
                    await storage.updateConversation(conversation.id, { state });
                    let msg = `I couldn't find "${inventoryCommand.productName}". Did you mean one of these? Reply with the number and quantity (e.g., '1 x 2'):\n`;
                    similarProducts.forEach((p: any, i: number) => {
                      msg += `${i + 1}. ${p.name} (SKU: ${p.sku}) | Avl: ${p.stockAvailable}\n`;
                    });
                    await this.sendWhatsAppMessage(userPhone, msg);
                    return;
                  } else {
                    await this.sendWhatsAppMessage(userPhone, `Product "${inventoryCommand.productName}" not found. Please check the spelling or try a different product.`);
                    return;
                  }
                }
                
                const orderQty = inventoryCommand.quantity || 1;
                state.cart = state.cart || [];
                state.cart.push({ productId: orderProd.id, quantity: orderQty });
                await storage.updateConversation(conversation.id, { state });
                await this.sendWhatsAppMessage(userPhone, `Added ${orderQty} x ${orderProd.name} (SKU: ${orderProd.sku}) to your cart. Reply 'cart' to view or 'checkout' to proceed.`);
                return;
              }
            }
          } catch (error) {
            console.error("Error handling inventory command:", error);
            await this.sendWhatsAppMessage(userPhone, "Sorry, I had trouble processing your request. Please try again.");
            return;
          }
        }
      }

      if (product) {
        const lower = text.toLowerCase();
        if (lower === "1" || lower.startsWith("add")) {
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_add_request", status: "pending" });
          await this.sendWhatsAppMessage(userPhone, `How many units of ${product.name} (SKU: ${product.sku}) would you like to add?`);
          return;
        }
        if (lower === "2" || lower.startsWith("use")) {
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "stock_use_request", status: "pending" });
          await this.sendWhatsAppMessage(userPhone, `How many units of ${product.name} (SKU: ${product.sku}) would you like to use?`);
          return;
        }
        if (lower === "3" || lower.includes("detail")) {
          const details = `📦 ${product.name} (SKU: ${product.sku})\nType: ${product.type}\nAvailable: ${product.stockAvailable}\nTotal: ${product.stockTotal}\nMin Level: ${product.minStockLevel ?? 0}`;
          await this.sendWhatsAppMessage(userPhone, details);
          await storage.createWhatsappLog({ userPhone, productId: product.id, action: "product_details", status: "processed" });
          return;
        }
      }

      // If we reach here, fall back to AI responder
      const allProducts = await storage.getProducts({});
      const response = await generateWhatsAppResponse(messageText, { 
        userLogs,
        products: allProducts,
        conversation: conversation
      });
      const aiResponseText = aiResponse.response;
      await this.sendWhatsAppMessage(userPhone, aiResponseText);

      await storage.createWhatsappLog({
        userPhone,
        action: "text_interaction",
        aiResponse: aiResponseText,
        status: "processed",
      });
      
      // Store the AI response in the conversation history for dashboard display
      await storage.addWhatsappMessage({
        conversationId: conversation.id,
        direction: "outbound",
        sender: "ai",
        body: aiResponseText,
        meta: { type: "text", text: { body: aiResponseText } },
      });
    } catch (error) {
      console.error("Error handling text message:", error);
      await this.sendWhatsAppMessage(userPhone, "Sorry, I couldn't process your message. Please try again.");
    }
  }

  private async downloadWhatsAppImage(imageId: string): Promise<string> {
    // WhatsApp Cloud API media retrieval is a two-step process:
    // 1) GET /{media-id} with Authorization to obtain a temporary URL
    // 2) GET the returned URL with Authorization to download the binary
    if (!this.accessToken) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
    try {
      const metaUrl = `https://graph.facebook.com/${this.graphVersion}/${imageId}`;
      const metaRes = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!metaRes.ok) {
        const text = await metaRes.text();
        throw new Error(`Failed to resolve media URL (${metaRes.status}): ${text}`);
      }
      const metaJson = await metaRes.json();
      const url: string | undefined = metaJson?.url;
      if (!url) throw new Error("Media URL not found in Graph response");

      // Return the URL for subsequent fetch; include token via headers in imageUrlToBase64
      return url;
    } catch (e) {
      console.error("downloadWhatsAppImage error", e);
      throw e;
    }
  }

  private async imageUrlToBase64(imageUrl: string): Promise<string> {
    if (!this.accessToken) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
    try {
      const res = await fetch(imageUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to download media (${res.status}): ${text}`);
      }
      const arrayBuf = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString("base64");
      // We don't know content-type reliably here; callers who need data URI can prefix if needed
      return base64;
    } catch (e) {
      console.error("imageUrlToBase64 error", e);
      throw e;
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    try {
      if (!this.refreshToken) {
        console.warn("No refresh token available for WhatsApp API");
        return false;
      }

      const url = `https://graph.facebook.com/${this.graphVersion}/oauth/access_token`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "fb_exchange_token",
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: this.refreshToken,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to refresh WhatsApp token: ${text}`);
        
        // Check if the error is due to an expired refresh token
        try {
          const errorData = JSON.parse(text);
          if (errorData?.error?.code === 190) {
            console.error("Refresh token has expired. Please obtain a new refresh token from Meta Developer Portal");
            // Notify admin about token expiration
            await this.notifyAdminAboutTokenExpiration();
          }
        } catch {}
        
        return false;
      }

      const data = await res.json();
      if (data.access_token) {
        this.accessToken = data.access_token;
        // Update expiry time (typically 60 days for long-lived tokens)
        this.tokenExpiryTime = Date.now() + (data.expires_in || 60 * 24 * 60 * 60) * 1000;
        
        // Save the new token to environment variables if possible
        if (process.env.WHATSAPP_ACCESS_TOKEN) {
          process.env.WHATSAPP_ACCESS_TOKEN = this.accessToken;
          process.env.WHATSAPP_TOKEN_EXPIRY = this.tokenExpiryTime.toString();
        }
        
        console.log("WhatsApp access token refreshed successfully");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error refreshing WhatsApp access token:", error);
      return false;
    }
  }
  
  private async notifyAdminAboutTokenExpiration(): Promise<void> {
    try {
      // Log the error to the database for admin notification
      await storage.createWhatsappLog({
        userPhone: "admin",
        action: "token_expired",
        aiResponse: "WhatsApp tokens have expired. Please obtain new tokens from Meta Developer Portal.",
        status: "error",
      });
      
      console.log("Admin notification about token expiration has been logged");
    } catch (error) {
      console.error("Failed to notify admin about token expiration:", error);
    }
  }
  
  private async logFailedMessage(phoneNumber: string, message: string, errorInfo: any): Promise<void> {
    try {
      // Store the failed message in conversation history
      const conv = await storage.getOrCreateConversation(phoneNumber);
      await storage.addWhatsappMessage({ 
        conversationId: conv.id, 
        direction: "outbound", 
        sender: "ai", 
        body: message, 
        meta: { error: errorInfo, status: "failed" } 
      });
      
      // Also log to the WhatsApp logs table for admin visibility
      await storage.createWhatsappLog({
        userPhone: phoneNumber,
        action: "message_failed",
        aiResponse: message,
        status: "error"
      });
      
      console.log("Failed WhatsApp message logged to database", { phoneNumber });
    } catch (error) {
      console.error("Failed to log failed message to database:", error);
    }
  }

  async sendWhatsAppMessage(phoneNumber: string, message: string): Promise<void> {
    try {
      // Check if token is expired and try to refresh it
      if (Date.now() >= this.tokenExpiryTime) {
        console.log("Access token expired, attempting to refresh...");
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          console.warn("Using expired token as refresh failed");
          // If this is a system message to admin, still try to send it
          if (phoneNumber !== "admin") {
            throw new Error("WhatsApp authentication failed. Please check system logs and update tokens.");
          }
        }
      }

      if (!this.accessToken) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
      if (!this.phoneNumberId) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
      const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "text",
        text: { preview_url: false, body: message },
      } as const;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const errorData = JSON.parse(text);
          
          // Check if error is due to expired token
          if (errorData?.error?.code === 190) {
            console.log("Token expired, attempting to refresh...");
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
              // Retry with new token
              return this.sendWhatsAppMessage(phoneNumber, message);
            } else {
               // Log the message to database even if we can't send it
               await this.logFailedMessage(phoneNumber, message, { error: errorData, reason: "token_expired" });
               throw new Error("WhatsApp authentication failed. Unable to send message.");
             }
          }
        } catch (parseError) {
          console.error("Error parsing WhatsApp error response:", parseError);
        }
        
        // Log the failed message to database
          await this.logFailedMessage(phoneNumber, message, { error: text, status: res.status });
          throw new Error(`WhatsApp send error (${res.status}): ${text}`);
      }
      // Optional: parse response for message ID
      const data = await res.json().catch(() => null);
      console.log("WhatsApp message sent", { to: phoneNumber, id: (data as any)?.messages?.[0]?.id });
      // Persist outbound message into conversation history
      try {
        const conv = await storage.getOrCreateConversation(phoneNumber);
        await storage.addWhatsappMessage({ 
          conversationId: conv.id, 
          direction: "outbound", 
          sender: "ai", 
          body: message, 
          meta: { ...data, messageType: "ai_response" } 
        });
        await storage.updateConversation(conv.id, { }); // touch updatedAt
      } catch (err) {
        console.error("Error logging WhatsApp message to conversation:", err);
      }
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
      // Re-throw so callers (API/UI) can handle and display a proper error
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();

