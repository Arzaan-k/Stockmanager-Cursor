import { neon } from '@neondatabase/serverless';
import XLSX from 'xlsx';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function fixContactInfo() {
  console.log('📞 Fixing contact information from Excel...');
  
  // Read Excel file
  const workbook = XLSX.readFile('Vendor Category Matersheet Final.xlsx');
  const worksheet = workbook.Sheets['Master Sheet'];
  const excelData = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`📖 Read ${excelData.length} rows from Excel file`);
  
  let updatedCount = 0;
  
  for (const row of excelData) {
    try {
      const vendorName = String(row['Vendor Name'] || '').trim();
      const contactNumber = row['Contact Number'];
      
      if (!vendorName || !contactNumber) continue;
      
      // Convert contact number to string as-is from Excel
      const contactStr = String(contactNumber);
      
      // Find vendor by exact name match
      const vendors = await sql`
        SELECT id, name FROM vendors WHERE name = ${vendorName} LIMIT 1
      `;
      
      if (vendors.length > 0) {
        const vendorId = vendors[0].id;
        
        // Update both contact_number and full_contact_info with the same value
        await sql`
          UPDATE vendors 
          SET 
            contact_number = ${contactStr},
            full_contact_info = ${contactStr}
          WHERE id = ${vendorId}
        `;
        
        updatedCount++;
        
        if (updatedCount % 50 === 0) {
          console.log(`✅ Updated ${updatedCount} vendors...`);
        }
      }
      
    } catch (error) {
      console.log(`⚠️ Error processing ${row['Vendor Name']}: ${error.message}`);
    }
  }
  
  console.log(`✅ Updated ${updatedCount} vendors with contact information`);
  
  // Show some examples
  console.log('\n📋 Sample updated vendors:');
  const sampleVendors = await sql`
    SELECT name, contact_number, full_contact_info
    FROM vendors 
    WHERE contact_number IS NOT NULL 
    AND contact_number != ''
    ORDER BY name
    LIMIT 5
  `;
  
  sampleVendors.forEach((vendor, index) => {
    console.log(`\n${index + 1}. ${vendor.name}`);
    console.log(`   Contact Number: "${vendor.contact_number}"`);
    console.log(`   Full Contact Info: "${vendor.full_contact_info}"`);
  });
  
  console.log('\n🎉 Contact information fix completed!');
}

fixContactInfo();
