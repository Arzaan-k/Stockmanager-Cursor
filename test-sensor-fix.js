// Test script to verify the sensor product selection fix
const { storage } = require('./server/storage.ts');

async function testSensorProducts() {
  console.log('Testing sensor product search...\n');
  
  try {
    // Search for products containing "sensor"
    const exactProducts = await storage.searchProducts('sensor');
    const fuzzyProducts = await storage.searchProductsFuzzy('sensor');
    
    console.log('Exact search results:', exactProducts.length);
    exactProducts.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (SKU: ${p.sku})`);
    });
    
    console.log('\nFuzzy search results:', fuzzyProducts.length);
    fuzzyProducts.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (SKU: ${p.sku})`);
    });
    
    // Combine and deduplicate
    const allProducts = [...exactProducts];
    fuzzyProducts.forEach(fp => {
      if (!allProducts.find(p => p.id === fp.id)) {
        allProducts.push(fp);
      }
    });
    
    console.log('\nCombined results:', allProducts.length);
    allProducts.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (SKU: ${p.sku})`);
    });
    
    if (allProducts.length > 1) {
      console.log('\n✅ SUCCESS: Multiple sensor products found - should show selection buttons');
    } else if (allProducts.length === 1) {
      console.log('\n⚠️  WARNING: Only one sensor product found - no selection needed');
    } else {
      console.log('\n❌ ERROR: No sensor products found');
    }
    
  } catch (error) {
    console.error('Error testing sensor products:', error);
  }
}

// Run the test
testSensorProducts();
