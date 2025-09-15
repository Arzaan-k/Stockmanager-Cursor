#!/usr/bin/env node

/**
 * Populate Neon PostgreSQL database with vendor data from Excel file
 */

import { neon } from '@neondatabase/serverless';
import XLSX from 'xlsx';
import 'dotenv/config';
import fs from 'fs';

// Configure database
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Helper functions
function cleanData(value) {
  if (!value || value === 'nan' || value === 'NaN' || value === null || value === undefined) {
    return null;
  }
  return String(value).trim();
}

function normalizeStatus(status) {
  if (!status) return 'pending';
  const statusLower = status.toString().toLowerCase().trim();
  
  switch (statusLower) {
    case 'active':
    case 'approved':
      return 'active';
    case 'inactive':
    case 'disabled':
    case 'suspended':
      return 'inactive';
    default:
      return 'pending';
  }
}

function generateProductCode(mainCategory, index, existingCodes) {
  const categoryPrefix = mainCategory.toLowerCase().includes('admin') ? 'ADM' : 'OPS';
  let productCode = `${categoryPrefix}-${String(index).padStart(4, '0')}`;
  
  // If code already exists, append a suffix
  let suffix = 1;
  while (existingCodes.has(productCode)) {
    productCode = `${categoryPrefix}-${String(index).padStart(4, '0')}-${suffix}`;
    suffix++;
  }
  
  return productCode;
}

function extractPhoneNumber(contactData) {
  if (!contactData) return null;
  
  const cleaned = String(contactData).replace(/[^\\d]/g, '');
  
  if (cleaned.length === 10) {
    return cleaned;
  }
  
  if (cleaned.length === 11 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  
  return cleaned || null;
}

async function readExcelFile(filePath) {
  try {
    console.log(`📖 Reading Excel file: ${filePath}`);
    
    const workbook = XLSX.readFile(filePath);
    const masterSheetName = 'Master Sheet';
    
    if (!workbook.Sheets[masterSheetName]) {
      throw new Error(`Sheet "${masterSheetName}" not found in Excel file`);
    }
    
    const worksheet = workbook.Sheets[masterSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`✅ Read ${jsonData.length} rows from Excel file`);
    return jsonData;
    
  } catch (error) {
    console.error('❌ Error reading Excel file:', error);
    throw error;
  }
}

async function clearExistingVendors() {
  try {
    console.log('🧹 Clearing existing vendor data...');
    
    // Delete in order due to foreign key constraints
    await sql`DELETE FROM vendor_contacts`;
    await sql`DELETE FROM vendor_products`;
    await sql`DELETE FROM vendors`;
    
    console.log('✅ Cleared existing vendor data');
    return true;
  } catch (error) {
    console.error('❌ Error clearing vendor data:', error);
    throw error;
  }
}

async function insertVendors(vendorData) {
  try {
    console.log(`📝 Inserting ${vendorData.length} vendors...`);
    
    let successCount = 0;
    let errorCount = 0;
    const existingCodes = new Set();
    
    for (let i = 0; i < vendorData.length; i++) {
      try {
        const row = vendorData[i];
        
        // Extract and clean data
        const name = cleanData(row['Vendor Name']);
        const mainCategory = cleanData(row['Main Category']);
        const subcategory = cleanData(row['Subcategory']);
        const productType = cleanData(row['Product Type']);
        const otherProducts = cleanData(row['Other Products/Services']);
        const contactNumber = extractPhoneNumber(row['Contact Number']);
        const location = cleanData(row['Location']);
        const state = cleanData(row['State']);
        const city = cleanData(row['City']);
        const zone = cleanData(row['Zone']);
        const status = normalizeStatus(row['Status Of Vendor']);
        
        // Skip if essential data is missing
        if (!name || !mainCategory || !subcategory) {
          console.log(`⚠️  Skipping row ${i + 1}: Missing essential data (name, category, or subcategory)`);
          continue;
        }
        
        // Generate a unique product code
        let productCode = cleanData(row['Product Code']);
        if (!productCode) {
          productCode = generateProductCode(mainCategory, i + 1, existingCodes);
        } else {
          // If product code exists, make it unique
          let suffix = 1;
          const originalCode = productCode;
          while (existingCodes.has(productCode)) {
            productCode = `${originalCode}-${suffix}`;
            suffix++;
          }
        }
        
        existingCodes.add(productCode);
        
        // Insert vendor using SQL
        const vendorResult = await sql`
          INSERT INTO vendors (
            name, main_category, subcategory, product_type, product_code,
            other_products, contact_number, location, city, state, zone,
            status, is_active
          )
          VALUES (
            ${name}, ${mainCategory}, ${subcategory}, ${productType || 'General'}, ${productCode},
            ${otherProducts}, ${contactNumber}, ${location || ''}, ${city || ''}, ${state || ''}, ${zone},
            ${status}, ${status === 'active'}
          )
          RETURNING id
        `;
        
        // Insert contact information if we have valid contact data
        if (vendorResult.length > 0 && contactNumber) {
          await sql`
            INSERT INTO vendor_contacts (vendor_id, name, phone, is_primary)
            VALUES (${vendorResult[0].id}, ${name}, ${contactNumber}, true)
          `;
        }
        
        successCount++;
        
        if ((i + 1) % 50 === 0) {
          console.log(`✅ Processed ${i + 1}/${vendorData.length} vendors...`);
        }
        
      } catch (rowError) {
        errorCount++;
        console.error(`❌ Error processing row ${i + 1}:`, rowError.message);
        continue;
      }
    }
    
    console.log(`\\n📊 Summary:`);
    console.log(`   ✅ Successfully inserted: ${successCount} vendors`);
    console.log(`   ❌ Errors: ${errorCount} vendors`);
    
    return { successCount, errorCount };
    
  } catch (error) {
    console.error('❌ Error inserting vendors:', error);
    throw error;
  }
}

async function getVendorStatistics() {
  try {
    // Get total count
    const totalResult = await sql`SELECT COUNT(*) as count FROM vendors`;
    const total = parseInt(totalResult[0].count);
    
    // Get count by status
    const activeResult = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'active'`;
    const active = parseInt(activeResult[0].count);
    
    const inactiveResult = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'inactive'`;
    const inactive = parseInt(inactiveResult[0].count);
    
    const pendingResult = await sql`SELECT COUNT(*) as count FROM vendors WHERE status = 'pending'`;
    const pending = parseInt(pendingResult[0].count);
    
    // Group by category
    const categoryResult = await sql`
      SELECT main_category, COUNT(*) as count 
      FROM vendors 
      GROUP BY main_category
    `;
    
    // Group by zone
    const zoneResult = await sql`
      SELECT zone, COUNT(*) as count 
      FROM vendors 
      WHERE zone IS NOT NULL 
      GROUP BY zone
    `;
    
    const categoryStats = {};
    categoryResult.forEach(row => {
      categoryStats[row.main_category || 'Unknown'] = parseInt(row.count);
    });
    
    const zoneStats = {};
    zoneResult.forEach(row => {
      zoneStats[row.zone || 'Unknown'] = parseInt(row.count);
    });
    
    return {
      total,
      active,
      inactive,
      pending,
      categoryStats,
      zoneStats
    };
  } catch (error) {
    console.error('❌ Error getting statistics:', error);
    return null;
  }
}

async function main() {
  try {
    console.log('🚀 Starting vendor data import to Neon PostgreSQL...\\n');
    
    // Check if Excel file exists
    const excelFile = 'Vendor Category Matersheet Final.xlsx';
    if (!fs.existsSync(excelFile)) {
      console.error(`❌ Excel file not found: ${excelFile}`);
      console.error('Please ensure the Excel file is in the current directory.');
      process.exit(1);
    }
    
    // Read Excel data
    const excelData = await readExcelFile(excelFile);
    
    if (excelData.length === 0) {
      console.log('⚠️  No data found in Excel file');
      return;
    }
    
    // Clear existing data
    await clearExistingVendors();
    
    // Insert new vendor data
    const result = await insertVendors(excelData);
    
    // Get and display statistics
    console.log('\\n📊 Final Database Statistics:');
    console.log('=' * 50);
    
    const stats = await getVendorStatistics();
    if (stats) {
      console.log(`\\n📈 Vendor Overview:`);
      console.log(`   Total Vendors: ${stats.total}`);
      console.log(`   Active: ${stats.active}`);
      console.log(`   Inactive: ${stats.inactive}`);
      console.log(`   Pending: ${stats.pending}`);
      
      console.log(`\\n🏢 By Category:`);
      Object.entries(stats.categoryStats).forEach(([category, count]) => {
        console.log(`   ${category}: ${count}`);
      });
      
      console.log(`\\n🌍 By Zone:`);
      Object.entries(stats.zoneStats).forEach(([zone, count]) => {
        console.log(`   ${zone}: ${count}`);
      });
    }
    
    console.log('\\n🎉 Vendor data import completed successfully!');
    console.log('\\n💡 Next steps:');
    console.log('   1. Refresh your website to see the vendors');
    console.log('   2. Check vendor status and update as needed');
    console.log('   3. Add additional vendor contacts if required');
    
  } catch (error) {
    console.error('\\n💥 Fatal error during import:', error);
    process.exit(1);
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
