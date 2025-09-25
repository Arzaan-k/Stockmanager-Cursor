// Test script to identify create order flow issues
import { EnhancedWhatsAppService } from './dist/index.js';

async function testCreateOrderFlow() {
  console.log('🧪 Testing Create Order Flow...\n');
  
  const service = new EnhancedWhatsAppService('test-token');
  const userPhone = '+1234567890';
  
  // Test 1: Start create order flow
  console.log('1. Testing create order button click...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'main:create_order',
          title: 'Create Order'
        }
      }
    });
    console.log('✅ Create order button handled successfully');
  } catch (error) {
    console.log('❌ Error handling create order button:', error.message);
  }
  
  // Test 2: Add product to order
  console.log('\n2. Testing product addition to order...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'text',
      text: { body: '10 units of sensor' }
    });
    console.log('✅ Product addition handled successfully');
  } catch (error) {
    console.log('❌ Error handling product addition:', error.message);
  }
  
  // Test 3: Proceed with order
  console.log('\n3. Testing order proceed...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'order:proceed',
          title: 'Proceed'
        }
      }
    });
    console.log('✅ Order proceed handled successfully');
  } catch (error) {
    console.log('❌ Error handling order proceed:', error.message);
  }
  
  // Test 4: Customer name input
  console.log('\n4. Testing customer name input...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'text',
      text: { body: 'John Doe' }
    });
    console.log('✅ Customer name handled successfully');
  } catch (error) {
    console.log('❌ Error handling customer name:', error.message);
  }
  
  // Test 5: Customer phone input
  console.log('\n5. Testing customer phone input...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'text',
      text: { body: '+9876543210' }
    });
    console.log('✅ Customer phone handled successfully');
  } catch (error) {
    console.log('❌ Error handling customer phone:', error.message);
  }
  
  // Test 6: Skip email
  console.log('\n6. Testing skip email...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'cust:skip_email',
          title: 'Skip Email'
        }
      }
    });
    console.log('✅ Skip email handled successfully');
  } catch (error) {
    console.log('❌ Error handling skip email:', error.message);
  }
  
  // Test 7: Container number input
  console.log('\n7. Testing container number input...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'text',
      text: { body: 'CONT123456' }
    });
    console.log('✅ Container number handled successfully');
  } catch (error) {
    console.log('❌ Error handling container number:', error.message);
  }
  
  // Test 8: Job ID input
  console.log('\n8. Testing job ID input...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'text',
      text: { body: 'JOB789' }
    });
    console.log('✅ Job ID handled successfully');
  } catch (error) {
    console.log('❌ Error handling job ID:', error.message);
  }
  
  // Test 9: Purchaser name input
  console.log('\n9. Testing purchaser name input...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'text',
      text: { body: 'Jane Smith' }
    });
    console.log('✅ Purchaser name handled successfully');
  } catch (error) {
    console.log('❌ Error handling purchaser name:', error.message);
  }
  
  // Test 10: Confirm order
  console.log('\n10. Testing order confirmation...');
  try {
    await service.processIncomingMessage({
      from: userPhone,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'order:confirm',
          title: 'Confirm Order'
        }
      }
    });
    console.log('✅ Order confirmation handled successfully');
  } catch (error) {
    console.log('❌ Error handling order confirmation:', error.message);
  }
  
  console.log('\n🎉 Create Order Flow Test Complete!');
}

// Run the test
testCreateOrderFlow().catch(console.error);
