import { neon } from '@neondatabase/serverless';
import XLSX from 'xlsx';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

function cleanContactInfo(contactData) {
  if (!contactData || contactData === 'nan' || contactData === 'NaN') {
    return null;
  }
  
  // Convert to string and preserve the original formatting
  const contactStr = String(contactData).trim();
  
  // If it's empty or just whitespace, return null
  if (!contactStr || contactStr.length === 0) {
    return null;
  }
  
  return contactStr;
}

async function updateFullContactInfo() {
  try {
    console.log('📞 Updating vendors with complete contact information from Excel...');
    
    // First, let's add a new column for full contact info if it doesn't exist
    try {
      await sql`ALTER TABLE vendors ADD COLUMN full_contact_info TEXT`;
      console.log('✅ Added full_contact_info column to vendors table');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  full_contact_info column already exists');
      } else {
        console.log('⚠️  Column might already exist or other issue:', error.message);
      }
    }
    
    // Read Excel file
    const workbook = XLSX.readFile('Vendor Category Matersheet Final.xlsx');
    const worksheet = workbook.Sheets['Master Sheet'];
    const excelData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📖 Read ${excelData.length} rows from Excel file`);
    
    let updatedCount = 0;
    let contactsFound = 0;
    
    for (const row of excelData) {
      try {
        const vendorName = String(row['Vendor Name'] || '').trim();
        const fullContactInfo = cleanContactInfo(row['Contact Number']);
        
        if (!vendorName) continue;
        
        // Find vendor by exact name match
        const vendors = await sql`
          SELECT id, name FROM vendors WHERE name = ${vendorName} LIMIT 1
        `;
        
        if (vendors.length > 0) {
          const vendorId = vendors[0].id;
          
          // Update with full contact information
          await sql`
            UPDATE vendors 
            SET full_contact_info = ${fullContactInfo}
            WHERE id = ${vendorId}
          `;
          
          updatedCount++;
          
          if (fullContactInfo) {
            contactsFound++;
          }
          
          if (updatedCount % 50 === 0) {
            console.log(`✅ Updated ${updatedCount} vendors...`);
          }
        }
        
      } catch (error) {
        console.log(`⚠️ Error processing ${row['Vendor Name']}: ${error.message}`);
      }
    }
    
    console.log(`✅ Updated ${updatedCount} vendors with contact information`);
    console.log(`📞 Found ${contactsFound} vendors with contact details`);
    
    // Get statistics
    const totalWithFullContact = await sql`
      SELECT COUNT(*) as count 
      FROM vendors 
      WHERE full_contact_info IS NOT NULL 
      AND full_contact_info != ''
    `;
    
    const totalVendors = await sql`SELECT COUNT(*) as count FROM vendors WHERE is_active = true`;
    
    console.log(`\\n📊 Final Statistics:`);
    console.log(`   Total active vendors: ${totalVendors[0].count}`);
    console.log(`   Vendors with full contact info: ${totalWithFullContact[0].count}`);
    
    // Show sample vendors with full contact info
    console.log('\\n📋 Sample vendors with complete contact information:');
    const sampleVendors = await sql`
      SELECT name, full_contact_info, location, status
      FROM vendors 
      WHERE full_contact_info IS NOT NULL 
      AND full_contact_info != ''
      ORDER BY name
      LIMIT 5
    `;
    
    sampleVendors.forEach((vendor, index) => {
      console.log(`\\n   ${index + 1}. ${vendor.name}`);
      console.log(`      Status: ${vendor.status}`);
      console.log(`      Location: ${vendor.location || 'N/A'}`);
      console.log(`      Full Contact Info:`);
      console.log(`      "${vendor.full_contact_info}"`);
    });
    
    // Show some examples of rich contact info
    console.log('\\n📋 Examples of rich contact information found:');
    const richContactVendors = await sql`
      SELECT name, full_contact_info
      FROM vendors 
      WHERE full_contact_info IS NOT NULL 
      AND full_contact_info != ''
      AND (
        full_contact_info LIKE '%@%' 
        OR LENGTH(full_contact_info) > 50
        OR full_contact_info LIKE '%(%'
      )
      ORDER BY LENGTH(full_contact_info) DESC
      LIMIT 3
    `;
    
    richContactVendors.forEach((vendor, index) => {
      console.log(`\\n   ${index + 1}. ${vendor.name}:`);
      // Truncate for display but show it's longer
      const truncated = vendor.full_contact_info.length > 100 
        ? vendor.full_contact_info.substring(0, 100) + '...' 
        : vendor.full_contact_info;
      console.log(`      ${truncated}`);
      console.log(`      [Full length: ${vendor.full_contact_info.length} characters]`);
    });
    
    console.log('\\n🎉 Full contact information update completed!');
    console.log('\\n💡 Next steps:');
    console.log('   1. Your vendors now have complete contact details');
    console.log('   2. The frontend should be updated to display full_contact_info');
    console.log('   3. Implement truncation on cards with "View Full Contact" button');
    
  } catch (error) {
    console.error('❌ Error updating contact information:', error);
  }
}

updateFullContactInfo();
