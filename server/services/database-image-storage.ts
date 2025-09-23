import { db } from '../db';
import { productImages } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export class DatabaseImageStorage {
  // Store image as base64 in database
  async storeImage(
    productId: string,
    imageBuffer: Buffer,
    filename: string,
    mimeType: string = 'image/jpeg'
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    try {
      const imageId = nanoid();
      const base64Data = imageBuffer.toString('base64');
      
      await db.insert(productImages).values({
        id: imageId,
        productId,
        filename,
        mimeType,
        data: base64Data,
        size: imageBuffer.length,
        createdAt: new Date()
      });

      return { success: true, imageId };
    } catch (error) {
      console.error('Failed to store image in database:', error);
      return { success: false, error: error.message };
    }
  }

  // Retrieve image from database
  async getImage(imageId: string): Promise<{ success: boolean; buffer?: Buffer; mimeType?: string; error?: string }> {
    try {
      const result = await db.select()
        .from(productImages)
        .where(eq(productImages.id, imageId))
        .limit(1);

      if (result.length === 0) {
        return { success: false, error: 'Image not found' };
      }

      const image = result[0];
      const buffer = Buffer.from(image.data, 'base64');
      
      return { 
        success: true, 
        buffer, 
        mimeType: image.mimeType 
      };
    } catch (error) {
      console.error('Failed to retrieve image from database:', error);
      return { success: false, error: error.message };
    }
  }

  // Get all images for a product
  async getProductImages(productId: string): Promise<{ success: boolean; images?: any[]; error?: string }> {
    try {
      const result = await db.select()
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(productImages.createdAt);

      const images = result.map(img => ({
        id: img.id,
        filename: img.filename,
        mimeType: img.mimeType,
        size: img.size,
        url: `/api/images/${img.id}`,
        createdAt: img.createdAt
      }));

      return { success: true, images };
    } catch (error) {
      console.error('Failed to get product images:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete image from database
  async deleteImage(imageId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.delete(productImages).where(eq(productImages.id, imageId));
      return { success: true };
    } catch (error) {
      console.error('Failed to delete image from database:', error);
      return { success: false, error: error.message };
    }
  }
}

export const databaseImageStorage = new DatabaseImageStorage();
