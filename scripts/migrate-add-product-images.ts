import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function addProductImagesTable() {
  console.log('Adding product_images table...');
  
  try {
    // Create the product_images table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_images (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        data TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    console.log('✅ product_images table created successfully');
    
    // Create index for better performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id)
    `);
    
    console.log('✅ Index created for product_images.product_id');
    
  } catch (error) {
    console.error('❌ Error creating product_images table:', error);
    throw error;
  }
}

addProductImagesTable()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
