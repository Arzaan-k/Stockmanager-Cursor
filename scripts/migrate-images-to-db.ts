import 'dotenv/config';
import { db } from '../server/db';
import { products } from '../shared/schema';
import { databaseImageStorage } from '../server/services/database-image-storage';
import * as fs from 'fs';
import * as path from 'path';

async function migrateImagesToDatabase() {
  console.log('Starting image migration to database...');
  
  try {
    // Get all products
    const allProducts = await db.select().from(products);
    console.log(`Found ${allProducts.length} products to process`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const product of allProducts) {
      console.log(`Processing product: ${product.name} (${product.id})`);
      
      // Check if product has images in filesystem
      const uploadsDir = path.join(process.cwd(), 'uploads', 'products');
      const files = fs.readdirSync(uploadsDir).filter(file => 
        file.startsWith(product.id) && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'))
      );
      
      if (files.length === 0) {
        console.log(`  No images found for product ${product.name}`);
        skippedCount++;
        continue;
      }
      
      console.log(`  Found ${files.length} images for product ${product.name}`);
      
      // Process each image file
      for (const filename of files) {
        try {
          const filePath = path.join(uploadsDir, filename);
          const imageBuffer = fs.readFileSync(filePath);
          
          // Determine MIME type from file extension
          const ext = path.extname(filename).toLowerCase();
          const mimeType = ext === '.png' ? 'image/png' : 
                          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                          'image/jpeg';
          
          // Store in database
          const result = await databaseImageStorage.storeImage(
            product.id,
            imageBuffer,
            filename,
            mimeType
          );
          
          if (result.success) {
            console.log(`    ✅ Migrated: ${filename} (ID: ${result.imageId})`);
            migratedCount++;
          } else {
            console.log(`    ❌ Failed to migrate: ${filename} - ${result.error}`);
            errorCount++;
          }
          
        } catch (error) {
          console.log(`    ❌ Error processing ${filename}:`, error.message);
          errorCount++;
        }
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`✅ Successfully migrated: ${migratedCount} images`);
    console.log(`⏭️  Skipped (no images): ${skippedCount} products`);
    console.log(`❌ Errors: ${errorCount} images`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

migrateImagesToDatabase()
  .then(() => {
    console.log('Image migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Image migration failed:', error);
    process.exit(1);
  });
