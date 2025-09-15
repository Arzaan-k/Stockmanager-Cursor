import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function importVendors() {
  console.log('Starting vendor import process...\n');
  
  // Read the Excel file
  const filePath = join(__dirname, 'Vendor Category Matersheet Final.xlsx');
  const workbook = xlsx.readFile(filePath);
  
  // Use the first sheet (Master Sheet)
  const sheetName = 'Master Sheet';
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);
  
  console.log(`Found ${data.length} vendors in Excel file\n`);
  
  // Filter out rows without vendor names
  const validVendors = data.filter(row => row['Vendor Name'] && row['Vendor Name'].trim());
  console.log(`Processing ${validVendors.length} valid vendors\n`);
  
  // Transform data to match our schema
  const vendorData = validVendors.map(row => ({
    name: row['Vendor Name'].trim(),
    mainCategory: row['Main Category'] === 'Admin' ? 'admin' : 'operation_services',
    subcategory: row['Subcategory'] || '',
    productType: row['Product Type'] || '',
    productCode: row['Product Code'] || `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    otherProducts: row['Other Products/Services'] || '',
    contactNumber: String(row['Contact Number'] || ''),
    location: row['Location'] || '',
    city: row['City'] || '',
    state: row['State'] || '',
    zone: row['Zone'] || '',
    status: row['Status Of Vendor'] === 'Active' ? 'active' : 
           row['Status Of Vendor'] === 'Inactive' ? 'inactive' : 'pending'
  }));
  
  // Import via API in batches
  const batchSize = 50;
  let totalImported = 0;
  let totalErrors = [];
  
  for (let i = 0; i < vendorData.length; i += batchSize) {
    const batch = vendorData.slice(i, Math.min(i + batchSize, vendorData.length));
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(vendorData.length / batchSize);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} vendors)...`);
    
    try {
      const response = await fetch('http://localhost:5000/api/vendors/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: batch })
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`  ❌ Batch ${batchNum} failed: ${error}`);
        totalErrors.push(`Batch ${batchNum}: ${error}`);
        continue;
      }
      
      const result = await response.json();
      totalImported += result.imported;
      console.log(`  ✅ Batch ${batchNum} imported: ${result.imported} vendors`);
      
      if (result.errors && result.errors.length > 0) {
        totalErrors = [...totalErrors, ...result.errors];
      }
      
      // Small delay between batches to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Batch ${batchNum} error:`, error.message);
      totalErrors.push(`Batch ${batchNum}: ${error.message}`);
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Import process completed!');
  console.log(`Total vendors imported: ${totalImported} out of ${vendorData.length}`);
  
  if (totalErrors.length > 0) {
    console.log('\n⚠️ Errors encountered:');
    totalErrors.forEach(err => console.log(`  - ${err}`));
  }
}

// Run the import
importVendors();
