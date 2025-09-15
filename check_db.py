import sqlite3

conn = sqlite3.connect('stocksmarthub.db')
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM products')
total_products = cursor.fetchone()[0]
print(f'Total products: {total_products}')

cursor.execute('SELECT COUNT(*) FROM products WHERE image_url IS NOT NULL AND image_url != ""')
products_with_images = cursor.fetchone()[0]
print(f'Products with images: {products_with_images}')

cursor.execute('SELECT COUNT(*) FROM vendors')
total_vendors = cursor.fetchone()[0]
print(f'Total vendors: {total_vendors}')

print('\nSample products with images:')
cursor.execute('SELECT product_name, image_url FROM products WHERE image_url IS NOT NULL AND image_url != "" LIMIT 5')
for row in cursor.fetchall():
    print(f'  - {row[0]}: {row[1]}')

conn.close()
