// Test script to verify the improved sensor product selection flow
const { generateWhatsAppResponse } = require('./server/services/gemini.ts');
const { storage } = require('./server/storage.ts');

async function testSensorFlow() {
  console.log('Testing improved sensor product selection flow...\n');
  
  try {
    // Simulate the user message "50 units of sensor"
    const userMessage = "50 units of sensor";
    const context = {
      products: await storage.getProducts({})
    };
    
    console.log(`User message: "${userMessage}"`);
    console.log('Context products loaded:', context.products.length);
    
    // Generate response
    const result = await generateWhatsAppResponse(userMessage, context, 'test-user');
    
    console.log('\nGenerated response:');
    console.log('Response:', result.response);
    console.log('Pending action:', result.pendingAction);
    
    // Check if it's the special multiple products response
    if (result.response.startsWith('MULTIPLE_PRODUCTS_FOUND:')) {
      console.log('\n✅ SUCCESS: Multiple products detected, should show selection buttons');
      const parts = result.response.split(':');
      console.log(`Found ${parts[1]} products matching "${parts[2]}"`);
      console.log(`Quantity: ${parts[3]}, Action: ${parts[4]}`);
    } else if (result.response.includes('Found product:')) {
      console.log('\n⚠️  WARNING: Only single product found, no selection needed');
    } else {
      console.log('\n❌ UNEXPECTED: Response format not as expected');
    }
    
  } catch (error) {
    console.error('Error testing sensor flow:', error);
  }
}

// Run the test
testSensorFlow();
