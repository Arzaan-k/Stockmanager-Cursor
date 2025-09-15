#!/usr/bin/env node

/**
 * Populate Neon PostgreSQL database with vendor data from Excel file
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { vendors, vendorContacts } from './shared/schema.js';
import { neon } from '@neondatabase/serverless';
import XLSX from 'xlsx';
import 'dotenv/config';
import { eq } from 'drizzle-orm';

// Configure database
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

// Helper function to clean and normalize data
function cleanData(value) {
  if (!value || value === 'nan' || value === 'NaN' || value === null || value === undefined) {
    return null;
  }
  return String(value).trim();
}

// Helper function to normalize status
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

// Helper function to generate unique product code
function generateProductCode(mainCategory, index) {
  const categoryPrefix = mainCategory.toLowerCase().includes('admin') ? 'ADM' : 'OPS';
  return `${categoryPrefix}-${String(index).padStart(4, '0')}`;
}

// Helper function to extract phone number
function extractPhoneNumber(contactData) {
  if (!contactData) return null;
  
  // Convert to string and clean
  const cleaned = String(contactData).replace(/[^\d]/g, '');
  
  // If it's a valid Indian mobile number (10 digits), return it
  if (cleaned.length === 10) {
    return cleaned;
  }
  
  // If it's 11 digits starting with 91, remove country code
  if (cleaned.length === 11 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  
  // If it's 12 digits starting with 91, remove country code
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
    await db.delete(vendorContacts);
    const deleteResult = await db.delete(vendors);
    
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
          productCode = generateProductCode(mainCategory, i + 1);
        }
        
        // Insert vendor
        const vendorResult = await db.insert(vendors).values({
          name: name,
          mainCategory: mainCategory,
          subcategory: subcategory,
          productType: productType || 'General',
          productCode: productCode,
          otherProducts: otherProducts,
          contactNumber: contactNumber,
          location: location || '',
          city: city || '',
          state: state || '',
          zone: zone,
          status: status,
          isActive: status === 'active'
        }).returning({ id: vendors.id });
        
        // Insert contact information if we have valid contact data
        if (vendorResult.length > 0 && contactNumber) {
          await db.insert(vendorContacts).values({
            vendorId: vendorResult[0].id,
            name: name,
            phone: contactNumber,
            isPrimary: true
          });
        }
        
        successCount++;
        
        if ((i + 1) % 50 === 0) {
          console.log(`✅ Processed ${i + 1}/${vendorData.length} vendors...`);
        }
        
      } catch (rowError) {
        errorCount++;
        console.error(`❌ Error processing row ${i + 1}:`, rowError.message);
        continue; // Continue with next row
      }
    }
    
    console.log(`\n📊 Summary:`);
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
    const totalVendors = await db.select().from(vendors);
    
    // Get count by status
    const activeVendors = await db.select().from(vendors).where(eq(vendors.status, 'active'));
    const inactiveVendors = await db.select().from(vendors).where(eq(vendors.status, 'inactive'));
    const pendingVendors = await db.select().from(vendors).where(eq(vendors.status, 'pending'));
    
    // Group by category
    const categoryStats = {};
    const zoneStats = {};
    
    totalVendors.forEach(vendor => {
      // Category stats
      const category = vendor.mainCategory || 'Unknown';
      categoryStats[category] = (categoryStats[category] || 0) + 1;
      
      // Zone stats
      const zone = vendor.zone || 'Unknown';
      zoneStats[zone] = (zoneStats[zone] || 0) + 1;
    });
    
    return {
      total: totalVendors.length,
      active: activeVendors.length,
      inactive: inactiveVendors.length,
      pending: pendingVendors.length,
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
    console.log('🚀 Starting vendor data import to Neon PostgreSQL...\n');
    
    // Check if Excel file exists
    const excelFile = 'Vendor Category Matersheet Final.xlsx';
    try {
      await import('fs').then(fs => {
        if (!fs.default.existsSync(excelFile)) {
          throw new Error(`Excel file not found: ${excelFile}`);
        }
      });
    } catch (error) {
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
    console.log('\n📊 Final Database Statistics:');
    console.log('=' * 50);
    
    const stats = await getVendorStatistics();
    if (stats) {
      console.log(`\n📈 Vendor Overview:`);
      console.log(`   Total Vendors: ${stats.total}`);
      console.log(`   Active: ${stats.active}`);
      console.log(`   Inactive: ${stats.inactive}`);
      console.log(`   Pending: ${stats.pending}`);
      
      console.log(`\n🏢 By Category:`);
      Object.entries(stats.categoryStats).forEach(([category, count]) => {
        console.log(`   ${category}: ${count}`);
      });
      
      console.log(`\n🌍 By Zone:`);
      Object.entries(stats.zoneStats).forEach(([zone, count]) => {
        console.log(`   ${zone}: ${count}`);
      });
    }
    
    console.log('\n🎉 Vendor data import completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Refresh your website to see the vendors');
    console.log('   2. Check vendor status and update as needed');
    console.log('   3. Add additional vendor contacts if required');
    
  } catch (error) {
    console.error('\n💥 Fatal error during import:', error);
    process.exit(1);
  }
}

// Run the main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('💥 Unhandled error:', error);
      process.exit(1);
    });
}
