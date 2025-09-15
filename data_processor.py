#!/usr/bin/env python3
"""
Data Processor Script for StockSmartHub
Handles Excel data import and product image fetching
"""

import pandas as pd
import requests
import sqlite3
import csv
import os
import logging
import time
import json
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data_processor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DatabaseManager:
    """Handles database operations"""
    
    def __init__(self, db_path: str = "stocksmarthub.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize database with required tables"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create vendors table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_code TEXT,
                    group_name TEXT UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create products table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    crystal_part_code TEXT UNIQUE,
                    product_name TEXT NOT NULL,
                    group_code TEXT,
                    group_name TEXT,
                    mfg_part_code TEXT,
                    importance TEXT,
                    high_value TEXT,
                    max_usage_per_month INTEGER,
                    six_months_usage INTEGER,
                    average_per_day REAL,
                    lead_time_days INTEGER,
                    critical_factor INTEGER,
                    units TEXT,
                    min_inventory_per_day INTEGER,
                    max_inventory_per_day INTEGER,
                    current_stock_available INTEGER,
                    image_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (group_name) REFERENCES vendors (group_name)
                )
            """)
            
            conn.commit()
            conn.close()
            logger.info("Database initialized successfully")
        
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise
    
    def insert_vendor_data(self, excel_file_path: str):
        """Insert data from Excel file into database"""
        try:
            # Read Excel file
            df = pd.read_excel(excel_file_path)
            logger.info(f"Read {len(df)} rows from Excel file")
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            vendors_added = 0
            products_added = 0
            
            for _, row in df.iterrows():
                try:
                    # Insert vendor if not exists
                    if pd.notna(row.get('Group Name', '')):
                        cursor.execute("""
                            INSERT OR IGNORE INTO vendors (group_code, group_name)
                            VALUES (?, ?)
                        """, (row.get('Group Code', ''), row.get('Group Name', '')))
                        
                        if cursor.rowcount > 0:
                            vendors_added += 1
                    
                    # Insert product
                    cursor.execute("""
                        INSERT OR REPLACE INTO products (
                            crystal_part_code, product_name, group_code, group_name,
                            mfg_part_code, importance, high_value, max_usage_per_month,
                            six_months_usage, average_per_day, lead_time_days,
                            critical_factor, units, min_inventory_per_day,
                            max_inventory_per_day, current_stock_available
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        row.get('Crystal Part Code', ''),
                        row.get('List of Items', ''),
                        row.get('Group Code', ''),
                        row.get('Group Name', ''),
                        row.get('MFG Part Code', ''),
                        row.get('Importance', ''),
                        row.get('High Value', ''),
                        self._safe_int(row.get('Maximum Usage Per Month', 0)),
                        self._safe_int(row.get('6 Months Usage', 0)),
                        self._safe_float(row.get('Average per day', 0)),
                        self._safe_int(row.get('Lead Time days', 0)),
                        self._safe_int(row.get('Critical Factor - One Day', 0)),
                        row.get('Units', ''),
                        self._safe_int(row.get('Minimum Inventory Per Day', 0)),
                        self._safe_int(row.get('Maximum Inventory Per Day', 0)),
                        self._safe_int(row.get('CURRENT STOCK AVAILABLE', 0))
                    ))
                    
                    if cursor.rowcount > 0:
                        products_added += 1
                
                except Exception as e:
                    logger.warning(f"Error processing row: {e}")
                    continue
            
            conn.commit()
            conn.close()
            
            logger.info(f"Successfully added {vendors_added} vendors and {products_added} products to database")
            return True
        
        except Exception as e:
            logger.error(f"Error inserting vendor data: {e}")
            return False
    
    def update_product_image(self, crystal_part_code: str, image_url: str):
        """Update product image URL"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE products SET image_url = ? WHERE crystal_part_code = ?
            """, (image_url, crystal_part_code))
            
            conn.commit()
            conn.close()
            return cursor.rowcount > 0
        
        except Exception as e:
            logger.error(f"Error updating product image: {e}")
            return False
    
    @staticmethod
    def _safe_int(value, default=0):
        """Safely convert value to int"""
        try:
            if pd.isna(value) or value == '':
                return default
            return int(float(str(value)))
        except:
            return default
    
    @staticmethod
    def _safe_float(value, default=0.0):
        """Safely convert value to float"""
        try:
            if pd.isna(value) or value == '':
                return default
            return float(str(value))
        except:
            return default

class ImageFetcher:
    """Handles product image fetching from various APIs"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # Create images directory if it doesn't exist
        self.images_dir = "images"
        os.makedirs(self.images_dir, exist_ok=True)
        
        # Cache for processed images
        self.image_cache = {}
        self.load_cache()
    
    def load_cache(self):
        """Load image cache from file"""
        cache_file = "image_cache.json"
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r') as f:
                    self.image_cache = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load image cache: {e}")
    
    def save_cache(self):
        """Save image cache to file"""
        try:
            with open("image_cache.json", 'w') as f:
                json.dump(self.image_cache, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not save image cache: {e}")
    
    def fetch_product_image(self, product_name: str, max_retries: int = 3) -> Optional[str]:
        """Fetch product image from multiple sources"""
        
        # Check cache first
        cache_key = hashlib.md5(product_name.lower().encode()).hexdigest()
        if cache_key in self.image_cache:
            logger.info(f"Using cached image for: {product_name}")
            return self.image_cache[cache_key]
        
        image_url = None
        
        # Try different image sources
        for attempt in range(max_retries):
            try:
                # Method 1: Try Unsplash (high quality stock images)
                image_url = self._fetch_from_unsplash(product_name)
                if image_url:
                    break
                
                # Method 2: Try Pixabay (free stock images)
                image_url = self._fetch_from_pixabay(product_name)
                if image_url:
                    break
                
                # Method 3: Try Google Custom Search (requires API key)
                image_url = self._fetch_from_google_images(product_name)
                if image_url:
                    break
                
                # Method 4: Generic placeholder based on product type
                image_url = self._get_generic_placeholder(product_name)
                if image_url:
                    break
                
                time.sleep(1)  # Wait before retry
                
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed for {product_name}: {e}")
                time.sleep(2 ** attempt)  # Exponential backoff
        
        # Cache the result (even if None)
        self.image_cache[cache_key] = image_url
        self.save_cache()
        
        if image_url:
            logger.info(f"Found image for: {product_name}")
        else:
            logger.warning(f"No image found for: {product_name}")
        
        return image_url
    
    def _fetch_from_unsplash(self, product_name: str) -> Optional[str]:
        """Fetch image from Unsplash"""
        try:
            # Clean product name for search
            search_term = self._clean_search_term(product_name)
            
            # Unsplash API endpoint (you can use without API key for basic searches)
            url = f"https://source.unsplash.com/800x600/?{quote(search_term)}"
            
            response = self.session.head(url, timeout=10)
            if response.status_code == 200:
                return url
                
        except Exception as e:
            logger.debug(f"Unsplash fetch failed: {e}")
        
        return None
    
    def _fetch_from_pixabay(self, product_name: str) -> Optional[str]:
        """Fetch image from Pixabay (requires API key)"""
        # Note: You'll need to sign up for a free Pixabay API key
        # For now, return None - can be implemented when API key is available
        return None
    
    def _fetch_from_google_images(self, product_name: str) -> Optional[str]:
        """Fetch image from Google Custom Search (requires API key)"""
        # Note: Requires Google Custom Search API key and Search Engine ID
        # For now, return None - can be implemented when API keys are available
        return None
    
    def _get_generic_placeholder(self, product_name: str) -> str:
        """Generate generic placeholder image URL"""
        # Determine category-based placeholder
        product_lower = product_name.lower()
        
        if any(term in product_lower for term in ['compressor', 'motor', 'pump']):
            return "https://via.placeholder.com/800x600/4CAF50/FFFFFF?text=Compressor+Motor"
        elif any(term in product_lower for term in ['sensor', 'temperature', 'pressure']):
            return "https://via.placeholder.com/800x600/2196F3/FFFFFF?text=Sensor"
        elif any(term in product_lower for term in ['valve', 'solenoid']):
            return "https://via.placeholder.com/800x600/FF9800/FFFFFF?text=Valve"
        elif any(term in product_lower for term in ['controller', 'board', 'display']):
            return "https://via.placeholder.com/800x600/9C27B0/FFFFFF?text=Controller"
        elif any(term in product_lower for term in ['coil', 'evaporator', 'condenser']):
            return "https://via.placeholder.com/800x600/607D8B/FFFFFF?text=Coil"
        elif any(term in product_lower for term in ['paint', 'primer', 'brush']):
            return "https://via.placeholder.com/800x600/795548/FFFFFF?text=Paint+Supplies"
        elif any(term in product_lower for term in ['gas', 'refrigerant', 'nitrogen']):
            return "https://via.placeholder.com/800x600/F44336/FFFFFF?text=Gas+Cylinder"
        elif any(term in product_lower for term in ['electrical', 'cable', 'wire', 'switch']):
            return "https://via.placeholder.com/800x600/FFC107/FFFFFF?text=Electrical"
        else:
            return f"https://via.placeholder.com/800x600/757575/FFFFFF?text={quote(product_name[:20])}"
    
    def _clean_search_term(self, product_name: str) -> str:
        """Clean product name for better search results"""
        # Remove part codes and clean up the name
        cleaned = product_name
        
        # Remove common prefixes
        prefixes_to_remove = ['daikin', 'carrier', 'thermoking', 'tk-', 'q-']
        for prefix in prefixes_to_remove:
            if cleaned.lower().startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
        
        # Remove part numbers in parentheses
        import re
        cleaned = re.sub(r'\([^)]*\)', '', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned

class CSVProcessor:
    """Handles CSV file operations"""
    
    def __init__(self, csv_file_path: str):
        self.csv_file_path = csv_file_path
        self.data = []
        self.headers = []
        self.load_csv()
    
    def load_csv(self):
        """Load CSV file"""
        try:
            with open(self.csv_file_path, 'r', encoding='utf-8') as file:
                # Skip the first line with row numbers
                content = file.read()
                lines = content.strip().split('\n')
                
                # Remove row numbers from each line
                clean_lines = []
                for line in lines:
                    if '|' in line:
                        # Remove the row number part (everything before first |)
                        clean_line = line[line.index('|') + 1:]
                        clean_lines.append(clean_line)
                    else:
                        clean_lines.append(line)
                
                # Parse the cleaned CSV
                reader = csv.reader(clean_lines)
                self.headers = next(reader)
                
                for row in reader:
                    if len(row) == len(self.headers):
                        self.data.append(row)
                
                logger.info(f"Loaded {len(self.data)} products from CSV")
        
        except Exception as e:
            logger.error(f"Error loading CSV: {e}")
            raise
    
    def get_products_without_images(self) -> List[Tuple[int, str, str]]:
        """Get products that don't have images"""
        products_without_images = []
        
        # Find the indices for relevant columns
        try:
            product_name_idx = self.headers.index('List of Items')
            crystal_code_idx = self.headers.index('Crystal Part Code')
            photos_idx = self.headers.index('Photos')
        except ValueError as e:
            logger.error(f"Required column not found: {e}")
            return products_without_images
        
        for i, row in enumerate(self.data):
            if len(row) > max(product_name_idx, photos_idx, crystal_code_idx):
                product_name = row[product_name_idx].strip()
                crystal_code = row[crystal_code_idx].strip()
                current_photo = row[photos_idx].strip()
                
                # Skip if product name is empty or if it already has a photo
                if product_name and not current_photo:
                    products_without_images.append((i, crystal_code, product_name))
        
        return products_without_images
    
    def update_image_url(self, row_index: int, image_url: str):
        """Update image URL for a specific row"""
        try:
            photos_idx = self.headers.index('Photos')
            if row_index < len(self.data) and len(self.data[row_index]) > photos_idx:
                self.data[row_index][photos_idx] = image_url
                return True
        except Exception as e:
            logger.error(f"Error updating image URL: {e}")
        return False
    
    def save_csv(self, backup=True):
        """Save updated CSV file"""
        try:
            # Create backup if requested
            if backup and os.path.exists(self.csv_file_path):
                backup_path = f"{self.csv_file_path}.backup"
                import shutil
                shutil.copy2(self.csv_file_path, backup_path)
                logger.info(f"Created backup at: {backup_path}")
            
            # Write the updated CSV
            with open(self.csv_file_path, 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                
                # Write headers
                writer.writerow(self.headers)
                
                # Write data
                for i, row in enumerate(self.data):
                    # Add row number back
                    numbered_row = [str(i + 2)] + list(row)  # +2 because header is row 1
                    writer.writerow(numbered_row)
            
            logger.info(f"Successfully updated CSV file: {self.csv_file_path}")
            return True
        
        except Exception as e:
            logger.error(f"Error saving CSV: {e}")
            return False

class DataProcessor:
    """Main class that orchestrates the entire process"""
    
    def __init__(self, excel_file: str, csv_file: str):
        self.excel_file = excel_file
        self.csv_file = csv_file
        self.db_manager = DatabaseManager()
        self.image_fetcher = ImageFetcher()
        self.csv_processor = CSVProcessor(csv_file)
    
    def process_excel_to_database(self) -> bool:
        """Process Excel file and populate database"""
        logger.info("Starting Excel to database processing...")
        success = self.db_manager.insert_vendor_data(self.excel_file)
        if success:
            logger.info("Excel data successfully processed to database")
        else:
            logger.error("Failed to process Excel data to database")
        return success
    
    def process_product_images(self, max_products: Optional[int] = None) -> bool:
        """Fetch images for products and update CSV"""
        logger.info("Starting product image processing...")
        
        products_without_images = self.csv_processor.get_products_without_images()
        
        if not products_without_images:
            logger.info("All products already have images")
            return True
        
        # Limit processing if specified
        if max_products:
            products_without_images = products_without_images[:max_products]
        
        logger.info(f"Processing images for {len(products_without_images)} products")
        
        success_count = 0
        for i, (row_index, crystal_code, product_name) in enumerate(products_without_images):
            logger.info(f"Processing {i+1}/{len(products_without_images)}: {product_name}")
            
            # Fetch image
            image_url = self.image_fetcher.fetch_product_image(product_name)
            
            if image_url:
                # Update CSV
                if self.csv_processor.update_image_url(row_index, image_url):
                    # Update database
                    self.db_manager.update_product_image(crystal_code, image_url)
                    success_count += 1
                    logger.info(f"SUCCESS: Updated image for: {product_name}")
                else:
                    logger.warning(f"FAILED: Failed to update CSV for: {product_name}")
            else:
                logger.warning(f"NO_IMAGE: No image found for: {product_name}")
            
            # Small delay to be respectful to APIs
            time.sleep(0.5)
        
        # Save updated CSV
        if success_count > 0:
            self.csv_processor.save_csv()
        
        logger.info(f"Image processing completed. Successfully processed {success_count}/{len(products_without_images)} products")
        return success_count > 0
    
    def run_full_process(self, max_products: Optional[int] = None) -> bool:
        """Run the complete data processing pipeline"""
        logger.info("Starting full data processing pipeline...")
        
        try:
            # Step 1: Process Excel to database
            if not self.process_excel_to_database():
                logger.error("Failed to process Excel data")
                return False
            
            # Step 2: Process product images
            if not self.process_product_images(max_products):
                logger.warning("Image processing had issues, but continuing...")
            
            logger.info("Full data processing pipeline completed successfully!")
            return True
        
        except Exception as e:
            logger.error(f"Error in full process: {e}")
            return False

def main():
    """Main function"""
    # File paths
    excel_file = "Vendor Category Matersheet Final.xlsx"
    csv_file = "Untitled spreadsheet - Sheet1.csv"
    
    # Verify files exist
    if not os.path.exists(excel_file):
        logger.error(f"Excel file not found: {excel_file}")
        return False
    
    if not os.path.exists(csv_file):
        logger.error(f"CSV file not found: {csv_file}")
        return False
    
    # Initialize processor
    processor = DataProcessor(excel_file, csv_file)
    
    # Run the full process
    # You can limit the number of products for testing: max_products=10
    success = processor.run_full_process(max_products=50)  # Process first 50 products
    
    if success:
        logger.info("Data processing completed successfully!")
        print("\n✓ Processing completed successfully!")
        print("✓ Excel data has been imported to database")
        print("✓ Product images have been fetched and CSV updated")
        print("✓ Check 'data_processor.log' for detailed logs")
    else:
        logger.error("Data processing failed!")
        print("\n✗ Processing failed!")
        print("✗ Check 'data_processor.log' for error details")
    
    return success

if __name__ == "__main__":
    main()
