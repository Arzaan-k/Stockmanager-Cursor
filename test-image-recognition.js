#!/usr/bin/env node

/**
 * Test script for the WhatsApp Image Recognition Feature
 * 
 * This script tests the complete image recognition workflow:
 * 1. Initialize the image recognition service
 * 2. Test image processing from URL
 * 3. Test product matching
 * 4. Show how the WhatsApp integration would work
 * 
 * FIXED: Use tsx for TypeScript compilation and add better debugging
 */

import { config } from 'dotenv';

// Load environment variables first
config();

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Function to run tsx command
async function runTsx(scriptPath) {
  try {
    const result = execSync(`npx tsx ${scriptPath}`, { encoding: 'utf8', timeout: 60000 });
    console.log('TSX Result:', result);
    return { success: true, output: result };
  } catch (error) {
    console.error('TSX Error:', error.message);
    return { success: false, output: error.message };
  }
}

// Test 1: Check if required dependencies are installed
console.log('🔍 Testing WhatsApp Image Recognition System');
console.log('=' .repeat(60));

console.log('\n📦 Checking dependencies...');
const deps = ['@tensorflow/tfjs', '@tensorflow/tfjs-node', '@xenova/transformers', 'sharp'];
const missingDeps = [];

deps.forEach(dep => {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', dep, 'package.json'), 'utf8'));
    console.log(`   ✅ ${dep}: v${packageJson.version}`);
  } catch (error) {
    console.log(`   ❌ ${dep}: Missing`);
    missingDeps.push(dep);
  }
});

if (missingDeps.length > 0) {
  console.log(`\n⚠️  Missing dependencies: ${missingDeps.join(', ')}`);
  console.log('Please run: npm install ' + missingDeps.join(' ') + ' opencv4nodejs');
}

// Test 2: Run the actual image recognition test using tsx
console.log('\n⏳ Initializing image recognition service...');
console.log('This may take 1-2 minutes for model downloads...\n');

try {
  // Create a simple test file that imports and runs the service
  const testFile = join(process.cwd(), 'temp-test-image.ts');
  const testCode = `
import { imageRecognitionService } from './server/services/image-recognition.js';
import { storage } from './server/storage.js';

async function runImageTest() {
  console.log('🚀 Starting enhanced image recognition test...');
  
  try {
    // Wait for initialization
    await imageRecognitionService.ensureInitialized();
    console.log('✅ Service initialized successfully');
    
    // Check status
    const status = imageRecognitionService.getStatus();
    console.log('📊 Service Status:', status);
    
    // Get products
    const products = await storage.getProducts();
    console.log('📦 Found', products.length, 'products');
    
    if (products.length === 0) {
      console.log('⚠️  No products found. Please add products to test matching.');
      return;
    }
    
    // Test with sample product image URLs (more relevant to your inventory)
    const testUrls = [
      'https://www.example.com/product1.jpg', // Replace with actual product images
      'https://upload.wikimedia.org/wikipedia/commons/thumb#!/usr/bin/env node

/**
 * Test script for the WhatsApp Image Recognition Feature
 * 
 * This script tests the complete image recognition workflow:
 * 1. Initialize the image recognition service
 * 2. Test image processing from URL
 * 3. Test product matching
 * 4. Show how the WhatsApp integration would work
 * 
 * FIXED: Use tsx for TypeScript compilation and add better debugging
 */

import { config } from 'dotenv';

// Load environment variables first
config();

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Function to run tsx command
async function runTsx(scriptPath) {
  try {
    const result = execSync(`npx tsx ${scriptPath}`, { encoding: 'utf8', timeout: 60000 });
    console.log('TSX Result:', result);
    return { success: true, output: result };
  } catch (error) {
    console.error('TSX Error:', error.message);
    return { success: false, output: error.message };
  }
}

// Test 1: Check if required dependencies are installed
console.log('🔍 Testing WhatsApp Image Recognition System');
console.log('=' .repeat(60));

console.log('\n📦 Checking dependencies...');
const deps = ['@tensorflow/tfjs', '@tensorflow/tfjs-node', '@xenova/transformers', 'sharp'];
const missingDeps = [];

deps.forEach(dep => {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', dep, 'package.json'), 'utf8'));
    console.log(`   ✅ ${dep}: v${packageJson.version}`);
  } catch (error) {
    console.log(`   ❌ ${dep}: Missing`);
    missingDeps.push(dep);
  }
});

if (missingDeps.length > 0) {
  console.log(`\n⚠️  Missing dependencies: ${missingDeps.join(', ')}`);
  console.log('Please run: npm install ' + missingDeps.join(' ') + ' opencv4nodejs');
}

// Test 2: Run the actual image recognition test using tsx
console.log('\n⏳ Initializing image recognition service...');
console.log('This may take 1-2 minutes for model downloads...\n');

try {
  // Create a simple test file that imports and runs the service
  const testFile = join(process.cwd(), 'temp-test-image.ts');
  const testCode = `
import { imageRecognitionService } from './server/services/image-recognition.js';
import { storage } from './server/storage.js';

async function runImageTest() {
  console.log('🚀 Starting enhanced image recognition test...');
  
  try {
    // Wait for initialization
    await imageRecognitionService.ensureInitialized();
    console.log('✅ Service initialized successfully');
    
    // Check status
    const status = imageRecognitionService.getStatus();
    console.log('📊 Service Status:', status);
    
    // Get products
    const products = await storage.getProducts();
    console.log('📦 Found', products.length, 'products');
    
    if (products.length === 0) {
      console.log('⚠️  No products found. Please add products to test matching.');
      return;
    }
    
    // Test with sample product image URLs (more relevant to your inventory)
    const testUrls = [
      'https://www.example.com/product1.jpg', // Replace with actual product images
      'https://upload.wikimedia.org/wikipedia/commons/thumb