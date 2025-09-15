import fetch from 'node-fetch';
import 'dotenv/config';

async function mapVendorProducts() {
  console.log('Starting vendor-product auto-mapping...\n');

  try {
    // Fetch all vendors
    const vendorsResponse = await fetch('http://localhost:5000/api/vendors');
    const vendors = await vendorsResponse.json();
    console.log(`Found ${vendors.length} vendors`);

    // Fetch all products  
    const productsResponse = await fetch('http://localhost:5000/api/products');
    const products = await productsResponse.json();
    console.log(`Found ${products.length} products\n`);

    let totalMappings = 0;
    let errors = [];

    // Keywords to match products with vendor data
    const productKeywords = {
      // Office supplies
      'paper': ['paper', 'a4', 'a3', 'copier', 'printing'],
      'pen': ['pen', 'ballpoint', 'gel pen', 'writing'],
      'pencil': ['pencil', 'hb', '2b', 'drawing'],
      'notebook': ['notebook', 'diary', 'notepad', 'journal'],
      'stapler': ['stapler', 'staple', 'stapling'],
      'folder': ['folder', 'file', 'filing'],
      'marker': ['marker', 'highlighter', 'whiteboard'],
      'scissors': ['scissors', 'cutting'],
      'tape': ['tape', 'adhesive', 'scotch'],
      'glue': ['glue', 'adhesive', 'paste'],
      
      // Furniture
      'desk': ['desk', 'table', 'workstation', 'office table'],
      'chair': ['chair', 'seating', 'office chair', 'revolving'],
      'cabinet': ['cabinet', 'storage', 'almirah', 'cupboard'],
      'shelf': ['shelf', 'rack', 'shelving', 'bookshelf'],
      
      // Electronics
      'laptop': ['laptop', 'notebook computer', 'portable computer'],
      'printer': ['printer', 'printing', 'laser', 'inkjet'],
      'monitor': ['monitor', 'display', 'screen', 'lcd', 'led'],
      'keyboard': ['keyboard', 'typing', 'input device'],
      'mouse': ['mouse', 'pointing device', 'wireless mouse'],
      
      // Packaging
      'box': ['box', 'carton', 'packaging', 'corrugated'],
      'bubble': ['bubble', 'wrap', 'cushioning', 'protective'],
      'envelope': ['envelope', 'mailer', 'courier'],
      
      // Cleaning
      'cleaner': ['cleaner', 'cleaning', 'detergent', 'sanitizer'],
      'tissue': ['tissue', 'napkin', 'paper towel'],
      'mop': ['mop', 'cleaning', 'floor'],
      
      // Construction/Hardware
      'paint': ['paint', 'coating', 'wall paint', 'enamel'],
      'brush': ['brush', 'paint brush', 'painting'],
      'cement': ['cement', 'concrete', 'construction'],
      'tiles': ['tiles', 'flooring', 'marble', 'ceramic'],
      'plywood': ['plywood', 'wood', 'timber', 'laminate'],
      
      // Electrical
      'wire': ['wire', 'cable', 'electrical', 'wiring'],
      'switch': ['switch', 'electrical', 'modular'],
      'bulb': ['bulb', 'light', 'led', 'lamp'],
    };

    // Process each vendor
    for (const vendor of vendors) {
      const vendorMappings = [];
      
      // Combine all vendor text fields for matching
      const vendorText = [
        vendor.productType,
        vendor.otherProducts,
        vendor.subcategory,
        vendor.name
      ].filter(Boolean).join(' ').toLowerCase();

      // Check each product
      for (const product of products) {
        const productName = product.name.toLowerCase();
        const productCategory = (product.category || '').toLowerCase();
        let isMatch = false;

        // Direct name match
        if (vendorText.includes(productName) || productName.includes(vendor.productType?.toLowerCase())) {
          isMatch = true;
        }

        // Keyword matching
        if (!isMatch) {
          for (const [key, keywords] of Object.entries(productKeywords)) {
            if (productName.includes(key) || productCategory.includes(key)) {
              for (const keyword of keywords) {
                if (vendorText.includes(keyword)) {
                  isMatch = true;
                  break;
                }
              }
            }
            if (isMatch) break;
          }
        }

        // Category-based matching
        if (!isMatch) {
          // Match stationery vendors with office supplies
          if (vendor.subcategory?.toLowerCase().includes('stationery') && 
              productCategory.includes('office')) {
            isMatch = true;
          }
          // Match furniture vendors
          else if (vendor.subcategory?.toLowerCase().includes('furniture') && 
                   productCategory.includes('furniture')) {
            isMatch = true;
          }
          // Match electrical vendors
          else if ((vendor.subcategory?.toLowerCase().includes('electrical') || 
                    vendor.subcategory?.toLowerCase().includes('electric')) && 
                   productCategory.includes('electric')) {
            isMatch = true;
          }
          // Match packaging vendors
          else if (vendor.subcategory?.toLowerCase().includes('packaging') && 
                   productCategory.includes('packaging')) {
            isMatch = true;
          }
        }

        if (isMatch) {
          vendorMappings.push(product);
        }
      }

      // Add mapped products to vendor
      if (vendorMappings.length > 0) {
        console.log(`\nMapping ${vendorMappings.length} products to vendor: ${vendor.name}`);
        
        for (const product of vendorMappings) {
          try {
            // Check if mapping already exists
            const existingResponse = await fetch(`http://localhost:5000/api/vendors/${vendor.id}/products`);
            const existingProducts = await existingResponse.json();
            
            const alreadyMapped = existingProducts.some(vp => vp.productId === product.id);
            
            if (!alreadyMapped) {
              const response = await fetch(`http://localhost:5000/api/vendors/${vendor.id}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productId: product.id,
                  isPreferred: false
                })
              });

              if (response.ok) {
                totalMappings++;
                console.log(`  ✓ Mapped: ${product.name}`);
              } else {
                const error = await response.text();
                errors.push(`Failed to map ${product.name} to ${vendor.name}: ${error}`);
              }
            }
          } catch (error) {
            errors.push(`Error mapping ${product.name} to ${vendor.name}: ${error.message}`);
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Auto-mapping completed!');
    console.log(`Total mappings created: ${totalMappings}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`);
      }
    }

  } catch (error) {
    console.error('\n❌ Auto-mapping failed:', error.message);
    console.log('\nMake sure the server is running (npm run dev)');
  }
}

// Run the mapping
mapVendorProducts();
