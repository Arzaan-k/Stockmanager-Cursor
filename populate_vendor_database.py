#!/usr/bin/env python3
"""
Vendor Database Population Script
Populates database with vendor data from Excel file
"""

import pandas as pd
import sqlite3
import logging
from typing import Dict, List, Optional
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('vendor_database.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class VendorDatabaseManager:
    """Handles vendor database operations"""
    
    def __init__(self, db_path: str = "stocksmarthub.db"):
        self.db_path = db_path
        self.init_vendor_database()
    
    def init_vendor_database(self):
        """Initialize database with vendor-related tables"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create main categories table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS main_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_name TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create subcategories table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS subcategories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subcategory_name TEXT NOT NULL,
                    main_category_id INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (main_category_id) REFERENCES main_categories (id)
                )
            """)
            
            # Check if vendors table needs to be updated
            cursor.execute("PRAGMA table_info(vendors)")
            existing_columns = [col[1] for col in cursor.fetchall()]
            
            # Create new vendors table with proper schema
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendor_directory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor_name TEXT NOT NULL,
                    main_category_id INTEGER,
                    subcategory_id INTEGER,
                    product_type TEXT,
                    product_code TEXT UNIQUE,
                    other_products_services TEXT,
                    contact_number TEXT,
                    location TEXT,
                    status_of_vendor TEXT,
                    state TEXT,
                    city TEXT,
                    zone TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (main_category_id) REFERENCES main_categories (id),
                    FOREIGN KEY (subcategory_id) REFERENCES subcategories (id)
                )
            """)
            
            # Create indexes for better performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendor_directory_category ON vendor_directory(main_category_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendor_directory_subcategory ON vendor_directory(subcategory_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendor_directory_status ON vendor_directory(status_of_vendor)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendor_directory_zone ON vendor_directory(zone)")
            
            conn.commit()
            conn.close()
            logger.info("Vendor database initialized successfully")
        
        except Exception as e:
            logger.error(f"Error initializing vendor database: {e}")
            raise
    
    def clear_vendor_data(self):
        """Clear all vendor data for fresh import"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("DELETE FROM vendor_directory")
            cursor.execute("DELETE FROM subcategories")
            cursor.execute("DELETE FROM main_categories")
            
            # Reset auto-increment counters
            cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('vendor_directory', 'subcategories', 'main_categories')")
            
            conn.commit()
            conn.close()
            logger.info("Cleared existing vendor data")
        
        except Exception as e:
            logger.error(f"Error clearing vendor data: {e}")
            raise
    
    def get_or_create_main_category(self, cursor, category_name: str) -> int:
        """Get or create main category and return its ID"""
        cursor.execute("SELECT id FROM main_categories WHERE category_name = ?", (category_name,))
        result = cursor.fetchone()
        
        if result:
            return result[0]
        else:
            cursor.execute("INSERT INTO main_categories (category_name) VALUES (?)", (category_name,))
            return cursor.lastrowid
    
    def get_or_create_subcategory(self, cursor, subcategory_name: str, main_category_id: int) -> int:
        """Get or create subcategory and return its ID"""
        cursor.execute(
            "SELECT id FROM subcategories WHERE subcategory_name = ? AND main_category_id = ?", 
            (subcategory_name, main_category_id)
        )
        result = cursor.fetchone()
        
        if result:
            return result[0]
        else:
            cursor.execute(
                "INSERT INTO subcategories (subcategory_name, main_category_id) VALUES (?, ?)", 
                (subcategory_name, main_category_id)
            )
            return cursor.lastrowid
    
    def import_vendors_from_excel(self, excel_file: str, clear_existing: bool = True) -> bool:
        """Import vendor data from Excel file"""
        try:
            logger.info(f"Reading vendor data from Excel file: {excel_file}")
            
            # Read the Master Sheet (or first sheet)
            df = pd.read_excel(excel_file, sheet_name='Master Sheet')
            logger.info(f"Read {len(df)} vendor records from Excel file")
            
            if clear_existing:
                self.clear_vendor_data()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            vendors_added = 0
            categories_added = set()
            subcategories_added = set()
            
            for _, row in df.iterrows():
                try:
                    # Extract data with safe handling of NaN values
                    main_category = str(row.get('Main Category', '')).strip()
                    subcategory = str(row.get('Subcategory', '')).strip()
                    vendor_name = str(row.get('Vendor Name', '')).strip()
                    product_type = str(row.get('Product Type', '')).strip()
                    product_code = str(row.get('Product Code', '')).strip()
                    other_products = str(row.get('Other Products/Services', '')).strip()
                    contact_number = self._safe_str(row.get('Contact Number'))
                    location = str(row.get('Location', '')).strip()
                    status = str(row.get('Status Of Vendor', '')).strip()
                    state = str(row.get('State', '')).strip()
                    city = str(row.get('City', '')).strip()
                    zone = str(row.get('Zone', '')).strip()
                    
                    # Skip empty rows
                    if not vendor_name or vendor_name == 'nan':
                        continue
                    
                    # Get or create main category
                    main_category_id = self.get_or_create_main_category(cursor, main_category)
                    if main_category not in categories_added:
                        categories_added.add(main_category)
                        logger.debug(f"Added main category: {main_category}")
                    
                    # Get or create subcategory
                    subcategory_id = self.get_or_create_subcategory(cursor, subcategory, main_category_id)
                    subcategory_key = f"{main_category}::{subcategory}"
                    if subcategory_key not in subcategories_added:
                        subcategories_added.add(subcategory_key)
                        logger.debug(f"Added subcategory: {subcategory} under {main_category}")
                    
                    # Insert vendor
                    cursor.execute("""
                        INSERT OR REPLACE INTO vendor_directory (
                            vendor_name, main_category_id, subcategory_id, product_type,
                            product_code, other_products_services, contact_number, location,
                            status_of_vendor, state, city, zone
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        vendor_name, main_category_id, subcategory_id, product_type,
                        product_code, other_products, contact_number, location,
                        status, state, city, zone
                    ))
                    
                    vendors_added += 1
                    
                    if vendors_added % 50 == 0:
                        logger.info(f"Processed {vendors_added} vendors...")
                
                except Exception as e:
                    logger.warning(f"Error processing vendor row: {e}")
                    continue
            
            conn.commit()
            conn.close()
            
            logger.info(f"Successfully imported {vendors_added} vendors")
            logger.info(f"Added {len(categories_added)} main categories")
            logger.info(f"Added {len(subcategories_added)} subcategories")
            
            return True
        
        except Exception as e:
            logger.error(f"Error importing vendor data: {e}")
            return False
    
    def get_database_stats(self) -> Dict:
        """Get database statistics"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            stats = {}
            
            cursor.execute("SELECT COUNT(*) FROM vendor_directory")
            stats['total_vendors'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM main_categories")
            stats['total_main_categories'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM subcategories")
            stats['total_subcategories'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT status_of_vendor, COUNT(*) FROM vendor_directory GROUP BY status_of_vendor")
            stats['vendors_by_status'] = dict(cursor.fetchall())
            
            cursor.execute("SELECT zone, COUNT(*) FROM vendor_directory WHERE zone IS NOT NULL AND zone != '' GROUP BY zone")
            stats['vendors_by_zone'] = dict(cursor.fetchall())
            
            cursor.execute("""
                SELECT mc.category_name, COUNT(v.id) 
                FROM main_categories mc 
                LEFT JOIN vendor_directory v ON mc.id = v.main_category_id 
                GROUP BY mc.category_name
            """)
            stats['vendors_by_category'] = dict(cursor.fetchall())
            
            conn.close()
            return stats
        
        except Exception as e:
            logger.error(f"Error getting database stats: {e}")
            return {}
    
    @staticmethod
    def _safe_str(value) -> str:
        """Safely convert value to string"""
        if pd.isna(value) or value is None:
            return ''
        return str(value).strip()

def main():
    """Main function"""
    excel_file = "Vendor Category Matersheet Final.xlsx"
    
    # Verify Excel file exists
    if not os.path.exists(excel_file):
        logger.error(f"Excel file not found: {excel_file}")
        return False
    
    # Initialize database manager
    db_manager = VendorDatabaseManager()
    
    # Import vendor data
    logger.info("Starting vendor data import...")
    success = db_manager.import_vendors_from_excel(excel_file)
    
    if success:
        # Get and display statistics
        stats = db_manager.get_database_stats()
        
        logger.info("Vendor data import completed successfully!")
        print(f"\n{'='*60}")
        print("DATABASE STATISTICS")
        print(f"{'='*60}")
        print(f"Total vendors: {stats.get('total_vendors', 0)}")
        print(f"Main categories: {stats.get('total_main_categories', 0)}")
        print(f"Subcategories: {stats.get('total_subcategories', 0)}")
        
        print(f"\nVendors by Status:")
        for status, count in stats.get('vendors_by_status', {}).items():
            print(f"  {status}: {count}")
        
        print(f"\nVendors by Zone:")
        for zone, count in stats.get('vendors_by_zone', {}).items():
            print(f"  {zone}: {count}")
        
        print(f"\nVendors by Category:")
        for category, count in stats.get('vendors_by_category', {}).items():
            print(f"  {category}: {count}")
        
        print(f"\n✓ Vendor database populated successfully!")
        print(f"✓ Check 'vendor_database.log' for detailed logs")
    else:
        logger.error("Vendor data import failed!")
        print(f"\n✗ Import failed!")
        print(f"✗ Check 'vendor_database.log' for error details")
    
    return success

if __name__ == "__main__":
    main()
