"""
Import vendors from Excel file to the database via API
"""

import pandas as pd
import requests
import json

def import_vendors():
    # Read the Excel file
    df = pd.read_excel('Vendor Category Matersheet Final.xlsx')
    
    # Clean the data
    df = df.fillna('')
    
    # Convert to appropriate format
    vendors = []
    for _, row in df.iterrows():
        vendor = {
            'name': row['Vendor Name'],
            'mainCategory': row['Main Category'].lower().replace('/', '_'),  # Convert to match enum
            'subcategory': row['Subcategory'],
            'productType': row['Product Type'],
            'productCode': row['Product Code'],
            'otherProducts': row['Other Products/Services'] if row['Other Products/Services'] else None,
            'contactNumber': str(row['Contact Number']),
            'location': row['Location'],
            'city': row['City'],
            'state': row['State'],
            'zone': row['Zone'] if row['Zone'] else None,
            'status': 'active' if row['Status Of Vendor'] == 'Active' else 'inactive' if row['Status Of Vendor'] == 'Inactive' else 'pending'
        }
        vendors.append(vendor)
    
    # Import vendors one by one
    base_url = 'http://localhost:5000/api/vendors'
    imported = 0
    errors = []
    
    for vendor in vendors:
        try:
            response = requests.post(
                base_url,
                json=vendor,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 201:
                imported += 1
                print(f"✓ Imported: {vendor['name']}")
            else:
                errors.append(f"Failed to import {vendor['name']}: {response.text}")
                print(f"✗ Failed: {vendor['name']} - {response.status_code}")
        except Exception as e:
            errors.append(f"Error importing {vendor['name']}: {str(e)}")
            print(f"✗ Error: {vendor['name']} - {str(e)}")
    
    print(f"\n{'='*50}")
    print(f"Import Complete!")
    print(f"Successfully imported: {imported} vendors")
    print(f"Errors: {len(errors)}")
    
    if errors:
        print("\nErrors encountered:")
        for error in errors[:10]:  # Show first 10 errors
            print(f"  - {error}")

if __name__ == "__main__":
    import_vendors()
