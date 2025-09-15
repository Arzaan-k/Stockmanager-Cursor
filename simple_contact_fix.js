import { neon } from '@neondatabase/serverless';
import XLSX from 'xlsx';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

function extractPhoneNumber(contactData) {
  if (!contactData) return null;
  
  // Convert to string and extract numbers
  let phoneStr = String(contactData);
  
  // Clean the string - keep only digits
  const cleaned = phoneStr.replace(/[^0-9]/g, '');
  
  // If it's 10 digits, it's likely an Indian mobile number
  if (cleaned.length === 10) {
    return cleaned;
  }
  
  // If it starts with 91 and has 12 digits total, remove country code
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  
  // If it has 11 digits and starts with 91, remove country code
  if (cleaned.length === 11 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  
  // Return original cleaned string if it has digits and is reasonable length
  return cleaned.length >= 10 ? cleaned : null;
}

async function simpleContactFix() {
  try {
    console.log('📞 Fixing contact information (simplified approach)...');
    
    // Read Excel file again
    const workbook = XLSX.readFile('Vendor Category Matersheet Final.xlsx');
    const worksheet = workbook.Sheets['Master Sheet'];
    const excelData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📖 Re-read ${excelData.length} rows from Excel file`);
    
    let updatedCount = 0;
    
    for (const row of excelData) {
      try {
        const vendorName = String(row['Vendor Name'] || '').trim();
        const contactNumber = extractPhoneNumber(row['Contact Number']);
        
        if (!vendorName || !contactNumber) continue;
        
        // Find vendor by exact name match
        const vendors = await sql`
          SELECT id FROM vendors WHERE name = ${vendorName} LIMIT 1
        `;
        
        if (vendors.length > 0) {
          const vendorId = vendors[0].id;
          
          // Update contact number
          await sql`
            UPDATE vendors 
            SET contact_number = ${contactNumber}
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
    
    // Final verification
    const totalWithContacts = await sql`
      SELECT COUNT(*) as count 
      FROM vendors 
      WHERE contact_number IS NOT NULL 
      AND contact_number != '' 
      AND LENGTH(contact_number) >= 10
    `;
    
    const totalVendors = await sql`SELECT COUNT(*) as count FROM vendors WHERE is_active = true`;
    
    console.log(`\\n📊 Final Statistics:`);
    console.log(`   Total active vendors: ${totalVendors[0].count}`);
    console.log(`   Vendors with valid contact numbers: ${totalWithContacts[0].count}`);
    
    // Show sample vendors with contact info
    console.log('\\n📋 Sample vendors with contact information:');
    const sampleVendors = await sql`
      SELECT name, contact_number, location, status
      FROM vendors 
      WHERE contact_number IS NOT NULL 
      AND contact_number != ''
      AND LENGTH(contact_number) >= 10
      ORDER BY name
      LIMIT 5
    `;
    
    sampleVendors.forEach((vendor, index) => {
      console.log(`   ${index + 1}. ${vendor.name}`);
      console.log(`      📞 ${vendor.contact_number}`);
      console.log(`      📍 ${vendor.location || 'N/A'}`);
      console.log(`      Status: ${vendor.status}\\n`);
    });
    
    console.log('🎉 Contact information updated!');
    console.log('\\n💡 Next steps:');
    console.log('   1. Refresh your website at localhost:5000/vendors');
    console.log('   2. Total vendors should show 329');
    console.log('   3. Click on individual vendors to see contact details');
    
  } catch (error) {
    console.error('❌ Error fixing contact information:', error);
  }
}

simpleContactFix();
