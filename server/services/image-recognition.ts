// Keep interfaces at top
interface ProductMatch {
  productId: string;
  productName: string;
  sku: string;
  confidence: number;
  description?: string | null;
  imageUrl?: string | null;
  matchType?: string;
}

interface ImageProcessingResult {
  matches: ProductMatch[];
  processingTime: number;
  success: boolean;
  error?: string;
  extractedText?: string;
}

import * as tf from '@tensorflow/tfjs';
import axios from 'axios';
import { storage } from '../storage';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

// Update class declaration
export class ImageRecognitionService {
  private tensorflowModel: tf.LayersModel | null = null;
  private isInitialized: boolean = false;
  private productFeatures: Map<string, Float32Array> = new Map();
  private productHashes: Map<string, string> = new Map();
  private productColors: Map<string, Float32Array> = new Map(); // Add to class
  private processedMessageIds: Set<string> = new Set();
  private accessToken: string = process.env.WHATSAPP_ACCESS_TOKEN || '';
  private ocrWorker: any = null;

  constructor() {
    // Start initialization
    this.initialize().catch(err => {
      console.error('Failed to initialize ImageRecognitionService:', err);
    });
  }

  private async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Image Recognition Service...');
      
      // Load models in sequence for reliability
      await this.loadTensorFlowModel();
      await this.initializeOCR();
      
      // Precompute product features
      await this.precomputeProductFeatures();
      
      this.isInitialized = true;
      console.log('✅ Image Recognition Service fully initialized!');
      
    } catch (error: any) {
      console.error('❌ Initialization failed:', error?.message || error);
      this.isInitialized = false;
    }
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give it time to initialize
    }
  }

  private async loadTensorFlowModel(): Promise<void> {
    try {
      console.log('🧠 Loading TensorFlow MobileNet for feature extraction...');
      
      // Use the standard MobileNet model
      this.tensorflowModel = await tf.loadLayersModel(
        'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json',
        {
          onProgress: (fractions: number) => {
            if (fractions > 0.1 && fractions < 0.9) {
              process.stdout.write(`\r📥 MobileNet: ${(fractions * 100).toFixed(0)}% `);
            }
          }
        }
      );
      
      console.log('\n✅ TensorFlow MobileNet loaded (4.2M params)');
      
      // Warm up the model
      console.log('🔥 Warming up TensorFlow model...');
      const dummyInput = tf.randomNormal([1, 224, 224, 3]).div(255);
      const warmupResult = this.tensorflowModel.predict(dummyInput) as tf.Tensor;
      await warmupResult.data();
      dummyInput.dispose();
      warmupResult.dispose();
      console.log('✅ Model warmed up successfully');
      
    } catch (error: any) {
      console.error('❌ TensorFlow model failed to load:', error?.message);
      this.tensorflowModel = null;
    }
  }

  private async initializeOCR(): Promise<void> {
    try {
      console.log('📝 Initializing OCR worker...');
      this.ocrWorker = await createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      console.log('✅ OCR worker initialized');
    } catch (error: any) {
      console.error('❌ Failed to initialize OCR:', error?.message);
      this.ocrWorker = null;
    }
  }

  // Load image using Sharp and convert to tensor for TensorFlow
  private async loadImageForTensorFlow(imageBuffer: Buffer): Promise<tf.Tensor3D | null> {
    try {
      // Convert any format to JPEG, resize
      const jpegBuffer = await sharp(imageBuffer)
        .resize(224, 224, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90 })
        .toBuffer();
      
      // Raw RGB
      const { data } = await sharp(jpegBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      if (data.length !== 224 * 224 * 3) {
        console.warn('Raw length wrong:', data.length);
        return null;
      }
      
      const pixels = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        pixels[i] = data[i] / 255.0;
      }
      
      const imageTensor = tf.tensor3d(pixels, [224, 224, 3]);
      return imageTensor;
      
    } catch (error: any) {
      console.error('Image load failed:', error.message);
      return null;
    }
  }

  // Extract visual features using TensorFlow (primary method)
  private async extractTensorFlowFeatures(imageBuffer: Buffer): Promise<Float32Array | null> {
    try {
      if (!this.tensorflowModel) {
        console.warn('No TF model');
        return null;
      }
      
      const imageTensor = await this.loadImageForTensorFlow(imageBuffer);
      if (!imageTensor) {
        console.warn('No image tensor');
        return null;
      }
      
      const resized = tf.image.resizeBilinear(imageTensor, [224, 224]);
      const normalized = resized
        .div(255.0)
        .sub(tf.tensor1d([0.485, 0.456, 0.406]))
        .div(tf.tensor1d([0.229, 0.224, 0.225]))
        .expandDims(0);
    
      console.log('Normalized shape:', normalized.shape);
    
      const features = this.tensorflowModel.predict(normalized) as tf.Tensor;
      console.log('Predict shape:', features.shape); // [1,1000]
    
      const featureData = await features.data() as Float32Array;
      console.log('Features length:', featureData.length);
    
      if (featureData.length !== 1000) {
        console.warn('Predict wrong length:', featureData.length);
        features.dispose();
        normalized.dispose();
        resized.dispose();
        imageTensor.dispose();
        return null;
      }
    
      // Pad to 1024 with zeros for consistency
      const result = new Float32Array(1024);
      result.set(featureData);
      // Last 24 are 0
    
      // Cleanup
      features.dispose();
      normalized.dispose();
      resized.dispose();
      imageTensor.dispose();
    
      console.log('✅ TF logits features: 1000 padded to 1024');
      return result;
      
    } catch (error: any) {
      console.error('TF extract failed:', error.message);
      return null;
    }
  }

  // Generate perceptual hash for exact matching
  private async generatePerceptualHash(imageBuffer: Buffer): Promise<string> {
    try {
      const { data } = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'cover' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      if (data.length !== 64) {
        console.warn('Hash length wrong:', data.length);
        return crypto.createHash('md5').update(imageBuffer).digest('hex').substring(0, 16);
      }
      
      let total = 0;
      for (let i = 0; i < 64; i++) {
        total += data[i];
      }
      const avg = total / 64;
      
      let hash = '';
      for (let i = 0; i < 64; i++) {
        hash += data[i] > avg ? '1' : '0';
      }
      
      let hexHash = '';
      for (let i = 0; i < 64; i += 4) {
        const chunk = parseInt(hash.substring(i, i + 4), 2);
        hexHash += chunk.toString(16).padStart(1, '0');
      }
      
      return hexHash;
      
    } catch (error: any) {
      console.error('Hash failed:', error.message);
      return crypto.createHash('md5').update(imageBuffer).digest('hex').substring(0, 16);
    }
  }

  // Cosine similarity for feature vectors
  private cosineSimilarity(vec1: Float32Array, vec2: Float32Array): number {
    if (vec1.length !== vec2.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const magnitude1 = Math.sqrt(norm1);
    const magnitude2 = Math.sqrt(norm2);
    
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }
    
    return dotProduct / (magnitude1 * magnitude2);
  }

  // Euclidean distance for color vectors
  private euclideanDistance(vec1: Float32Array, vec2: Float32Array): number {
    let dist = 0;
    for (let i = 0; i < vec1.length; i++) {
      dist += (vec1[i] - vec2[i]) ** 2;
    }
    return Math.sqrt(dist);
  }

  // Extract text from image using OCR
  private async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      if (!this.ocrWorker) {
        console.warn('OCR worker not available');
        return '';
      }

      console.log('🔍 Extracting text from image...');
      const { data: { text } } = await this.ocrWorker.recognize(imageBuffer);
      
      // Clean up the extracted text
      const cleanedText = text
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .trim();
      
      console.log(`📝 Extracted text: "${cleanedText}"`);
      return cleanedText;
    } catch (error: any) {
      console.warn('OCR text extraction failed:', error?.message);
      return '';
    }
  }

  // Enhanced feature extraction combining multiple methods
  private async extractVisualFeatures(imageBuffer: Buffer): Promise<{
    tfFeatures: Float32Array | null;
    perceptualHash: string;
    dominantColor: Float32Array;
    extractedText?: string;
  }> {
    const features = {
      tfFeatures: null as Float32Array | null,
      perceptualHash: '',
      dominantColor: new Float32Array(3),
      extractedText: ''
    };
    
    try {
      console.log('🔍 Extracting visual features...');
      
      // Detect mime roughly (first bytes)
      const firstBytes = imageBuffer.slice(0, 12);
      const isWebP = firstBytes.includes(Buffer.from('RIFF')) && firstBytes.includes(Buffer.from('WEBP'));
      const isAVIF = firstBytes.includes(Buffer.from('ftypavif'));
      console.log(`Image format: ${isWebP ? 'WebP' : isAVIF ? 'AVIF' : 'other'}`);
      
      if (this.tensorflowModel) {
        features.tfFeatures = await this.extractTensorFlowFeatures(imageBuffer);
        if (!features.tfFeatures) {
          console.warn(`❌ TF failed for ${isWebP ? 'WebP' : 'AVIF'} - check Jimp support`);
        } else if (features.tfFeatures.length !== 1024) {
          console.warn(`❌ TF size wrong: ${features.tfFeatures.length} (expected 1024)`);
          features.tfFeatures = null; // Invalidate
        } else {
          console.log('✅ TF OK');
        }
      }
      
      features.perceptualHash = await this.generatePerceptualHash(imageBuffer);
      if (features.perceptualHash.length < 16) {
        console.warn('❌ Hash short - fallback used');
      }

      // Extract text using OCR
      features.extractedText = await this.extractTextFromImage(imageBuffer);
      
      // Dominant color always tries, but validate pixelCount >0
      const { data } = await sharp(imageBuffer)
        .resize(32, 32, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });
        
      let rSum = 0, gSum = 0, bSum = 0;
      for (let i = 0; i < data.length; i += 3) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }
      const pixelCount = data.length / 3;
      if (pixelCount > 0) {
        features.dominantColor[0] = rSum / (pixelCount * 255);
        features.dominantColor[1] = gSum / (pixelCount * 255);
        features.dominantColor[2] = bSum / (pixelCount * 255);
      } else {
        features.dominantColor.fill(0.5);
      }
      
      console.log(`✅ Features: TF=${!!features.tfFeatures}, Hash=${features.perceptualHash.substring(0, 8)}, Color=(${Math.round(features.dominantColor[0]*100)},${Math.round(features.dominantColor[1]*100)},${Math.round(features.dominantColor[2]*100)})`);
      
    } catch (error: any) {
      console.error(`Extraction error:`, error.message);
    }
    
    return features;
  }

  // Precompute features for all products
  private async precomputeProductFeatures(): Promise<void> {
    try {
      // Skip precomputing if disabled via environment variable
      if (process.env.DISABLE_IMAGE_PREFETCH === 'true') {
        console.log('📊 Skipping image precomputing (DISABLE_IMAGE_PREFETCH=true)');
        return;
      }

      console.log('📊 Precomputing visual features...');
      const products = await storage.getProducts();
      
      if (products.length === 0) {
        console.log('ℹ️ No products found');
        return;
      }
      
      let successCount = 0;
      let fallbackCount = 0;
      
      for (const product of products) {
        if (this.productFeatures.has(product.id)) continue;
        
        let usedVisual = false;
        
        // Try to get images from database first
        if (product.imageUrl && product.imageUrl.startsWith('/api/images/')) {
          try {
            const baseUrl = process.env.BASE_URL || 'http://localhost:10000';
            const fullImageUrl = product.imageUrl.startsWith('http') ? product.imageUrl : `${baseUrl}${product.imageUrl}`;
            const response = await axios.get(fullImageUrl, { 
              responseType: 'arraybuffer', 
              timeout: 10000 
            });
            const imageBuffer = Buffer.from(response.data);
            const features = await this.extractVisualFeatures(imageBuffer);
            
            if (features.tfFeatures && features.tfFeatures.length > 0) {
              this.productFeatures.set(product.id, features.tfFeatures);
              this.productHashes.set(product.id, features.perceptualHash);
              this.productColors.set(product.id, features.dominantColor);
              usedVisual = true;
              successCount++;
            }
          } catch (imageError: any) {
            console.warn(`Database image fetch failed for ${product.name}: ${imageError.message}`);
          }
        }
        
        // Fallback to legacy filesystem images
        if (!usedVisual && product.imageUrl && !product.imageUrl.startsWith('/api/images/')) {
          try {
            const response = await axios.get(product.imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
            const imageBuffer = Buffer.from(response.data);
            const features = await this.extractVisualFeatures(imageBuffer);
            
            if (features.tfFeatures && features.tfFeatures.length > 0) {
              this.productFeatures.set(product.id, features.tfFeatures);
              this.productHashes.set(product.id, features.perceptualHash);
              this.productColors.set(product.id, features.dominantColor);
              usedVisual = true;
              successCount++;
            }
          } catch (imageError: any) {
            console.warn(`Legacy image fetch failed for ${product.name}: ${imageError.message}`);
          }
        }
        
        if (!usedVisual) {
          const zeroFeatures = new Float32Array(1024).fill(0);
          const zeroColor = new Float32Array([0.5, 0.5, 0.5]); // Gray
          this.productFeatures.set(product.id, zeroFeatures);
          this.productHashes.set(product.id, '0000000000000000');
          this.productColors.set(product.id, zeroColor);
          fallbackCount++;
        }
      }
      
      console.log(`\nVisual: ${successCount}, Fallback: ${fallbackCount}, Total: ${this.productFeatures.size}`);
      
    } catch (error: any) {
      console.error('Precomputation failed:', error?.message);
    }
  }

  // Core matching algorithm combining multiple signals
  private async matchProductFeatures(
    queryFeatures: { tfFeatures: Float32Array | null; perceptualHash: string; dominantColor: Float32Array; },
    products: any[]
  ): Promise<ProductMatch[]> {
    const matches: ProductMatch[] = [];
    
    // Hash matching
    for (const product of products) {
      const productHash = this.productHashes.get(product.id);
      if (productHash) {
        const distance = this.hammingDistance(queryFeatures.perceptualHash, productHash);
        const similarity = 1 - (distance / 16); // 16 hex chars = 64 bits
        
        if (similarity > 0.5) { // Lowered to catch 69%
          const confidence = similarity * 0.85;
          matches.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku || '',
            confidence,
            description: product.description || null,
            imageUrl: product.imageUrl || null,
            matchType: 'hash'
          });
          console.log(`🎯 Hash: ${product.name} (${Math.round(similarity*100)}%, conf ${Math.round(confidence*100)}%)`);
        } else if (similarity > 0.4) {
          console.log(`Hash low: ${product.name} (${Math.round(similarity*100)}%)`);
        }
      }
    }
    
    // TF matching
    if (queryFeatures.tfFeatures && queryFeatures.tfFeatures.length === 1024) {
      for (const product of products) {
        const productFeatures = this.productFeatures.get(product.id);
        if (productFeatures && productFeatures.length === 1024) {
          let similarity = this.cosineSimilarity(queryFeatures.tfFeatures!, productFeatures); // ! since guarded
          
          if (productFeatures.every((f: number) => f === 0)) {
            similarity *= 0.01;
          }
          
          if (similarity > 0.15) { // Lowered further
            let confidence = similarity * 0.4; // Adjusted weight
            
            // Color boost
            let colorDist: number | undefined;
            const productColor = this.productColors.get(product.id);
            let colorBoost = 0;
            if (productColor && !productColor.every((c: number) => Math.abs(c - 0.5) < 0.01)) {
              colorDist = this.euclideanDistance(queryFeatures.dominantColor, productColor);
              if (colorDist < 0.3) {
                colorBoost = (1 - colorDist) * 0.15;
                confidence += colorBoost;
              }
            }
            
            // Combined with hash
            const hashMatch = this.productHashes.get(product.id);
            let hashSim = 0;
            if (hashMatch) {
              const hDist = this.hammingDistance(queryFeatures.perceptualHash, hashMatch);
              hashSim = 1 - (hDist / 16);
              if (hashSim > 0.5) {
                confidence = (hashSim * 0.75) + (similarity * 0.25);
              }
            }
            
            console.log(`🎨 TF: ${product.name} (sim ${Math.round(similarity*100)}%, final conf ${Math.round(confidence*100)}%)`);
            
            // Push/update with confidence
            let existing = matches.find(m => m.productId === product.id);
            if (existing) {
              existing.confidence = Math.max(existing.confidence, confidence);
            } else {
              matches.push({
                productId: product.id,
                productName: product.name,
                sku: product.sku || '',
                confidence,
                description: product.description || null,
                imageUrl: product.imageUrl || null,
                matchType: hashSim > 0.6 ? 'hash+tf' : 'tf'
              });
            }
          } else if (similarity > 0.1) {
            console.log(`TF very low: ${product.name} (${Math.round(similarity*100)}%)`);
          }
        }
      }
    } else {
      console.log('Skipping TF - query features invalid');
    }
    
    // If TF skipped, still log:
    console.log('TF skipped, relying on hash/color');
    
    // At end of matching, log top 3 final matches:
    const sortedMatches = matches
      .filter((item, index, self) => index === self.findIndex(m => m.productId === item.productId))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    console.log('🔍 Top 5 Final Matches (with reasons):');
    sortedMatches.forEach((m, idx) => {
      console.log(`  ${idx+1}. ${m.productName} (conf: ${Math.round(m.confidence*100)}%, type: ${m.matchType || 'unknown'})`);
    });

    // If no high-confidence matches, return top 3 with their scores (even if <50%)
    if (matches.length === 0) {
      console.log('No high-conf matches, adding top TF/hash candidates...');
      const candidates: ProductMatch[] = [];
      
      // Collect all with sim >0.2
      for (const product of products) {
        const productFeatures = this.productFeatures.get(product.id);
        if (productFeatures && productFeatures.length === 1024) {
          let similarity = this.cosineSimilarity(queryFeatures.tfFeatures!, productFeatures);
          
          if (similarity > 0.15) {
            // Push with low confidence
            candidates.push({
              productId: product.id,
              productName: product.name,
              sku: product.sku || '',
              confidence: similarity * 0.3, // Low but shows something
              description: product.description || null,
              imageUrl: product.imageUrl || null,
              matchType: 'tf'
            });
          }
        }
      }
      
      // Add top 3 candidates if any
      if (candidates.length > 0) {
        const topCandidates = candidates
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3);
        
        console.log('🔍 Top 3 Candidates (low confidence):');
        topCandidates.forEach((c, idx) => {
          console.log(`  ${idx+1}. ${c.productName} (conf: ${Math.round(c.confidence*100)}%)`);
        });
        
        return topCandidates;
      }
    }
    
    return sortedMatches.slice(0, 5); // Return top 5
  }

  private hammingDistance(str1: string, str2: string): number {
    let distance = 0;
    const maxLen = Math.max(str1.length, str2.length);
    
    for (let i = 0; i < maxLen; i++) {
      if (str1[i] !== str2[i]) {
        distance++;
      }
    }
    
    return distance;
  }

  // Service status
  public getStatus(): {
    initialized: boolean;
    productsIndexed: number;
    models: { tensorflow: boolean; ocr: boolean; };
  } {
    return {
      initialized: this.isInitialized,
      productsIndexed: this.productFeatures.size,
      models: { 
        tensorflow: !!this.tensorflowModel,
        ocr: !!this.ocrWorker
      }
    };
  }

  // Cleanup resources
  public async cleanup(): Promise<void> {
    try {
      if (this.ocrWorker) {
        await this.ocrWorker.terminate();
        this.ocrWorker = null;
        console.log('✅ OCR worker terminated');
      }
    } catch (error) {
      console.warn('Failed to cleanup OCR worker:', error);
    }
  }

  // Reload features after database changes
  public async reload(): Promise<void> {
    console.log('🔄 Reloading features...');
    this.productFeatures.clear();
    this.productHashes.clear();
    this.productColors.clear();
    await this.precomputeProductFeatures();
    console.log('✅ Reloaded');
  }

  // Index a single product image (called when new images are uploaded)
  public async indexProductImage(productId: string, imageUrl: string): Promise<void> {
    try {
      if (!this.isInitialized) {
        console.warn('Image recognition service not initialized, skipping indexing');
        return;
      }

      let imageBuffer: Buffer | null = null;

      // Try to fetch from database first
      if (imageUrl.startsWith('/api/images/')) {
        try {
          const baseUrl = process.env.BASE_URL || 'http://localhost:10000';
          const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${baseUrl}${imageUrl}`;
          const response = await axios.get(fullImageUrl, { 
            responseType: 'arraybuffer', 
            timeout: 10000 
          });
          imageBuffer = Buffer.from(response.data);
        } catch (error) {
          console.warn(`Failed to fetch database image for ${productId}:`, error.message);
        }
      } else {
        // Try legacy filesystem image
        try {
          const response = await axios.get(imageUrl, { 
            responseType: 'arraybuffer', 
            timeout: 10000 
          });
          imageBuffer = Buffer.from(response.data);
        } catch (error) {
          console.warn(`Failed to fetch legacy image for ${productId}:`, error.message);
        }
      }

      if (imageBuffer) {
        const features = await this.extractVisualFeatures(imageBuffer);
        
        if (features.tfFeatures && features.tfFeatures.length > 0) {
          this.productFeatures.set(productId, features.tfFeatures);
          this.productHashes.set(productId, features.perceptualHash);
          this.productColors.set(productId, features.dominantColor);
          console.log(`✅ Indexed image for product ${productId}`);
        } else {
          console.warn(`Failed to extract features for product ${productId}`);
        }
      } else {
        console.warn(`No image data available for product ${productId}`);
      }
    } catch (error) {
      console.warn(`Failed to index image for product ${productId}:`, error.message);
    }
  }

  // Process image from URL (WhatsApp handler calls this)
  public async processImageFromUrl(imageUrl: string): Promise<ImageProcessingResult> {
    const startTime = Date.now();
    
    try {
      await this.ensureInitialized();
      
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      
      const imageBuffer = Buffer.from(response.data);
      const queryFeatures = await this.extractVisualFeatures(imageBuffer);
      console.log(`Query: TF=${!!queryFeatures.tfFeatures} (${queryFeatures.tfFeatures?.length || 0}), Hash=${queryFeatures.perceptualHash}, Color=(${queryFeatures.dominantColor[0].toFixed(2)},${queryFeatures.dominantColor[1].toFixed(2)},${queryFeatures.dominantColor[2].toFixed(2)})`);
      
      const products = await storage.getProducts();
      const matches = await this.matchProductFeatures(queryFeatures, products);
      
      return {
        matches,
        processingTime: Date.now() - startTime,
        success: true,
        extractedText: queryFeatures.extractedText
      };
      
    } catch (error: any) {
      console.error('Processing failed:', error?.message);
      return {
        matches: [],
        processingTime: Date.now() - startTime,
        success: false,
        error: error?.message
      };
    }
  }

  // Process image buffer (for file uploads)
  public async processImageBuffer(imageBuffer: Buffer): Promise<ImageProcessingResult> {
    const startTime = Date.now();
    
    try {
      await this.ensureInitialized();
      
      const queryFeatures = await this.extractVisualFeatures(imageBuffer);
      const products = await storage.getProducts();
      const matches = await this.matchProductFeatures(queryFeatures, products);
      
      return {
        matches,
        processingTime: Date.now() - startTime,
        success: true,
        extractedText: queryFeatures.extractedText
      };
      
    } catch (error: any) {
      console.error('Processing buffer failed:', error?.message);
      return {
        matches: [],
        processingTime: Date.now() - startTime,
        success: false,
        error: error?.message
      };
    }
  }
}

// Export singleton instance
export const imageRecognitionService = new ImageRecognitionService();

console.log('🖼️  Image Recognition Service ready');
