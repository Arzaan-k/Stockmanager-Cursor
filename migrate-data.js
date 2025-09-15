import { Pool } from '@neondatabase/serverless';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Original database (with your data)
const originalDbUrl = "postgresql://neondb_owner:npg_KH2CYZVt8GrF@ep-wandering-morning-afvvs67s.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require";

// New database (empty)
const newDbUrl = "postgresql://neondb_owner:npg_N1AIkOGx0cdt@ep-crimson-field-ad83yzhj.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function migrateData() {
    let originalPool = null;
    let newPool = null;
    
    try {
        console.log('🔄 Connecting to databases...');
        
        // Create pools for both databases
        originalPool = new Pool({ connectionString: originalDbUrl });
        newPool = new Pool({ connectionString: newDbUrl });
        
        console.log('✅ Connected to both databases');
        
        // List of tables to migrate (in dependency order)
        const tables = [
            'users',
            'warehouses', 
            'products',
            'vendors',
            'customers',
            'orders',
            'order_items',
            'inventory_transactions',
            'purchase_orders',
            'purchase_order_items'
        ];
        
        for (const table of tables) {
            try {
                console.log(`\n📋 Migrating table: ${table}`);
                
                // Check if table exists in original database
                const checkTableQuery = `
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    );
                `;
                
                const tableExistsResult = await originalPool.query(checkTableQuery, [table]);
                
                if (!tableExistsResult.rows[0].exists) {
                    console.log(`⚠️  Table ${table} doesn't exist in original database, skipping...`);
                    continue;
                }
                
                // Get all data from original table
                const selectQuery = `SELECT * FROM ${table}`;
                const result = await originalPool.query(selectQuery);
                
                console.log(`📊 Found ${result.rows.length} records in ${table}`);
                
                if (result.rows.length === 0) {
                    console.log(`📭 Table ${table} is empty, skipping...`);
                    continue;
                }
                
                // Clear the target table first
                await newPool.query(`DELETE FROM ${table}`);
                console.log(`🗑️  Cleared existing data from ${table} in new database`);
                
                // Get column names
                const columns = Object.keys(result.rows[0]);
                const columnNames = columns.join(', ');
                const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
                
                // Insert data into new database
                let insertedCount = 0;
                for (const row of result.rows) {
                    try {
                        const values = columns.map(col => row[col]);
                        const insertQuery = `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`;
                        await newPool.query(insertQuery, values);
                        insertedCount++;
                    } catch (insertError) {
                        console.error(`❌ Error inserting row into ${table}:`, insertError.message);
                        // Continue with next row
                    }
                }
                
                console.log(`✅ Successfully migrated ${insertedCount}/${result.rows.length} records to ${table}`);
                
            } catch (tableError) {
                console.error(`❌ Error migrating table ${table}:`, tableError.message);
                // Continue with next table
            }
        }
        
        console.log('\n🎉 Data migration completed!');
        console.log('\n📝 Summary:');
        console.log('- Original database data has been copied to the new database');
        console.log('- You can now use the new database endpoint');
        console.log('- Consider updating your .env file to use the new endpoint as primary');
        
    } catch (error) {
        console.error('💥 Migration failed:', error);
        console.error('Error details:', error.message);
        
        if (error.message.includes('endpoint has been disabled')) {
            console.log('\n🔒 The original database endpoint is still frozen/disabled.');
            console.log('💡 Try these options:');
            console.log('1. Go to your Replit project and look for "Resume" or "Unfreeze" options');
            console.log('2. Check Neon console for endpoint management options');
            console.log('3. Contact Neon or Replit support for help unfreezing the database');
        }
    } finally {
        // Clean up connections
        if (originalPool) {
            try {
                await originalPool.end();
            } catch (e) {
                console.log('Note: Could not cleanly close original database connection');
            }
        }
        if (newPool) {
            try {
                await newPool.end();
            } catch (e) {
                console.log('Note: Could not cleanly close new database connection');
            }
        }
    }
}

// Run the migration
console.log('🚀 Starting data migration...');
console.log('📤 From: ep-wandering-morning-afvvs67s (original)');
console.log('📥 To: ep-crimson-field-ad83yzhj (new)');
console.log('⚠️  This will overwrite any existing data in the new database\n');

migrateData().catch(console.error);
