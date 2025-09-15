import pandas as pd

# Read the Excel file
excel_file = "Vendor Category Matersheet Final.xlsx"
print(f"Reading Excel file: {excel_file}")

try:
    # Try to read all sheets
    excel_data = pd.read_excel(excel_file, sheet_name=None)
    
    print(f"\nFound {len(excel_data)} sheet(s):")
    for sheet_name, df in excel_data.items():
        print(f"\nSheet: '{sheet_name}'")
        print(f"Shape: {df.shape} (rows x columns)")
        print(f"Columns: {list(df.columns)}")
        print(f"Sample data (first 3 rows):")
        print(df.head(3))
        print("-" * 80)
    
    # Try reading the first sheet specifically
    print("\n" + "="*80)
    print("READING FIRST SHEET SPECIFICALLY:")
    df_first = pd.read_excel(excel_file)
    print(f"Shape: {df_first.shape}")
    print(f"Columns: {list(df_first.columns)}")
    print("First 5 rows:")
    for i, row in df_first.head(5).iterrows():
        print(f"Row {i}: {dict(row)}")
        
except Exception as e:
    print(f"Error reading Excel file: {e}")
    
    # Try with different parameters
    try:
        print("\nTrying with header=0...")
        df = pd.read_excel(excel_file, header=0)
        print(f"Shape: {df.shape}")
        print(f"Columns: {list(df.columns)}")
        
    except Exception as e2:
        print(f"Also failed: {e2}")
