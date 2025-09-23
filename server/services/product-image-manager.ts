import { storage } from '../storage';
import { imageRecognitionService } from './image-recognition';
import axios from 'axios';
// import sharp from 'sharp';  // Temporarily disabled for Windows compatibility
let sharp: any = null;
try {
  sharp = require('sharp');
} catch (error) {
  console.warn('Sharp not available - image processing will be limited:', error.message);
}
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

interface ProductImageUpload {
  productId: string;
  imageBuffer: Buffer;
  filename?: string;
  mimeType?: string;
  originalUrl?: string;
}

interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export class ProductImageManager {
  private imagesDir: string;
  private baseUrl: string;

  constructor() {
    // Create images directory if it doesn't exist
    this.imagesDir = path.join(process.cwd(), 'uploads', 'products');
    // Prefer relative URLs so they work in any environment/domain
    this.baseUrl = process.env.BASE_URL || '';
    this.ensureImagesDirectory();
  }

  private ensureImagesDirectory(): void {
    try {
      if (!fs.existsSync(this.imagesDir)) {
        fs.mkdirSync(this.imagesDir, { recursive: true });
        console.log(`Created product images directory: ${this.imagesDir}`);
      }
    } catch (error) {
      console.error('Failed to create images directory:', error);
    }
  }

  // Process and save product image
  async saveProductImage(
    productId: string, 
    imageBuffer: Buffer, 
    options: ImageProcessingOptions = {}
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        return { success: false, error: 'Product not found' };
      }

      // Process image with Sharp (if available)
      const {
        maxWidth = 800,
        maxHeight = 600,
        quality = 85,
        format = 'jpeg'
      } = options;

      let processedBuffer = imageBuffer;
      const fileExtension = format === 'jpeg' ? 'jpg' : format;
      const filename = `${productId}-${nanoid()}.${fileExtension}`;
      const filePath = path.join(this.imagesDir, filename);
      
      if (sharp) {
        try {
          let processedImage = sharp(imageBuffer);

          // Resize if needed
          const metadata = await processedImage.metadata();
          if (metadata.width > maxWidth || metadata.height > maxHeight) {
            processedImage = processedImage.resize(maxWidth, maxHeight, {
              fit: 'inside',
              withoutEnlargement: false
            });
          }

          // Convert to desired format
          if (format === 'jpeg') {
            processedImage = processedImage.jpeg({ quality });
          } else if (format === 'png') {
            processedImage = processedImage.png({ quality });
          } else if (format === 'webp') {
            processedImage = processedImage.webp({ quality });
          }

          await processedImage.toFile(filePath);
        } catch (error) {
          console.warn('Sharp processing failed, saving original image:', error.message);
          // Save original buffer if Sharp fails
          fs.writeFileSync(filePath, imageBuffer);
        }
      } else {
        // Save original buffer if Sharp not available
        fs.writeFileSync(filePath, imageBuffer);
      }

      // Create URL for the image (relative by default)
      let imageUrl = `${this.baseUrl}/uploads/products/${filename}`;
      // If URL contains localhost in DB history, strip host and make relative
      try {
        const u = new URL(imageUrl);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          imageUrl = u.pathname;
        }
      } catch {}

      // Update product in database
      let photos = [];
      if (product.photos && Array.isArray(product.photos)) {
        photos = [...product.photos];
      }
      
      photos.push({
        url: imageUrl,
        filename,
        uploadedAt: new Date().toISOString(),
        type: 'product_image'
      });

      // Update the main imageUrl if this is the first image
      const updates: any = { photos };
      if (!product.imageUrl) {
        updates.imageUrl = imageUrl;
      }

      await storage.updateProduct(productId, updates);

      // Index the image for recognition
      await this.indexProductImage(productId, imageUrl);

      console.log(`Saved product image: ${filename} for product ${productId}`);
      
      return { success: true, imageUrl };

    } catch (error) {
      console.error('Error saving product image:', error);
      return { success: false, error: error.message };
    }
  }

  // Download image from URL and save as product image
  async saveProductImageFromUrl(
    productId: string, 
    imageUrl: string,
    options: ImageProcessingOptions = {}
  ): Promise<{ success: boolean; localImageUrl?: string; error?: string }> {
    try {
      // Download image with appropriate headers for WhatsApp media
      const headers: Record<string, string> = {};
      try {
        const urlObj = new URL(imageUrl);
        const host = urlObj.host.toLowerCase();
        // If downloading from Meta/WhatsApp media hosts, include token
        if (host.includes('lookaside.fbsbx.com') || host.includes('facebook.com') || host.includes('fbcdn.net')) {
          const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }
      } catch {}

      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', headers });
      const imageBuffer = Buffer.from(response.data);

      // Save the image
      const result = await this.saveProductImage(productId, imageBuffer, options);
      
      if (result.success) {
        return { success: true, localImageUrl: result.imageUrl };
      } else {
        return { success: false, error: result.error };
      }

    } catch (error) {
      console.error('Error downloading and saving product image:', error);
      return { success: false, error: error.message };
    }
  }

  // Bulk upload images for multiple products
  async bulkUploadProductImages(uploads: ProductImageUpload[]): Promise<{
    success: number;
    failed: number;
    results: Array<{ productId: string; success: boolean; imageUrl?: string; error?: string }>;
  }> {
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const upload of uploads) {
      const result = await this.saveProductImage(upload.productId, upload.imageBuffer);
      results.push({
        productId: upload.productId,
        ...result
      });

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    return {
      success: successCount,
      failed: failedCount,
      results
    };
  }

  // Index product image for recognition
  private async indexProductImage(productId: string, imageUrl: string): Promise<void> {
    try {
      await imageRecognitionService.indexProductImage(productId, imageUrl);
      console.log(`Indexed image for product recognition: ${productId}`);
    } catch (error) {
      console.warn(`Failed to index image for recognition: ${productId}`, error);
    }
  }

  // Get product images - returns format expected by React component
  async getProductImages(productId: string): Promise<Array<{
    url: string;
    filename: string;
    uploadedAt: string;
  }>> {
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        return [];
      }

      const images = [];
      
      // Add main image if it exists
      if (product.imageUrl) {
        images.push({
          url: product.imageUrl,
          filename: path.basename(product.imageUrl),
          uploadedAt: product.updatedAt || product.createdAt || new Date().toISOString()
        });
      }
      
      // Add additional photos
      if (product.photos && Array.isArray(product.photos)) {
        for (const photo of product.photos) {
          if (typeof photo === 'string') {
            // Legacy string format
            images.push({
              url: photo,
              filename: path.basename(photo),
              uploadedAt: product.updatedAt || product.createdAt || new Date().toISOString()
            });
          } else if (photo && typeof photo === 'object' && photo.url) {
            // New object format
            images.push({
              url: photo.url,
              filename: photo.filename || path.basename(photo.url),
              uploadedAt: photo.uploadedAt || product.updatedAt || product.createdAt || new Date().toISOString()
            });
          }
        }
      }
      
      // Remove duplicates based on URL
      const uniqueImages = images.filter((image, index, self) => 
        index === self.findIndex(img => img.url === image.url)
      );
      
      console.log(`Retrieved ${uniqueImages.length} images for product ${productId}`);
      return uniqueImages;

    } catch (error) {
      console.error('Error getting product images:', error);
      return [];
    }
  }

  // Delete product image
  async deleteProductImage(productId: string, imageUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const product = await storage.getProduct(productId);
      if (!product) {
        return { success: false, error: 'Product not found' };
      }

      // Extract filename from URL
      const filename = path.basename(imageUrl);
      const filePath = path.join(this.imagesDir, filename);

      // Delete physical file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Update product in database
      let updates: any = {};
      
      // Remove from main imageUrl if it matches
      if (product.imageUrl === imageUrl) {
        updates.imageUrl = null;
      }

      // Remove from photos array
      if (product.photos && Array.isArray(product.photos)) {
        updates.photos = product.photos.filter(photo => {
          const photoUrl = typeof photo === 'string' ? photo : photo.url;
          return photoUrl !== imageUrl;
        });

        // If we removed the main image, promote the first remaining photo
        if (!updates.imageUrl && updates.photos.length > 0) {
          const firstPhoto = updates.photos[0];
          updates.imageUrl = typeof firstPhoto === 'string' ? firstPhoto : firstPhoto.url;
        }
      }

      await storage.updateProduct(productId, updates);

      console.log(`Deleted product image: ${filename} for product ${productId}`);
      
      return { success: true };

    } catch (error) {
      console.error('Error deleting product image:', error);
      return { success: false, error: error.message };
    }
  }

  // Sync product images with recognition service
  async syncWithRecognitionService(): Promise<{ 
    indexed: number; 
    failed: number;
    status: string; 
  }> {
    try {
      const products = await storage.getProducts();
      let indexed = 0;
      let failed = 0;

      for (const product of products) {
        if (product.imageUrl) {
          try {
            await imageRecognitionService.indexProductImage(product.id, product.imageUrl);
            indexed++;
          } catch (error) {
            console.warn(`Failed to index product ${product.id}:`, error);
            failed++;
          }
        }

        // Also index additional photos
        if (product.photos && Array.isArray(product.photos)) {
          for (const photo of product.photos) {
            const photoUrl = typeof photo === 'string' ? photo : photo.url;
            if (photoUrl && photoUrl !== product.imageUrl) {
              try {
                await imageRecognitionService.indexProductImage(product.id, photoUrl);
                indexed++;
              } catch (error) {
                console.warn(`Failed to index additional photo for product ${product.id}:`, error);
                failed++;
              }
            }
          }
        }
      }

      const status = `Indexed ${indexed} images, ${failed} failed`;
      console.log(status);
      
      return { indexed, failed, status };

    } catch (error) {
      console.error('Error syncing with recognition service:', error);
      return { indexed: 0, failed: 0, status: `Sync failed: ${error.message}` };
    }
  }

  // Get statistics
  async getStats(): Promise<{
    totalProducts: number;
    productsWithImages: number;
    productsWithoutImages: number;
    totalImages: number;
    recognitionServiceStatus: { initialized: boolean; productsIndexed: number };
  }> {
    try {
      const products = await storage.getProducts();
      let productsWithImages = 0;
      let totalImages = 0;

      // Use the same logic as getProductImages to count accurately
      for (const product of products) {
        const images = await this.getProductImages(product.id);
        if (images.length > 0) {
          productsWithImages++;
          totalImages += images.length;
        }
      }

      const recognitionServiceStatus = imageRecognitionService.getStatus();

      return {
        totalProducts: products.length,
        productsWithImages,
        productsWithoutImages: products.length - productsWithImages,
        totalImages,
        recognitionServiceStatus
      };

    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalProducts: 0,
        productsWithImages: 0,
        productsWithoutImages: 0,
        totalImages: 0,
        recognitionServiceStatus: { initialized: false, productsIndexed: 0 }
      };
    }
  }
}

// Singleton instance
export const productImageManager = new ProductImageManager();
