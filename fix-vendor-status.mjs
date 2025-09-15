import xlsx from 'xlsx';
import { Pool } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fixVendorStatuses() {
  console.log('Starting direct vendor status update...\n');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Read the Excel file
    const filePath = join(__dirname, 'Vendor Category Matersheet Final.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = 'Master Sheet';
    const worksheet = workbook.Sheets[sheetName];
    const excelData = xlsx.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${excelData.length} vendors in Excel file\n`);
    
    // Get all vendors from database
    const vendorsResult = await pool.query('SELECT id, name, product_code, status FROM vendors WHERE is_active = true');
    const dbVendors = vendorsResult.rows;
    console.log(`Found ${dbVendors.length} vendors in database\n`);
    
    let updated = 0;
    let notFound = 0;
    
    // Update each vendor
    for (const dbVendor of dbVendors) {
      // Find matching vendor in Excel by name or product code
      const excelVendor = excelData.find(row => 
        row['Vendor Name']?.trim() === dbVendor.name ||
        row['Product Code'] === dbVendor.product_code
      );
      
      if (excelVendor) {
        const excelStatus = excelVendor['Status Of Vendor'];
        let newStatus = 'inactive'; // default
        
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
            newStatus = 'inactive';
          }
        }
        
        // Only update if status is different
        if (dbVendor.status !== newStatus) {
          try {
            await pool.query(
              'UPDATE vendors SET status = $1, updated_at = NOW() WHERE id = $2',
              [newStatus, dbVendor.id]
            );
            updated++;
            console.log(`✅ Updated ${dbVendor.name}: ${dbVendor.status} → ${newStatus}`);
          } catch (error) {
            console.error(`❌ Failed to update ${dbVendor.name}:`, error.message);
          }
        }
      } else {
        notFound++;
        // Set vendors not in Excel to inactive
        if (dbVendor.status !== 'inactive') {
          try {
            await pool.query(
              'UPDATE vendors SET status = $1, updated_at = NOW() WHERE id = $2',
              ['inactive', dbVendor.id]
            );
            updated++;
            console.log(`⚠️ Set ${dbVendor.name} to inactive (not in Excel)`);
          } catch (error) {
            console.error(`❌ Failed to update ${dbVendor.name}:`, error.message);
          }
        }
      }
    }
    
    // Get final status counts
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended
      FROM vendors 
      WHERE is_active = true
    `);
    
    const stats = statsResult.rows[0];
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Status update completed!');
    console.log(`Total vendors updated: ${updated}`);
    console.log(`Vendors not found in Excel: ${notFound}`);
    console.log('\nFinal vendor status breakdown:');
    console.log(`  Total: ${stats.total}`);
    console.log(`  Active: ${stats.active}`);
    console.log(`  Inactive: ${stats.inactive}`);
    console.log(`  Pending: ${stats.pending}`);
    console.log(`  Suspended: ${stats.suspended}`);
    
  } catch (error) {
    console.error('\n❌ Status update failed:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the update
fixVendorStatuses();
