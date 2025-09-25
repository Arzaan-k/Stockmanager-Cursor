import * as fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";

const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

// Conversation state management
interface ConversationState {
  userId: string;
  userName?: string;
  currentFlow: 'idle' | 'checking_stock' | 'adding_stock' | 'creating_order' | 'removing_stock' | 'awaiting_user_name' | 'collecting_order_details';
  pendingOrder?: {
    items: Array<{
      productName: string;
      productId?: string;
      sku: string;
      quantity: number;
      confirmed: boolean;
    }>;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    containerNumber?: string;
    jobId?: string;
    purchaserName?: string;
    step: 'collecting_items' | 'collecting_customer_info' | 'confirming_details' | 'processing';
  };
  pendingStockAddition?: {
    productId: string;
    productName: string;
    quantity: number;
    addedBy?: string;
    confirmed: boolean;
  };
  lastContext?: any;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    message: string;
    timestamp: Date;
  }>;
}

// In-memory storage (replace with Redis/Database in production)
const conversationStates = new Map<string, ConversationState>();

// Levenshtein Distance calculation (keep the same)
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Enhanced product matching with fuzzy search
function findProducts(query: string, availableProducts: any[]): any[] {
  if (!query || !availableProducts.length) return [];

  const queryWords = query.toLowerCase().split(/\s+/);
  const matches = availableProducts
    .map(product => {
      const productWords = product.name.toLowerCase().split(/\s+/);
      const skuMatch = product.sku.toLowerCase().includes(query.toLowerCase());
      
      let score = 0;
      if (skuMatch) score += 0.8;
      
      queryWords.forEach(queryWord => {
        productWords.forEach(productWord => {
          if (productWord.includes(queryWord) || queryWord.includes(productWord)) {
            score += 0.3;
          } else if (levenshteinDistance(queryWord, productWord) <= 2) {
            score += 0.2;
          }
        });
      });

      return { product, score };
    })
    .filter(match => match.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(match => match.product);

  return matches;
}

// Get or create conversation state
function getConversationState(userId: string): ConversationState {
  if (!conversationStates.has(userId)) {
    conversationStates.set(userId, {
      userId,
      currentFlow: 'idle',
      conversationHistory: []
    });
  }
  return conversationStates.get(userId)!;
}

// Add message to conversation history
function addToHistory(userId: string, role: 'user' | 'assistant', message: string) {
  const state = getConversationState(userId);
  state.conversationHistory.push({
    role,
    message,
    timestamp: new Date()
  });
  
  // Keep only last 20 messages to manage memory
  if (state.conversationHistory.length > 20) {
    state.conversationHistory = state.conversationHistory.slice(-20);
  }
}

// Enhanced WhatsApp response generator with memory
export async function generateWhatsAppResponse(
  userMessage: string, 
  context: any, 
  userId: string = 'default'
): Promise<{response: string, pendingAction?: { 
  type: 'add_stock' | 'use_stock' | 'confirm_stock' | 'create_order' | 'request_user_name' | 'collect_order_details',
  productId?: string,
  quantity?: number,
  orderData?: any,
  stockData?: any
}}> {
  try {
    const state = getConversationState(userId);
    addToHistory(userId, 'user', userMessage);

    // First handle stock operation confirmations in multiple languages
    const confirmationRegex = /^(yes|ha|હા|correct|proceed|right|ok|okay|sure|confirm)/i;
    if (state.lastContext?.pendingAction && confirmationRegex.test(userMessage.toLowerCase())) {
      const pendingAction = state.lastContext.pendingAction;
      addToHistory(userId, 'assistant', "Action confirmed");
      return {
        response: "Action confirmed",
        pendingAction: {
          type: 'confirm_stock',
          productId: pendingAction.productId,
          quantity: pendingAction.quantity
        }
      };
    }

    // Build conversation context
    const recentHistory = state.conversationHistory
      .slice(-6)
      .map(h => `${h.role}: ${h.message}`)
      .join('\n');

    const availableProducts = context.products || [];
    
    // Try to detect stock operation in message first
    const stockMatch = userMessage.match(/(\d+)\s*(?:units?|pcs?|pieces?|નંગ|યુનિટ)\s+(?:of\s+)?([^0-9]+?)(?:\s+(?:માં|in|to))?\s*(?:સ્ટોક|stock|inventory)?$/i);
    if (stockMatch) {
      const quantity = parseInt(stockMatch[1], 10);
      const productQuery = stockMatch[2].trim();
      
      // Search for the product
      const products = await storage.searchProducts(productQuery);
      const fuzzyProducts = await storage.searchProductsFuzzy(productQuery);
      
      // Combine and deduplicate results
      const allProducts = [...products];
      fuzzyProducts.forEach(fp => {
        if (!allProducts.find(p => p.id === fp.id)) {
          allProducts.push(fp);
        }
      });
      
      // Check if this is an add operation
      const isAdd = /ઉમેર|add|put|insert/i.test(userMessage);
      
      if (allProducts.length === 0) {
        return {
          response: `No products found matching "${productQuery}". Please check the spelling or try a different product name.`
        };
      } else if (allProducts.length === 1) {
        // Single product found - proceed directly
        const product = allProducts[0];
        if (isAdd) {
          state.lastContext = {
            pendingAction: {
              type: 'add_stock',
              productId: product.id,
              quantity
            }
          };
          return {
            response: `Found product: ${product.name} (SKU: ${product.sku})\nCurrent stock: ${product.stockAvailable} units\nYou want to add: ${quantity} units\nPlease tell me your name for the record:`,
            pendingAction: {
              type: 'add_stock',
              productId: product.id,
              quantity
            }
          };
        }
      } else {
        // Multiple products found - show selection options
        if (isAdd) {
          // Store the context for product selection
          state.lastContext = {
            type: 'product_selection',
            productQuery,
            quantity,
            action: 'add_stock',
            products: allProducts.slice(0, 5) // Limit to 5 products for buttons
          };
          
          // Return a special response that will trigger button sending
          return {
            response: `MULTIPLE_PRODUCTS_FOUND:${allProducts.length}:${productQuery}:${quantity}:add_stock`,
            pendingAction: {
              type: 'select_product',
              productQuery,
              quantity,
              action: 'add_stock',
              products: allProducts.slice(0, 5)
            }
          };
        }
      }
    }

    // If no stock operation detected, proceed with normal response
    const productsJson = JSON.stringify(availableProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stock: p.stockAvailable
    })));

    // Enhanced system prompt with conversation context
    const systemPrompt = `You are a helpful inventory management assistant specializing in container parts and equipment. 

CONVERSATION CONTEXT:
Current conversation state: ${state.currentFlow}
${state.pendingOrder ? `Pending order: ${JSON.stringify(state.pendingOrder)}` : ''}
Recent conversation history:
${recentHistory}

CAPABILITIES:
1. Check stock levels - Show current inventory
2. Add stock - Help users add inventory items
3. Remove/use stock - Help users deduct inventory
4. Create orders - Multi-step order process with confirmation
5. Find products - Search by name, SKU, or description

AVAILABLE PRODUCTS: ${productsJson}

CONVERSATION RULES:
- Remember what we discussed earlier in this conversation
- If user says "yes", "correct", "proceed" etc., understand the context from previous messages
- For orders, confirm all details before processing
- Be conversational and maintain context
- Use emojis sparingly (1-2 per message)
- Keep responses under 300 characters when possible

USER MESSAGE: ${userMessage}

Respond based on the conversation context and help the user complete their intended action.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent(systemPrompt);
    
    let botResponse = result.response.text() || "I'm sorry, I couldn't process your request.";
    
    // Parse inventory command
    const command = await parseInventoryCommand(userMessage, availableProducts, userId);
    
    // If it's an inventory action, prepare the pending action
    let pendingAction = undefined;
    if (command.action === 'add_stock' || command.action === 'use_stock') {
      if (command.productId && command.quantity) {
        pendingAction = {
          type: command.action,
          productId: command.productId,
          quantity: command.quantity
        };
        // Save the pending action in state
        state.lastContext = { pendingAction };
      }
    }
    
    // Update conversation state
    updateConversationState(userId, userMessage, botResponse, availableProducts);
    
    addToHistory(userId, 'assistant', botResponse);
    
    if (botResponse.length > 1000) {
      botResponse = botResponse.slice(0, 997) + "...";
    }

    return { response: botResponse, pendingAction };
  } catch (error) {
    console.error("Error generating WhatsApp response:", error);
    return {
      response: "I'm experiencing technical difficulties. Please try again later."
    };
  }
}

// Enhanced conversation state management
function updateConversationState(
  userId: string, 
  userMessage: string, 
  botResponse: string, 
  availableProducts: any[]
) {
  const state = getConversationState(userId);
  const normalizedMessage = userMessage.toLowerCase().trim();

  // Detect user intent
  if (/(show|list|display).*all.*products?/i.test(normalizedMessage)) {
    state.currentFlow = 'checking_stock';
  } else if (/(add|increase|put|insert).*stock/i.test(normalizedMessage)) {
    state.currentFlow = 'adding_stock';
  } else if (/(remove|deduct|use|take).*stock/i.test(normalizedMessage)) {
    state.currentFlow = 'removing_stock';
  } else if (/(order|buy|purchase|want.*units?)/i.test(normalizedMessage)) {
    state.currentFlow = 'creating_order';
    
    // Parse order items from message
    if (!state.pendingOrder) {
      state.pendingOrder = {
        items: [],
        step: 'collecting_items'
      };
    }
    
    // Extract multiple items from message like "30 units of socket plug, 10 unit of brazing set"
    const itemMatches = normalizedMessage.match(/(\d+)\s*units?\s*of\s*([^,]+)/gi);
    if (itemMatches) {
      itemMatches.forEach(match => {
        const itemMatch = match.match(/(\d+)\s*units?\s*of\s*(.+)/i);
        if (itemMatch) {
          const quantity = parseInt(itemMatch[1]);
          const productName = itemMatch[2].trim();
          const foundProducts = findProducts(productName, availableProducts);
          
          if (foundProducts.length > 0) {
            state.pendingOrder!.items.push({
              productName: foundProducts[0].name,
              sku: foundProducts[0].sku,
              quantity,
              confirmed: false
            });
          }
        }
      });
    }
  } else if (/(yes|correct|proceed|confirm|that's right)/i.test(normalizedMessage) && 
             state.currentFlow === 'creating_order' && 
             state.pendingOrder) {
    // User confirmed the order
    state.pendingOrder.step = 'processing';
    state.pendingOrder.items.forEach(item => item.confirmed = true);
  } else if (/(no|wrong|cancel|different)/i.test(normalizedMessage)) {
    // User wants to cancel or modify
    if (state.pendingOrder) {
      state.pendingOrder = undefined;
    }
    state.currentFlow = 'idle';
  }
}

// Enhanced command parsing with conversation context
export async function parseInventoryCommand(
  userMessage: string, 
  availableProducts: any[] = [],
  userId: string = 'default'
): Promise<{
  action: "add_stock" | "use_stock" | "create_order" | "show_products" | "unknown";
  productName?: string;
  quantity?: number;
  productId?: string;
  confidence: number;
  suggestedProducts?: any[];
  requiresConfirmation?: boolean;
  error?: string;
  conversationContext?: any;
}> {
  try {
    const state = getConversationState(userId);
    const normalizedMessage = userMessage.toLowerCase().trim();
    
    // Determine action based on conversation state and message
    let action: "add_stock" | "use_stock" | "create_order" | "show_products" | "unknown" = "unknown";
    
    if (/(show|list|display).*all.*products?/i.test(normalizedMessage)) {
      action = "show_products";
    } else if (state.currentFlow === 'creating_order' && /(yes|correct|proceed)/i.test(normalizedMessage)) {
      action = "create_order";
    } else if (/(add|increase|put|insert).*stock/i.test(normalizedMessage)) {
      action = "add_stock";
    } else if (/(remove|deduct|use|take).*stock/i.test(normalizedMessage)) {
      action = "use_stock";
    } else if (/(order|buy|purchase|want.*units?)/i.test(normalizedMessage)) {
      action = "create_order";
    }

    // Extract quantity
    const quantityMatch = normalizedMessage.match(/\b(\d+)\s*(units?|pcs?|pieces?|items?)?\b/i);
    const quantity = quantityMatch ? parseInt(quantityMatch[1]) : undefined;

    // Extract product name
    let productName = normalizedMessage
      .replace(/\b\d+\s*(units?|pcs?|pieces?|items?)?\b/i, '')
      .replace(/\b(add|put|insert|receive|stock|update|use|deduct|remove|take|withdraw|order|buy|purchase|want|to|in|from|of|the|inventory|units?|yes|no|correct|proceed)\b/gi, '')
      .trim();

    // Find matching products
    const suggestedProducts = findProducts(productName, availableProducts);
    const bestMatch = suggestedProducts[0];

    return {
      action,
      productName: productName || undefined,
      quantity,
      productId: bestMatch?.id,
      confidence: bestMatch ? 0.8 : 0,
      suggestedProducts: suggestedProducts.length > 0 ? suggestedProducts : undefined,
      requiresConfirmation: suggestedProducts.length > 1,
      conversationContext: {
        currentFlow: state.currentFlow,
        pendingOrder: state.pendingOrder
      }
    };
  } catch (error) {
    console.error("Error parsing inventory command:", error);
    return {
      action: "unknown",
      confidence: 0,
      error: "Failed to process your command. Please try again."
    };
  }
}

// Image analysis with correct API usage
export async function analyzeProductImage(base64Image: string): Promise<{
  productName: string;
  category: string;
  confidence: number;
  suggestedSku?: string;
  possibleMatches?: string[];
}> {
  try {
    const prompt = `Analyze this container part/equipment image and respond with JSON: { 'productName': string, 'category': string, 'confidence': number (0-1), 'suggestedSku': string, 'possibleMatches': string[] }`;
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const result = await model.generateContent([
      { text: prompt },
      { 
        inlineData: { 
          mimeType: "image/jpeg", 
          data: base64Image 
        } 
      }
    ]);

    const responseText = result.response.text() || "{}";
    let resultJson;
    
    try {
      // Clean the response text and parse JSON
      const cleanedText = responseText.replace(/``````/g, '').trim();
      resultJson = JSON.parse(cleanedText);
    } catch (e) {
      // Try to extract JSON from the response text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          resultJson = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error("Failed to parse JSON from match:", e2);
          resultJson = {};
        }
      } else {
        console.error("No JSON found in response");
        resultJson = {};
      }
    }
    
    return {
      productName: resultJson.productName || "Unknown Part",
      category: resultJson.category || "Unknown",
      confidence: Math.max(0, Math.min(1, resultJson.confidence || 0)),
      suggestedSku: resultJson.suggestedSku,
      possibleMatches: resultJson.possibleMatches || [],
    };
  } catch (error) {
    console.error("Error analyzing product image:", error);
    throw new Error("Failed to analyze product image: " + (error as Error).message);
  }
}
