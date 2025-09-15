import sqlite3

conn = sqlite3.connect('stocksmarthub.db')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Current tables:")
for table in tables:
    print(f"  - {table[0]}")

print("\nTable schemas:")
for table in tables:
    table_name = table[0]
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    print(f"\n{table_name}:")
    for col in columns:
        print(f"  {col[1]} ({col[2]}) - {col}")

conn.close()
