import 'dotenv/config';
import { db } from '../server/db';
import { products, productImages } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { log } from '../server/vite';

async function updateLegacyImageUrls() {
  log("Starting legacy image URL update...");

  try {
    // Get all products with legacy imageUrl patterns
    const allProducts = await db.select().from(products);
    let updatedCount = 0;

    for (const product of allProducts) {
      let needsUpdate = false;
      let newImageUrl = product.imageUrl;

      // Check if this product has images in the database storage
      const dbImages = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(productImages.createdAt)
        .limit(1);

      if (dbImages.length > 0) {
        // Update imageUrl to point to the database image
        const firstDbImage = dbImages[0];
        newImageUrl = `/api/images/${firstDbImage.id}`;
        needsUpdate = true;
        log(`Found database image for ${product.name}: ${newImageUrl}`);
      } else if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
        // This is a legacy filesystem URL, but no database image exists
        // Set to null to indicate no image available
        newImageUrl = null;
        needsUpdate = true;
        log(`Clearing legacy URL for ${product.name} (no database image found)`);
      }

      if (needsUpdate) {
        await db
          .update(products)
          .set({
            imageUrl: newImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id));
        updatedCount++;
      }
    }

    log(`Legacy image URL update complete. Updated ${updatedCount} products.`);
  } catch (error) {
    console.error('Error updating legacy image URLs:', error);
    throw error;
  }
}

updateLegacyImageUrls().catch(console.error);
