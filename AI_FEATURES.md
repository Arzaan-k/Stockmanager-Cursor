# AI Features Documentation

## Overview

The Stock Manager application now includes comprehensive AI-powered features for enhanced product management, search, and recommendations.

## 🤖 AI Features Implemented

### 1. Visual Product Recognition
- **Deep Visual Features**: Uses TensorFlow MobileNet for advanced visual feature extraction
- **Perceptual Hashing**: Creates visual fingerprints for exact and near-exact image matching
- **Color Analysis**: Analyzes dominant colors for additional visual matching signals
- **Multi-layer Matching**: Combines hash matching, deep features, and color similarity
- **Database Image Storage**: All images stored in database for production compatibility
- **Optional OCR**: Text extraction available but disabled by default for performance

#### Endpoints:
- `POST /api/image-recognition/identify` - Upload image for product identification
- `POST /api/image-recognition/identify-url` - Process image from URL
- `GET /api/image-recognition/status` - Get service status

### 2. AI-Powered Search
- **Natural Language Search**: Intelligent search across product names, descriptions, SKUs, and types
- **Fuzzy Matching**: Finds products even with partial or similar terms
- **Relevance Scoring**: Ranks results by relevance with confidence scores
- **Multi-field Search**: Searches across all product attributes simultaneously

#### Endpoints:
- `POST /api/ai/search` - Perform AI-powered product search
- `GET /api/ai/status` - Get AI service status

### 3. Smart Recommendations
- **Low Stock Alerts**: Identifies products running low on inventory
- **Frequently Used Products**: Recommends based on usage patterns
- **Trending Products**: Shows products with recent high order activity
- **Similar Products**: Suggests related products based on type and characteristics
- **Personalized Recommendations**: User-specific recommendations (framework ready)

#### Endpoints:
- `GET /api/recommendations` - Get all recommendations
- `GET /api/recommendations?type=low-stock` - Get low stock recommendations
- `GET /api/recommendations?type=frequently-used` - Get frequently used products
- `GET /api/recommendations?type=trending` - Get trending products
- `GET /api/recommendations/similar/:productId` - Get similar products
- `GET /api/recommendations/personalized` - Get personalized recommendations

## 🔧 Technical Implementation

### Dependencies Added
```json
{
  "tesseract.js": "^5.0.4"
}
```

### Environment Variables
```bash
# Optional: Disable image precomputing for faster startup
DISABLE_IMAGE_PREFETCH=true

# Optional: Disable image indexing for faster uploads
DISABLE_IMAGE_INDEXING=true

# Optional: Enable OCR text extraction (disabled by default for performance)
ENABLE_OCR=true

# Base URL for image serving
BASE_URL=https://your-domain.com
```

### Database Schema
- **product_images**: Stores images as base64 in database
- **stock_movements**: Tracks product usage for recommendations
- **orders & order_items**: Tracks order patterns for trending analysis

## 🚀 Usage Examples

### 1. Image Recognition
```javascript
// Upload image for product identification
const formData = new FormData();
formData.append('image', imageFile);

const response = await fetch('/api/image-recognition/identify', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Matches:', result.matches);
console.log('Extracted Text:', result.extractedText);
```

### 2. AI Search
```javascript
// Search for products using natural language
const response = await fetch('/api/ai/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'carrier compressor motor',
    limit: 10
  })
});

const result = await response.json();
console.log('Search Results:', result.results);
```

### 3. Get Recommendations
```javascript
// Get low stock recommendations
const response = await fetch('/api/recommendations?type=low-stock&limit=10');
const result = await response.json();
console.log('Low Stock Items:', result.recommendations);

// Get similar products
const response = await fetch('/api/recommendations/similar/product-id-123');
const result = await response.json();
console.log('Similar Products:', result.recommendations);
```

## 📊 Performance Features

### Visual Recognition Pipeline
- **Image Preprocessing**: Automatic format conversion and resizing to 224x224
- **Feature Extraction**: TensorFlow MobileNet generates 1024-dimensional feature vectors
- **Perceptual Hashing**: Creates 64-bit visual fingerprints for exact matching
- **Color Profiling**: Extracts dominant color signatures for additional matching
- **Multi-Stage Matching**: 
  1. Perceptual hash matching (>60% similarity for high confidence)
  2. Deep feature cosine similarity (>30% threshold)
  3. Color similarity boosting for final confidence
- **Format Support**: JPEG, PNG, WebP (OCR supports fewer formats)

### OCR Processing
- **Tesseract.js**: Fast, accurate text extraction
- **Text Cleaning**: Automatic cleanup of extracted text
- **Progress Tracking**: Real-time OCR progress updates

### Recommendation Engine
- **Real-time Analysis**: Based on current data
- **Confidence Scoring**: 0-1 confidence scores for all recommendations
- **Categorization**: Different recommendation types with metadata
- **Deduplication**: Prevents duplicate recommendations

## 🔍 Monitoring & Status

### Service Status
```javascript
// Check AI service status
const response = await fetch('/api/ai/status');
const status = await response.json();
console.log('TensorFlow:', status.status.models.tensorflow);
console.log('OCR:', status.status.models.ocr);
console.log('Products Indexed:', status.status.productsIndexed);
```

### Health Checks
- Service initialization status
- Model loading status
- Database connectivity
- Image processing capabilities

## 🛠️ Configuration

### Disable Features (for performance)
```bash
# Disable image precomputing (faster startup)
DISABLE_IMAGE_PREFETCH=true

# Disable image indexing (faster uploads)
DISABLE_IMAGE_INDEXING=true
```

### Customization
- **Search Weights**: Adjust relevance scoring in `performAISearch()`
- **Recommendation Thresholds**: Modify confidence thresholds in recommendation service
- **OCR Languages**: Add more languages to Tesseract configuration
- **Image Processing**: Adjust Sharp settings for different quality/speed tradeoffs

## 🔮 Future Enhancements

### Planned Features
1. **Machine Learning Models**: Custom trained models for specific product types
2. **Predictive Analytics**: Forecast demand and stock requirements
3. **Advanced OCR**: Multi-language support and better text recognition
4. **Visual Search**: Find products by uploading similar images
5. **Voice Search**: Speech-to-text integration for hands-free searching
6. **Smart Notifications**: AI-powered alerts for important events

### Integration Opportunities
1. **WhatsApp Integration**: Process images sent via WhatsApp
2. **Mobile App**: Camera integration for instant product identification
3. **Barcode Scanning**: Combine with barcode recognition
4. **Supplier Integration**: Automatic product matching with supplier catalogs

## 📈 Benefits

### For Users
- **Faster Product Search**: Find products quickly with natural language
- **Smart Recommendations**: Discover products they might need
- **Image-Based Search**: Identify products by taking photos
- **Proactive Alerts**: Get notified about low stock before it's critical

### For Business
- **Improved Efficiency**: Reduce time spent searching for products
- **Better Inventory Management**: AI-powered insights for stock decisions
- **Enhanced User Experience**: Modern, intelligent interface
- **Data-Driven Insights**: Understand product usage patterns

## 🚨 Troubleshooting

### Common Issues
1. **OCR Not Working**: Check if Tesseract.js is properly installed
2. **Slow Image Processing**: Consider disabling image indexing
3. **Memory Issues**: Monitor OCR worker memory usage
4. **Database Performance**: Ensure proper indexing on product tables

### Debug Mode
```javascript
// Enable detailed logging
process.env.DEBUG_AI = 'true';
```

This comprehensive AI feature set transforms the Stock Manager into an intelligent, modern inventory management system with cutting-edge capabilities for product recognition, search, and recommendations.
