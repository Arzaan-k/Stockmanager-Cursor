"""
Vendor Data Processing Script
Reads the Excel file and converts it to structured JSON for web application
"""

import pandas as pd
import json
from collections import defaultdict

def process_vendor_data():
    # Read the Excel file
    df = pd.read_excel('Vendor Category Matersheet Final.xlsx')
    
    # Clean the data
    df = df.fillna('Not Available')
    
    # Structure 1: Vendors by Category
    vendors_by_category = defaultdict(lambda: defaultdict(list))
    
    for _, row in df.iterrows():
        vendor_info = {
            'id': f"vendor_{_}",
            'name': row['Vendor Name'],
            'productType': row['Product Type'],
            'productCode': row['Product Code'],
            'otherProducts': row['Other Products/Services'],
            'contact': str(row['Contact Number']),
            'location': row['Location'],
            'status': row['Status Of Vendor'] if row['Status Of Vendor'] != 'Not Available' else 'Unknown',
            'state': row['State'],
            'city': row['City'],
            'zone': row['Zone'],
            'mainCategory': row['Main Category'],
            'subcategory': row['Subcategory']
        }
        
        vendors_by_category[row['Main Category']][row['Subcategory']].append(vendor_info)
    
    # Structure 2: All vendors list for searching
    all_vendors = []
    for _, row in df.iterrows():
        vendor = {
            'id': f"vendor_{_}",
            'name': row['Vendor Name'],
            'mainCategory': row['Main Category'],
            'subcategory': row['Subcategory'],
            'productType': row['Product Type'],
            'productCode': row['Product Code'],
            'otherProducts': row['Other Products/Services'],
            'contact': str(row['Contact Number']),
            'location': row['Location'],
            'status': row['Status Of Vendor'] if row['Status Of Vendor'] != 'Not Available' else 'Unknown',
            'state': row['State'],
            'city': row['City'],
            'zone': row['Zone']
        }
        all_vendors.append(vendor)
    
    # Structure 3: Product to Vendor mapping
    product_vendor_mapping = defaultdict(list)
    for _, row in df.iterrows():
        product_vendor_mapping[row['Product Type']].append({
            'vendorId': f"vendor_{_}",
            'vendorName': row['Vendor Name'],
            'productCode': row['Product Code'],
            'category': row['Main Category'],
            'subcategory': row['Subcategory'],
            'status': row['Status Of Vendor'] if row['Status Of Vendor'] != 'Not Available' else 'Unknown',
            'location': row['City'] + ', ' + row['State']
        })
    
    # Structure 4: Statistics
    stats = {
        'totalVendors': len(df),
        'activeVendors': len(df[df['Status Of Vendor'] == 'Active']),
        'inactiveVendors': len(df[df['Status Of Vendor'] == 'Inactive']),
        'unknownStatus': len(df[df['Status Of Vendor'] == 'Not Available']),
        'categories': df['Main Category'].nunique(),
        'subcategories': df['Subcategory'].nunique(),
        'uniqueProducts': df['Product Type'].nunique(),
        'cities': df['City'].nunique(),
        'zones': df['Zone'].nunique()
    }
    
    # Export to JSON files
    with open('vendor_data.json', 'w', encoding='utf-8') as f:
        json.dump({
            'vendors': all_vendors,
            'vendorsByCategory': dict(vendors_by_category),
            'productVendorMapping': dict(product_vendor_mapping),
            'statistics': stats
        }, f, indent=2, ensure_ascii=False)
    
    print("Data processing complete!")
    print(f"Total vendors processed: {stats['totalVendors']}")
    print(f"Active vendors: {stats['activeVendors']}")
    print(f"Categories: {stats['categories']}")
    print(f"Subcategories: {stats['subcategories']}")
    
    return True

if __name__ == "__main__":
    process_vendor_data()
