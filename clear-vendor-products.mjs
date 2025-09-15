import fetch from 'node-fetch';
import 'dotenv/config';

async function clearVendorProducts() {
  console.log('Starting to clear all vendor-product mappings...\n');
  
  try {
    // Fetch all vendors
    const vendorsResponse = await fetch('http://localhost:5000/api/vendors');
    if (!vendorsResponse.ok) {
      throw new Error('Failed to fetch vendors');
    }
    const vendors = await vendorsResponse.json();
    console.log(`Found ${vendors.length} vendors\n`);
    
    let totalCleared = 0;
    let errors = [];
    
    // Process each vendor
    for (const vendor of vendors) {
      try {
        // Get vendor's products
        const productsResponse = await fetch(`http://localhost:5000/api/vendors/${vendor.id}/products`);
        if (!productsResponse.ok) {
          console.log(`⚠️ Could not fetch products for ${vendor.name}`);
          continue;
        }
        
        const vendorProducts = await productsResponse.json();
        
        if (vendorProducts.length > 0) {
          console.log(`Clearing ${vendorProducts.length} products from ${vendor.name}...`);
          
          // Remove each product mapping
          for (const vp of vendorProducts) {
            if (vp.product?.id) {
              try {
                const deleteResponse = await fetch(
                  `http://localhost:5000/api/vendors/${vendor.id}/products/${vp.product.id}`,
                  { method: 'DELETE' }
                );
                
                if (deleteResponse.ok) {
                  totalCleared++;
                } else {
                  const error = await deleteResponse.text();
                  errors.push(`Failed to remove product ${vp.product.name} from ${vendor.name}: ${error}`);
                }
              } catch (error) {
                errors.push(`Error removing product from ${vendor.name}: ${error.message}`);
              }
            }
          }
        }
      } catch (error) {
        errors.push(`Error processing vendor ${vendor.name}: ${error.message}`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Clearing completed!');
    console.log(`Total vendor-product mappings cleared: ${totalCleared}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Clearing failed:', error.message);
    console.log('\nMake sure the server is running (npm run dev)');
  }
}

// Run the clearing
clearVendorProducts();
