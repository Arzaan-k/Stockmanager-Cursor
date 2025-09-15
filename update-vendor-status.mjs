import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function updateVendorStatuses() {
  console.log('Starting vendor status update...\n');
  
  try {
    // Read the Excel file
    const filePath = join(__dirname, 'Vendor Category Matersheet Final.xlsx');
    const workbook = xlsx.readFile(filePath);
    
    // Use the Master Sheet
    const sheetName = 'Master Sheet';
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${data.length} vendors in Excel file\n`);
    
    // Fetch current vendors from database
    const vendorsResponse = await fetch('http://localhost:5000/api/vendors');
    const vendors = await vendorsResponse.json();
    console.log(`Found ${vendors.length} vendors in database\n`);
    
    let updated = 0;
    let errors = [];
    
    // Process each vendor
    for (const vendor of vendors) {
      // Find matching vendor in Excel data by name or product code
      const excelVendor = data.find(row => 
        row['Vendor Name']?.trim() === vendor.name ||
        row['Product Code'] === vendor.productCode
      );
      
      if (excelVendor) {
        const excelStatus = excelVendor['Status Of Vendor'];
        let newStatus = 'inactive'; // default to inactive if no status
        
        // Map Excel status to our system status
        if (excelStatus) {
          const statusLower = String(excelStatus).toLowerCase().trim();
          if (statusLower === 'active') {
            newStatus = 'active';
          } else if (statusLower === 'inactive') {
            newStatus = 'inactive';
          } else if (statusLower === 'suspended') {
            newStatus = 'suspended';
          } else if (statusLower === 'pending') {
            newStatus = 'pending';
          } else {
            // Default to inactive for any other status
            newStatus = 'inactive';
          }
        } else {
          // If no status in Excel, default to inactive
          newStatus = 'inactive';
        }
        
        // Only update if status is different
        if (vendor.status !== newStatus) {
          try {
            const response = await fetch(`http://localhost:5000/api/vendors/${vendor.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
            });
            
            if (response.ok) {
              updated++;
              console.log(`✅ Updated ${vendor.name}: ${vendor.status} → ${newStatus}`);
            } else {
              const error = await response.text();
              errors.push(`Failed to update ${vendor.name}: ${error}`);
            }
          } catch (error) {
            errors.push(`Error updating ${vendor.name}: ${error.message}`);
          }
        }
      } else {
        console.log(`⚠️ No Excel match found for vendor: ${vendor.name}`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Status update completed!');
    console.log(`Total vendors updated: ${updated}`);
    
    // Get final status counts
    const finalVendorsResponse = await fetch('http://localhost:5000/api/vendors/stats');
    const stats = await finalVendorsResponse.json();
    
    console.log('\nFinal vendor status breakdown:');
    console.log(`  Active: ${stats.activeVendors}`);
    console.log(`  Total: ${stats.totalVendors}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      errors.forEach(err => console.log(`  - ${err}`));
    }
    
  } catch (error) {
    console.error('\n❌ Status update failed:', error.message);
    console.log('\nMake sure the server is running (npm run dev)');
  }
}

// Run the update
updateVendorStatuses();
