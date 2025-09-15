// Test script for enhanced WhatsApp bot flows
// Run with: node test-whatsapp-bot.js

const API_BASE = 'http://localhost:5000/api';

// Test data
const testConversations = [
  {
    name: "Stock Addition Flow",
    messages: [
      "Hi, I want to add 50 units of socket plugs to inventory",
      "John Smith",
      "yes"
    ]
  },
  {
    name: "Order Creation Flow",
    messages: [
      "I want to order 30 units of socket plugs",
      "done",
      "ABC Company",
      "+1234567890",
      "abc@company.com",
      "CONT-12345",
      "JOB-67890",
      "Jane Doe",
      "confirm"
    ]
  },
  {
    name: "Stock Check Flow",
    messages: [
      "Check stock for socket plugs"
    ]
  }
];

// Simulate webhook message
async function sendWebhookMessage(phone, text) {
  const webhookPayload = {
    entry: [{
      changes: [{
        value: {
          messages: [{
            type: "text",
            text: { body: text }
          }],
          contacts: [{
            wa_id: phone
          }]
        }
      }]
    }]
  };
  
  try {
    const response = await fetch(`${API_BASE}/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
    
    console.log(`  ✓ Sent: "${text}"`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to send: ${error.message}`);
    return false;
  }
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Run test conversation
async function runTestConversation(testCase, phoneNumber) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`   Phone: ${phoneNumber}`);
  console.log('   ' + '='.repeat(40));
  
  for (const message of testCase.messages) {
    await sendWebhookMessage(phoneNumber, message);
    await sleep(2000); // Wait 2 seconds between messages
  }
  
  console.log(`   ✅ ${testCase.name} test completed\n`);
}

// Check conversations
async function checkConversations() {
  try {
    const response = await fetch(`${API_BASE}/whatsapp/conversations`);
    const conversations = await response.json();
    
    console.log('\n📱 Active Conversations:');
    console.log('========================');
    
    if (Array.isArray(conversations) && conversations.length > 0) {
      conversations.forEach(conv => {
        console.log(`  • Phone: ${conv.userPhone}`);
        console.log(`    Status: ${conv.status}`);
        console.log(`    Last Updated: ${new Date(conv.updatedAt).toLocaleString()}`);
        if (conv.state) {
          console.log(`    State: ${JSON.stringify(conv.state).substring(0, 100)}...`);
        }
        console.log('');
      });
    } else {
      console.log('  No conversations found');
    }
  } catch (error) {
    console.error('Failed to fetch conversations:', error.message);
  }
}

// Check WhatsApp logs
async function checkLogs() {
  try {
    const response = await fetch(`${API_BASE}/whatsapp/logs`);
    const logs = await response.json();
    
    console.log('\n📋 Recent WhatsApp Logs:');
    console.log('========================');
    
    if (Array.isArray(logs) && logs.length > 0) {
      logs.slice(0, 5).forEach(log => {
        console.log(`  • Action: ${log.action || 'N/A'}`);
        console.log(`    Phone: ${log.userPhone}`);
        console.log(`    Response: ${log.aiResponse?.substring(0, 100) || 'N/A'}...`);
        console.log(`    Status: ${log.status}`);
        console.log(`    Time: ${new Date(log.createdAt).toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('  No logs found');
    }
  } catch (error) {
    console.error('Failed to fetch logs:', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 WhatsApp Bot Test Suite');
  console.log('===========================\n');
  
  // Test phone numbers
  const testPhones = [
    '+15551234567',
    '+15559876543',
    '+15555555555'
  ];
  
  try {
    // Run each test case with a different phone number
    for (let i = 0; i < testConversations.length && i < testPhones.length; i++) {
      await runTestConversation(testConversations[i], testPhones[i]);
      await sleep(3000); // Wait between test cases
    }
    
    // Check results
    await checkConversations();
    await checkLogs();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
