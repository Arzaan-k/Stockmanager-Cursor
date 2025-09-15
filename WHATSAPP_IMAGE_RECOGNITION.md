# WhatsApp Image Recognition Feature

## Overview

This feature enables your StockSmartHub system to identify products from images sent via WhatsApp, making inventory management more intuitive and efficient. Users can simply take a photo of a product and send it through WhatsApp, and the system will automatically identify the product and guide them through inventory operations.

## ✨ Features

- 🔍 **AI-Powered Image Recognition**: Uses CLIP (Contrastive Language-Image Pre-training) model for accurate product identification
- 📱 **WhatsApp Integration**: Seamlessly processes images sent through WhatsApp Business API
- 🎯 **Smart Matching**: Combines visual recognition with OCR text extraction for better accuracy
- 📊 **Multiple Match Handling**: Presents users with confidence-ranked options when multiple products match
- 🔄 **Automatic Workflow Integration**: Identified products automatically connect to existing inventory workflows
- 💾 **Image Management**: Stores and indexes product images for better future recognition

## 🚀 How It Works

### 1. User Workflow
1. User takes a photo of a product
2. Sends the image via WhatsApp to your business number
3. System processes the image and identifies potential matches
4. User selects the correct product from presented options
5. System proceeds with standard inventory operations (add stock, create order, etc.)

### 2. Technical Workflow
```
WhatsApp Image → Download → Image Processing → Product Matching → User Confirmation → Inventory Action
```

## 📋 Prerequisites

### Required Dependencies
- `@xenova/transformers` - CLIP model implementation
- `sharp` - Image processing
- `multer` - File upload handling
- `axios` - HTTP requests

### Environment Variables
```bash
# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_TOKEN=your_webhook_verification_token
META_GRAPH_API_VERSION=v20.0

# Base URL for serving images
BASE_URL=http://localhost:3000
```

## 🛠️ Installation

1. **Install Dependencies**
   ```bash
   npm install @xenova/transformers sharp multer axios @types/multer
   ```

2. **Initialize Services**
   The system automatically initializes the image recognition service when starting:
   ```bash
   npm run dev
   ```

3. **Upload Product Images**
   Use the API endpoints to upload images for your existing products to improve recognition accuracy.

## 📡 API Endpoints

### Image Recognition
- `POST /api/image-recognition/identify` - Process uploaded image
- `POST /api/image-recognition/identify-url` - Process image from URL
- `GET /api/image-recognition/status` - Get service status
- `POST /api/image-recognition/sync` - Sync product images with recognition service
- `POST /api/image-recognition/reload` - Reload recognition models

### Product Image Management
- `POST /api/products/:id/images` - Upload image for specific product
- `POST /api/products/:id/images/from-url` - Add image from URL
- `GET /api/products/:id/images` - Get product images
- `DELETE /api/products/:id/images` - Delete product image
- `POST /api/products/bulk-images` - Bulk upload images

## 💬 WhatsApp Integration

### Message Flow Examples

#### High Confidence Single Match
```
User: [Sends image]
System: ✅ Product Identified:

📦 AC Cable Wiring Harness
SKU: AC-001
Current Stock: 45 units
Total Stock: 100 units

What would you like to do?
• Type "add [quantity]" to add stock
• Type "order [quantity]" to create an order
• Type "check" for detailed stock info

Example: "add 25 units" or "order 10 units"
```

#### Multiple Matches
```
User: [Sends image]
System: 🎯 I found these possible matches for your image:

1. AC Cable Wiring Harness
   SKU: AC-001
   Confidence: 87%

2. Power Connector Cable
   SKU: PC-002
   Confidence: 73%

3. Automotive Wire Harness
   SKU: AWH-003
   Confidence: 65%

Please reply with the number (1-3) of the correct product, or type 'none' if none match.
```

#### No Match Found
```
User: [Sends image]
System: ❓ I couldn't identify any products from your image.

I detected this text: "CARRIER AIR CONDITIONER"

Please try:
• Sending a clearer image
• Describing the product in text
• Including product labels or SKU in the image

How can I help you with inventory management?
```

## 🔧 Configuration

### Recognition Service Settings
```typescript
// In image-recognition.ts
const recognitionConfig = {
  maxWidth: 800,        // Max image width for processing
  maxHeight: 600,       // Max image height for processing
  quality: 85,          // Image quality (1-100)
  confidenceThreshold: 0.8,  // Auto-select threshold
  maxMatches: 5         // Maximum matches to return
};
```

### Model Configuration
```typescript
// CLIP Model for image-text similarity
const clipModel = 'Xenova/clip-vit-base-patch32';

// OCR Model for text extraction
const ocrModel = 'Xenova/trocr-base-printed';
```

## 📊 Database Schema

### Products Table Extensions
The existing products table supports image storage:
```sql
-- Main product image
imageUrl TEXT,

-- Additional product photos (JSON array)
photos JSONB
```

### WhatsApp Logs Extensions
```sql
-- Image processing logs
imageUrl TEXT,
confidence DECIMAL(5,4),
meta JSONB  -- Stores processing details
```

## 🧪 Testing

Run the test script to verify functionality:
```bash
node test-image-recognition.js
```

This will:
- Initialize the recognition service
- Test image processing with your sample URL
- Show product matching results
- Demonstrate WhatsApp workflow simulation

## 📈 Performance Optimization

### Image Processing
- Images are automatically resized to optimal dimensions (800x600)
- JPEG compression reduces file sizes
- Processing is done asynchronously to avoid blocking

### Recognition Accuracy
- **Visual Matching**: Uses CLIP model for semantic image understanding
- **Text Extraction**: OCR extracts text from product labels/SKUs
- **Hybrid Scoring**: Combines visual and text matching for better results
- **Product Indexing**: Pre-computes features for faster matching

### Caching Strategy
- Product features are cached in memory for faster lookups
- Images are stored locally and served via static middleware
- Recognition models are loaded once at startup

## 🐛 Troubleshooting

### Common Issues

1. **Models Not Loading**
   ```bash
   # Check if transformers can access models
   npm list @xenova/transformers
   
   # Restart service to reinitialize
   npm run dev
   ```

2. **WhatsApp Images Not Processing**
   - Verify WhatsApp API credentials
   - Check webhook URL is accessible
   - Ensure proper permissions for media access

3. **Poor Recognition Accuracy**
   - Upload more product images to improve training data
   - Ensure images are clear and well-lit
   - Check product names and descriptions are descriptive

4. **Image Upload Failures**
   - Verify uploads directory exists and is writable
   - Check file size limits (default: 10MB)
   - Ensure Sharp can process the image format

### Debug Mode
Enable detailed logging:
```javascript
// In image-recognition.ts
console.log('Processing image:', {
  modelLoaded: this.isInitialized,
  imageSize: imageBuffer.length,
  productCount: products.length
});
```

## 🔒 Security Considerations

- **File Validation**: Only image files are accepted
- **Size Limits**: 10MB upload limit to prevent abuse
- **Path Sanitization**: Filenames are sanitized to prevent directory traversal
- **Access Control**: Images are served via controlled static routes

## 🚀 Production Deployment

### Requirements
- Node.js 18+ with ES modules support
- Sufficient RAM for model loading (recommended: 2GB+)
- Fast storage for image processing
- Reliable internet for WhatsApp API

### Performance Monitoring
```javascript
// Monitor processing times
const avgProcessingTime = statistics.getAverageProcessingTime();
const recognitionAccuracy = statistics.getAccuracyRate();
```

### Scaling Considerations
- Consider using Redis for conversation state in multi-instance deployments
- Implement image CDN for better performance
- Use worker processes for heavy image processing

## 📚 Advanced Usage

### Custom Recognition Models
```typescript
// Replace default models with custom trained ones
const customConfig = {
  clipModel: 'your-organization/custom-clip-model',
  ocrModel: 'your-organization/custom-ocr-model'
};
```

### Batch Processing
```typescript
// Process multiple images at once
const results = await imageRecognitionService.batchProcess([
  imageBuffer1, imageBuffer2, imageBuffer3
]);
```

### Integration with External Services
```typescript
// Add custom matching logic
class CustomMatcher extends ImageRecognitionService {
  async customProductMatching(imageFeatures, productDatabase) {
    // Your custom matching algorithm
  }
}
```

## 📖 API Reference

### ImageRecognitionService Methods

#### `processImageFromUrl(imageUrl: string)`
- **Purpose**: Process image from URL for product identification
- **Returns**: `ImageProcessingResult`
- **Example**: 
  ```typescript
  const result = await imageRecognitionService.processImageFromUrl(url);
  ```

#### `processImageBuffer(imageBuffer: Buffer)`
- **Purpose**: Process image from buffer
- **Returns**: `ImageProcessingResult`
- **Example**: 
  ```typescript
  const result = await imageRecognitionService.processImageBuffer(buffer);
  ```

#### `getStatus()`
- **Purpose**: Get service initialization status
- **Returns**: `{ initialized: boolean; productsIndexed: number }`

### ProductImageManager Methods

#### `saveProductImage(productId: string, imageBuffer: Buffer)`
- **Purpose**: Save and index product image
- **Returns**: `{ success: boolean; imageUrl?: string; error?: string }`

#### `getProductImages(productId: string)`
- **Purpose**: Get all images for a product
- **Returns**: `{ mainImage?: string; additionalImages: string[]; totalImages: number }`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

This feature is part of StockSmartHub and follows the same licensing terms.
