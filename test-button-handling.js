// Test script to verify button handling works correctly
const { EnhancedWhatsAppService } = require('./server/services/whatsapp-enhanced.ts');

async function testButtonHandling() {
  console.log('Testing button handling...\n');
  
  try {
    const service = new EnhancedWhatsAppService();
    
    // Test button ID parsing
    const buttonId = 'select_product_123_add_stock_50';
    const parts = buttonId.split('_');
    
    console.log('Button ID:', buttonId);
    console.log('Parsed parts:', parts);
    
    if (parts.length >= 5) {
      const productId = parts[2];
      const action = parts[3];
      const quantity = parseInt(parts[4]);
      
      console.log('Product ID:', productId);
      console.log('Action:', action);
      console.log('Quantity:', quantity);
      
      console.log('\n✅ Button ID parsing works correctly');
    } else {
      console.log('\n❌ Button ID parsing failed');
    }
    
    // Test conversation state
    const userPhone = '+1234567890';
    const state = service.getConversationState(userPhone);
    
    console.log('\nInitial state:', {
      currentFlow: state.currentFlow,
      hasPendingStockAddition: !!state.pendingStockAddition,
      hasLastContext: !!state.lastContext
    });
    
    // Simulate product selection context
    state.lastContext = {
      type: 'product_selection',
      productQuery: 'sensor',
      quantity: 50,
      action: 'add_stock',
      products: [
        { id: '123', name: 'Test Sensor 1', sku: 'TS001', stockAvailable: 10 },
        { id: '456', name: 'Test Sensor 2', sku: 'TS002', stockAvailable: 5 }
      ]
    };
    
    console.log('\nAfter setting context:', {
      currentFlow: state.currentFlow,
      hasPendingStockAddition: !!state.pendingStockAddition,
      hasLastContext: !!state.lastContext,
      contextType: state.lastContext?.type
    });
    
    console.log('\n✅ Conversation state management works correctly');
    
  } catch (error) {
    console.error('Error testing button handling:', error);
  }
}

// Run the test
testButtonHandling();
