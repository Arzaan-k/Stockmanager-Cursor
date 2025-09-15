import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function fixVendorIssues() {
  try {
    console.log('🔧 Fixing vendor issues...');
    
    // Issue 1: Check current vendor status distribution
    console.log('\n📊 Current vendor status distribution:');
    const statusCounts = await sql`
      SELECT status, is_active, COUNT(*) as count 
      FROM vendors 
      GROUP BY status, is_active 
      ORDER BY status
    `;
    
    statusCounts.forEach(row => {
      console.log(`   ${row.status} (isActive: ${row.is_active}): ${row.count}`);
    });
    
    // Issue 2: Check if vendors missing contact info in main record
    const vendorsWithoutContact = await sql`
      SELECT COUNT(*) as count 
      FROM vendors 
      WHERE contact_number IS NULL OR contact_number = ''
    `;
    
    console.log(`\n📞 Vendors missing contact number in main record: ${vendorsWithoutContact[0].count}`);
    
    // Issue 3: Check vendor_contacts table
    const contactsCount = await sql`SELECT COUNT(*) as count FROM vendor_contacts`;
    console.log(`📋 Total entries in vendor_contacts table: ${contactsCount[0].count}`);
    
    // Fix 1: Update vendors that should be active but aren't marked properly
    console.log('\n🔄 Ensuring all valid vendors are marked as active...');
    await sql`
      UPDATE vendors 
      SET is_active = true 
      WHERE (status = 'active' OR status = 'inactive' OR status = 'pending')
      AND name IS NOT NULL 
      AND name != ''
    `;
    
    console.log('✅ Updated vendor isActive status');
    
    // Fix 2: Ensure contact numbers from vendor_contacts are in main vendor record
    console.log('\n🔄 Syncing contact numbers from vendor_contacts to vendors...');
    await sql`
      UPDATE vendors 
      SET contact_number = vc.phone
      FROM vendor_contacts vc
      WHERE vendors.id = vc.vendor_id 
      AND vc.is_primary = true 
      AND (vendors.contact_number IS NULL OR vendors.contact_number = '')
      AND vc.phone IS NOT NULL 
      AND vc.phone != ''
    `;
    
    console.log('✅ Synced contact numbers from vendor_contacts');
    
    // Get final counts
    console.log('\n📊 Final counts after fixes:');
    
    const finalTotal = await sql`SELECT COUNT(*) as count FROM vendors WHERE is_active = true`;
    console.log(`   Total vendors: ${finalTotal[0].count}`);
    
    const finalActive = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'active' AND is_active = true`;
    console.log(`   Active vendors: ${finalActive[0].count}`);
    
    const finalInactive = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'inactive' AND is_active = true`;
    console.log(`   Inactive vendors: ${finalInactive[0].count}`);
    
    const finalPending = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'pending' AND is_active = true`;
    console.log(`   Pending vendors: ${finalPending[0].count}`);
    
    // Check contact info
    const vendorsWithContact = await sql`
      SELECT COUNT(*) as count 
      FROM vendors 
      WHERE contact_number IS NOT NULL AND contact_number != ''
    `;
    console.log(`   Vendors with contact info: ${vendorsWithContact[0].count}`);
    
    // Sample vendors with contact info
    console.log('\n📋 Sample vendors with contact information:');
    const sampleVendors = await sql`
      SELECT name, contact_number, location, status
      FROM vendors 
      WHERE contact_number IS NOT NULL 
      AND contact_number != ''
      AND is_active = true
      LIMIT 5
    `;
    
    sampleVendors.forEach((vendor, index) => {
      console.log(`   ${index + 1}. ${vendor.name}`);
      console.log(`      Contact: ${vendor.contact_number}`);
      console.log(`      Location: ${vendor.location}`);
      console.log(`      Status: ${vendor.status}\n`);
    });
    
    console.log('🎉 Vendor issues fixed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Refresh your website - should now show correct total count');
    console.log('   2. Click on vendors to see contact information');
    console.log('   3. All categories should be properly populated');
    
  } catch (error) {
    console.error('❌ Error fixing vendor issues:', error);
  }
}

fixVendorIssues();
