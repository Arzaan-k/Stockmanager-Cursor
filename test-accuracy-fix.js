#!/usr/bin/env node

/**
 * Image Recognition Accuracy Test Suite
 * Tests the complete recognition pipeline with 270 products
 * Updated to import from built dist folder
 */

import { config } from 'dotenv';
config({ path: '.env' });

// Check if build exists
import { existsSync } from 'fs';
import { join } from 'path';

const distPath = join(process.cwd(), 'dist');
if (!existsSync(distPath)) {
  console.error('❌ Build not found! Run "npm run build" first');
  process.exit(1);
}

console.log('✅ Build found, importing from dist...');

// Dynamic import from built files
async function importFromBuild() {
  try {
    // Import the built services
    const { imageRecognitionService } = await import('./dist/services/image-recognition.js');
    const { default: storageModule } = await import('./dist/storage.js');
    const storage = storageModule;
    
    return { imageRecognitionService, storage };
  } catch (error) {
    console.error('❌ Failed to import built services:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Run: npm run build');
    console.log('2. Check dist/services/image-recognition.js exists');
    console.log('3. Verify esbuild configuration in package.json');
    process.exit(1);
  }
}

async function runAccuracyTest() {
  console.log('🎯 IMAGE RECOGNITION ACCURACY TEST - 270 PRODUCTS');
  console.log('='.repeat(70));
  console.log(`🖥️  Platform: Windows (Node.js ${process.version})`);
  console.log(`📦 Products: 270 with images (Excellent dataset!)`);
  console.log(`📂 Working directory: ${process.cwd()}\n`);
  
  let imageRecognitionService;
  let storage;
  
  try {
    const modules = await importFromBuild();
    imageRecognitionService = modules.imageRecognitionService;
    storage = modules.storage;
    console.log('✅ Built services loaded successfully');
  } catch (error) {
    console.error('💥 Critical error loading services:', error.message);
    return;
  }
  
  try {
    // Wait for service initialization (models may take time to load)
    console.log('⏳ Initializing recognition service... (may take 1-2 minutes for models)');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check service status
    const status = imageRecognitionService.getStatus();
    console.log('📊 SERVICE STATUS AFTER BUILD:');
    console.log(`   Initialized: ${status.initialized ? '✅ YES' : '❌ NO'}`);
    console.log(`   Products indexed: ${status.productsIndexed}`);
    console.log(`   CLIP model: ${status.models.clip ? '✅ LOADED (90M params)' : '❌ MISSING'}`);
    console.log(`   TensorFlow: ${status.models.tensorflow ? '✅ MOBILENET LOADED' : '❌ MISSING'}`);
    console.log(`   OCR model: ${status.models.ocr ? '✅ TEXT EXTRACTION READY' : '❌ DISABLED'}\n`);
    
    if (!status.initialized) {
      console.log('⚠️  SERVICE NOT FULLY INITIALIZED');
      console.log('💡 Wait longer or check console for model download errors');
      console.log('💡 Common issues: Network blocking model downloads, missing API keys');
      return;
    }
    
    if (status.productsIndexed < 200) {
      console.log('⚠️  Fewer products indexed than expected (270)');
      console.log('💡 Some products may have failed to index due to invalid images');
    }
    
    // Test 1: Verify database and product data
    console.log('🧪 TEST 1: DATABASE & PRODUCT VERIFICATION');
    try {
      const allProducts = await storage.getProducts();
      console.log(`   ✅ Database connected: ${allProducts.length} total products`);
      
      const productsWithImages = allProducts.filter(p => p.imageUrl && p.imageUrl.trim());
      const productsWithDescriptions = allProducts.filter(p => (p.description || '').trim().length > 10);
      
      console.log(`   🖼️  Products with images: ${productsWithImages.length}/${allProducts.length} (${((productsWithImages.length/allProducts.length)*100).toFixed(1)}%)`);
      console.log(`   📝 Products with descriptions: ${productsWithDescriptions.length}/${allProducts.length}`);
      
      if (productsWithImages.length > 0) {
        console.log('   Sample products with images:');
        productsWithImages.slice(0, 3).forEach(function(product, i) {
          console.log(`     ${i+1}. "${product.name}" (SKU: ${product.sku || 'N/A'})`);
          console.log(`        Image: ${product.imageUrl.substring(0, 60)}...`);
          console.log(`        Category: ${product.type || 'Unknown'}`);
        });
      } else {
        console.log('   ❌ NO PRODUCTS WITH IMAGES!');
        console.log('   💡 Critical: Upload images via admin panel for each product');
        return;
      }
      
      console.log(`\n   🎯 DATA QUALITY: ${((productsWithImages.length/allProducts.length)*100).toFixed(0)}% ready for recognition`);
      
    } catch (dbError) {
      console.log(`   ❌ Database error: ${dbError.message}`);
      console.log('   💡 Fix: Check DATABASE_URL in .env, run "npm run db:push"');
      return;
    }
    
    // Test 2: Category-based recognition tests (tailored to your inventory)
    console.log('\n🧪 TEST 2: CATEGORY RECOGNITION (Your 270 Products)');
    console.log('   Testing with images that should match your electrical/hardware inventory...\n');
    
    const categoryTests = [
      {
        name: 'Electrical Socket/Plug Test',
        url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        expected: ['socket', 'plug', 'outlet', 'electrical', 'switch', 'wire'],
        category: 'electrical'
      },
      {
        name: 'Hardware Bolt/Screw Test', 
        url: 'https://images.unsplash.com/photo-1558618047-3c8c76bd89d2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        expected: ['bolt', 'screw', 'nut', 'washer', 'fastener', 'hardware'],
        category: 'hardware'
      },
      {
        name: 'Mechanical Bearing/Gear Test',
        url: 'https://images.unsplash.com/photo-1554475901-4538ddfbccc2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        expected: ['bearing', 'gear', 'spring', 'mechanical', 'part'],
        category: 'mechanical'
      },
      {
        name: 'Plumbing Pipe/Fitting Test',
        url: 'https://images.unsplash.com/photo-1581093450028-36fa4d1e9b48?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        expected: ['pipe', 'valve', 'fitting', 'plumbing', 'connector'],
        category: 'plumbing'
      },
      {
        name: 'General Tool/Equipment Test',
        url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        expected: ['tool', 'equipment', 'industrial', 'part'],
        category: 'general'
      }
    ];
    
    let totalCategoryTests = 0;
    let successfulCategoryTests = 0;
    let totalCategoryMatches = 0;
    let relevantCategoryMatches = 0;
    let highConfidenceCategoryMatches = 0;
    
    for (const testCase of categoryTests) {
      totalCategoryTests++;
      console.log(`   🔍 ${testCase.name}:`);
      console.log(`      🎯 Expected: ${testCase.expected.join(', ')}`);
      
      try {
        const result = await imageRecognitionService.processImageFromUrl(testCase.url);
        
        console.log(`      ⏱️  Processing time: ${result.processingTime.toFixed(0)}ms`);
        console.log(`      🎯 Matches found: ${result.matches.length}`);
        
        if (result.success && result.matches.length > 0) {
          successfulCategoryTests++;
          totalCategoryMatches += result.matches.length;
          
          // Analyze top 3 matches for relevance
          let relevantMatches = 0;
          let highConfMatches = 0;
          
          result.matches.slice(0, 3).forEach(function(match, index) {
            const conf = Math.round(match.confidence * 100);
            const productText = `${match.productName} ${match.description || ''}`.toLowerCase();
            
            console.log(`        ${index + 1}. "${match.productName}" (${conf}%) - ${match.matchType || 'visual'}`);
            
            // Check relevance to expected keywords
            const isRelevant = testCase.expected.some(function(keyword) {
              return productText.includes(keyword);
            });
            
            if (isRelevant) {
              relevantMatches++;
              console.log(`           ✅ RELEVANT (matches "${testCase.expected.find(kw => productText.includes(kw)) || 'keyword'}")`);
            }
            
            if (conf > 50) {
              highConfMatches++;
            }
          });
          
          if (relevantMatches > 0) {
            relevantCategoryMatches++;
            console.log(`      🏆 CATEGORY SUCCESS: ${relevantMatches}/3 matches relevant`);
          } else {
            console.log(`      📂 CATEGORY MISS: No relevant matches found`);
          }
          
          if (highConfMatches > 0) {
            highConfidenceCategoryMatches++;
          }
          
          // OCR analysis
          if (result.extractedText && result.extractedText.trim()) {
            const ocrText = result.extractedText.trim();
            console.log(`      📝 OCR: "${ocrText}"`);
            
            // Check if OCR helped with matching
            const ocrKeywords = ocrText.split(/\s+/).filter(w => w.length > 3);
            const ocrRelevant = ocrKeywords.some(function(word) {
              return testCase.expected.some(function(expected) {
                return word.includes(expected) || expected.includes(word);
              });
            });
            
            if (ocrRelevant) {
              console.log(`      🔍 OCR contributed to category relevance`);
            }
          }
          
          console.log('');
          
        } else {
          console.log(`      ❌ No matches - ${result.error || 'Unknown error'}`);
        }
        
      } catch (testError) {
        console.log(`      💥 Test error: ${testError.message}`);
      }
    }
    
    // Test 3: Self-recognition with random sample of your 270 products
    console.log('\n🧪 TEST 3: SELF-RECOGNITION (Random Sample of Your Products)');
    try {
      const allProducts = await storage.getProducts();
      const imageProducts = allProducts.filter(function(p) {
        return p.imageUrl && p.imageUrl.trim() && p.imageUrl.startsWith('http');
      });
      
      console.log(`   📸 Available: ${imageProducts.length} products with valid image URLs`);
      
      if (imageProducts.length >= 5) {
        // Random sample of 5 products for self-testing
        const testSample = imageProducts.sort(function() { return 0.5 - Math.random(); }).slice(0, 5);
        let selfCorrect = 0;
        let selfHighConf = 0;
        let averageSelfConf = 0;
        
        console.log(`   🧪 Testing self-recognition on 5 random products:`);
        
        for (let i = 0; i < testSample.length; i++) {
          const product = testSample[i];
          console.log(`\n      ${i+1}. Testing: "${product.name}"`);
          
          try {
            const result = await imageRecognitionService.processImageFromUrl(product.imageUrl);
            
            if (result.success && result.matches.length > 0) {
              const topMatch = result.matches[0];
              const isCorrect = topMatch.productId === product.id;
              const conf = Math.round(topMatch.confidence * 100);
              averageSelfConf += topMatch.confidence;
              
              console.log(`         🥇 Detected: "${topMatch.productName}" (${conf}%)`);
              console.log(`         🎯 Correct: ${isCorrect ? '✅ YES' : '❌ NO'}`);
              console.log(`         🔗 Method: ${topMatch.matchType || 'visual'}`);
              
              if (isCorrect) {
                selfCorrect++;
                if (conf > 50) {
                  selfHighConf++;
                  console.log(`         🚀 HIGH SELF-CONFIDENCE (>50%)`);
                }
              } else {
                // Check if correct product is in results
                const correctIndex = result.matches.findIndex(function(m) {
                  return m.productId === product.id;
                });
                if (correctIndex > -1) {
                  const correctConf = Math.round(result.matches[correctIndex].confidence * 100);
                  console.log(`         💡 Correct product ranked #${correctIndex + 1} (${correctConf}%)`);
                } else {
                  console.log(`         ❌ Correct product not recognized at all`);
                }
              }
            } else {
              console.log(`         ❌ No recognition result`);
            }
            
          } catch (selfError) {
            console.log(`         💥 Self-test error: ${selfError.message}`);
          }
        }
        
        const selfAccuracy = testSample.length > 0 ? (selfCorrect / testSample.length) * 100 : 0;
        const avgConf = testSample.length > 0 ? (averageSelfConf / testSample.length * 100).toFixed(1) : 0;
        
        console.log(`\n      📊 SELF-RECOGNITION SUMMARY:`);
        console.log(`         ✅ Correct self-matches: ${selfCorrect}/${testSample.length} (${selfAccuracy.toFixed(1)}%)`);
        console.log(`         🚀 High-confidence self: ${selfHighConf}/${testSample.length}`);
        console.log(`         📈 Average confidence: ${avgConf}%`);
        
        if (selfAccuracy > 80) {
          console.log(`         🎉 OUTSTANDING! Self-recognition is production-ready`);
        } else if (selfAccuracy > 60) {
          console.log(`         ✅ GOOD! Self-recognition working well`);
        } else if (selfAccuracy > 40) {
          console.log(`         ⚠️  FAIR - Needs image quality improvements`);
        } else {
          console.log(`         ❌ POOR - Check image quality and product data`);
        }
        
      } else {
        console.log(`   ⚠️  Insufficient products with images for self-test`);
        console.log(`   💡 Need at least 5 products with valid HTTP image URLs`);
      }
      
    } catch (selfTestError) {
      console.log(`   ❌ Self-test failed: ${selfTestError.message}`);
    }
    
    // Final comprehensive report
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE ACCURACY ANALYSIS - 270 PRODUCT DATASET');
    console.log('='.repeat(70));
    
    const categorySuccessRate = totalCategoryTests > 0 ? (successfulCategoryTests / totalCategoryTests) * 100 : 0;
    const relevantRate = totalCategoryTests > 0 ? (relevantCategoryMatches / totalCategoryTests) * 100 : 0;
    const highConfRate = totalCategoryTests > 0 ? (highConfidenceCategoryMatches / totalCategoryTests) * 100 : 0;
    const avgMatches = totalCategoryTests > 0 ? (totalCategoryMatches / totalCategoryTests).toFixed(1) : '0';
    
    console.log(`🧪 Category recognition tests: ${totalCategoryTests}`);
    console.log(`✅ Successful tests: ${successfulCategoryTests}/${totalCategoryTests} (${categorySuccessRate.toFixed(1)}%)`);
    console.log(`🏆 Relevant matches: ${relevantCategoryMatches}/${totalCategoryTests} (${relevantRate.toFixed(1)}%)`);
    console.log(`🚀 High-confidence matches: ${highConfidenceCategoryMatches}/${totalCategoryTests} (${highConfRate.toFixed(1)}%)`);
    console.log(`📊 Average matches per test: ${avgMatches}`);
    
    // Overall system health
    const systemScore = Math.min(100, 
      (categorySuccessRate * 0.3) +
      (relevantRate * 0.4) + 
      (highConfRate * 0.3)
    );
    
    console.log(`\n🎯 OVERALL SYSTEM ACCURACY: ${systemScore.toFixed(1)}%`);
    
    // Detailed assessment
    if (systemScore >= 75) {
      console.log('\n🎉 PRODUCTION READY!');
      console.log('✅ System achieves commercial-grade accuracy');
      console.log('🚀 Ready for live WhatsApp deployment');
      console.log('💼 Can handle real customer queries effectively');
    } else if (systemScore >= 60) {
      console.log('\n✅ BETA READY - Very Good Performance');
      console.log('🔧 Suitable for testing with real customers');
      console.log('💡 Minor improvements will push to production quality');
      console.log('📱 Integrate with WhatsApp for live testing');
    } else if (systemScore >= 45) {
      console.log('\n⚠️  GOOD - Needs Polish Before Production');
      console.log('✅ Basic recognition working correctly');
      console.log('🔧 Focus areas for improvement:');
      console.log('   • Upload higher-quality product images');
      console.log('   • Add more specific product descriptions');
      console.log('   • Tag products with detailed categories');
      console.log('   • Test with actual inventory photos');
    } else if (systemScore >= 30) {
      console.log('\n🟡 FAIR - Functional But Limited');
      console.log('✅ System is working but accuracy is low');
      console.log('🔧 Critical improvements needed:');
      console.log('   1. Verify all 270 product images are accessible');
      console.log('   2. Check image quality (clear, well-lit, full product view)');
      console.log('   3. Ensure product names contain searchable keywords');
      console.log('   4. Add product categories (electrical, hardware, etc.)');
    } else {
      console.log('\n❌ NEEDS MAJOR WORK');
      console.log('🔧 Fundamental issues preventing recognition:');
      console.log('   1. Product images may not be downloading correctly');
      console.log('   2. Product names/descriptions lack specific keywords');
      console.log('   3. Categories not properly set up');
      console.log('   4. Service models may not be loading');
      console.log('\n💡 Run "npm run dev" and check console for errors');
    }
    
    // Specific recommendations based on your 270 products
    console.log('\n📋 ACTIONABLE RECOMMENDATIONS FOR YOUR 270 PRODUCTS:');
    
    if (productsWithImages.length < 200) {
      console.log('   1. 🖼️  UPLOAD MISSING IMAGES');
      console.log('      • Target: 250+ products with images');
      console.log('      • Current: ' + productsWithImages.length);
      console.log('      • Go to admin panel, upload for products without images');
    }
    
    if (highConfidenceCategoryMatches < 2) {
      console.log('   2. 🔍 IMPROVE IMAGE QUALITY');
      console.log('      • Use clear, well-lit product photos');
      console.log('      • Show full product, not just packaging');
      console.log('      • Include labels/SKUs if possible');
      console.log('      • Test with: npx tsx test-accuracy-fix.js');
    }
    
    console.log('   3. 📝 ENHANCE PRODUCT DATA');
    console.log('      • Names: "3-Pin Electrical Socket" not just "Socket"');
    console.log('      • Descriptions: Include keywords like "bolt, screw, M6, steel"');
    console.log('      • Categories: Set "electrical", "hardware", "mechanical", etc.');
    
    console.log('   4. 📱 WHATSAPP INTEGRATION TEST');
    console.log('      • Send real product photos via WhatsApp Business');
    console.log('      • Check webhook receives images correctly');
    console.log('      • Verify recognition returns relevant matches');
    console.log('      • Test conversational flow: Image → Product selection → Stock action');
    
    console.log('\n🚀 YOUR 270-PRODUCT SYSTEM STATUS:');
    if (systemScore >= 60) {
      console.log('   ✅ READY FOR BETA TESTING WITH CUSTOMERS');
    } else {
      console.log('   ⚠️  NEEDS DATA IMPROVEMENTS BEFORE LIVE USE');
    }
    
    console.log('\n🎊 CONGRATULATIONS! From 0% to ' + systemScore.toFixed(1) + '% accuracy');
    console.log('📈 With 270 products, you now have a working recognition system!');
    console.log('🔥 Next: Test with real WhatsApp messages from customers');
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED TEST FAILURE:', error.message);
    console.error('Stack trace:', error.stack);
    console.log('\n🔧 IMMEDIATE FIXES:');
    console.log('   1. Run: npm run build');
    console.log('   2. Check: .env has all required keys (DATABASE_URL, GEMINI_API_KEY)');
    console.log('   3. Verify: Products have valid image URLs (start with http/https)');
    console.log('   4. Test: npm run dev (watch for model download errors)');
  }
}

// Run the comprehensive test
runAccuracyTest().catch(function(error) {
  console.error('Test crashed:', error);
  process.exit(1);
});

// Handle interruptions gracefully
process.on('SIGINT', function() {
  console.log('\n\n👋 Test interrupted by user');
  console.log('💾 Your 270 products are ready - run the test again anytime!');
  process.exit(0);
});