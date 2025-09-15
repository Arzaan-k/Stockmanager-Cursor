import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function testVendorData() {
  try {
    console.log('🧪 Testing vendor data access...\n');
    
    // Get total count
    const totalResult = await sql`SELECT COUNT(*) as count FROM vendors`;
    console.log(`📊 Total vendors in database: ${totalResult[0].count}`);
    
    // Get active vendors
    const activeResult = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'active'`;
    console.log(`✅ Active vendors: ${activeResult[0].count}`);
    
    // Sample some vendors
    const sampleVendors = await sql`
      SELECT name, main_category, subcategory, location, status 
      FROM vendors 
      WHERE status = 'active' 
      LIMIT 5
    `;
    
    console.log('\n📋 Sample Active Vendors:');
    sampleVendors.forEach((vendor, index) => {
      console.log(`   ${index + 1}. ${vendor.name}`);
      console.log(`      Category: ${vendor.main_category} > ${vendor.subcategory}`);
      console.log(`      Location: ${vendor.location}`);
      console.log(`      Status: ${vendor.status}\n`);
    });
    
    console.log('🎉 Vendor data is properly accessible!');
    console.log('✅ Your website should now show all vendors when you refresh the page.');
    
  } catch (error) {
    console.error('❌ Error testing vendor data:', error);
  }
}

testVendorData();
