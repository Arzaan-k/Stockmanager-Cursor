# StockSmartHub Data Processor

This Python script automates two main tasks:
1. **Excel to Database**: Imports vendor and product data from Excel files into a SQLite database
2. **Product Image Fetching**: Automatically finds and downloads product images based on product names, then updates the CSV file with image URLs

## Features

- ✅ **Excel Data Import**: Reads Excel files and populates a structured SQLite database
- ✅ **Intelligent Image Fetching**: Uses multiple image sources (Unsplash, placeholders)
- ✅ **CSV Management**: Updates CSV files with image URLs
- ✅ **Error Handling**: Robust error handling with detailed logging
- ✅ **Caching**: Caches image results to avoid duplicate requests
- ✅ **Backup**: Creates backups before modifying files
- ✅ **Rate Limiting**: Respects API limits with proper delays

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Prepare Your Files

Make sure these files are in the same directory as the script:
- `Vendor Category Matersheet Final.xlsx` - Your Excel file with vendor/product data
- `Untitled spreadsheet - Sheet1.csv` - Your CSV file with product list

### 3. Run the Script

```bash
python data_processor.py
```

## File Structure

```
StockSmartHub/
├── data_processor.py          # Main script
├── requirements.txt           # Python dependencies
├── README.md                 # This file
├── Vendor Category Matersheet Final.xlsx  # Your Excel data
├── Untitled spreadsheet - Sheet1.csv      # Your CSV data
├── stocksmarthub.db          # SQLite database (created automatically)
├── data_processor.log        # Processing logs
├── image_cache.json          # Image URL cache
├── images/                   # Downloaded images folder
└── *.backup                  # Backup files
```

## How It Works

### Phase 1: Excel to Database
1. Reads the Excel file using pandas
2. Creates SQLite database with `vendors` and `products` tables
3. Imports all vendor and product data with proper data types
4. Handles missing values and data validation

### Phase 2: Image Processing
1. Scans CSV for products without images (empty Photos column)
2. For each product:
   - Cleans product name for better search results
   - Tries multiple image sources:
     - Unsplash (high-quality stock images)
     - Category-based placeholders
   - Caches results to avoid duplicate requests
3. Updates both CSV file and database with image URLs
4. Creates backup of original CSV

## Database Schema

### Vendors Table
- `id` (Primary Key)
- `group_code`
- `group_name`
- `created_at`

### Products Table
- `id` (Primary Key)
- `crystal_part_code` (Unique)
- `product_name`
- `group_code`, `group_name`
- `mfg_part_code`
- `importance`, `high_value`
- `max_usage_per_month`, `six_months_usage`
- `average_per_day`
- `lead_time_days`, `critical_factor`
- `units`
- `min_inventory_per_day`, `max_inventory_per_day`
- `current_stock_available`
- `image_url` ⭐ (Updated by image fetcher)
- `created_at`

## Configuration Options

### Limit Processing
To test with fewer products:

```python
# In main() function, change:
success = processor.run_full_process(max_products=10)  # Process only 10 products
```

### Database Location
Change database file location:

```python
db_manager = DatabaseManager("path/to/your/database.db")
```

## Image Sources

The script tries to fetch images from multiple sources:

1. **Unsplash** - High-quality stock photos
2. **Category-based Placeholders** - Intelligent placeholders based on product type:
   - 🔧 Compressor/Motor → Green placeholder
   - 📡 Sensors → Blue placeholder  
   - ⚙️ Valves → Orange placeholder
   - 🖥️ Controllers → Purple placeholder
   - 🔌 Electrical → Yellow placeholder
   - 🎨 Paint supplies → Brown placeholder
   - 💨 Gas cylinders → Red placeholder

## API Integration (Optional)

For better image results, you can add API keys for:

### Pixabay (Free)
1. Sign up at https://pixabay.com/api/docs/
2. Add your API key to the `_fetch_from_pixabay()` method

### Google Custom Search (Paid)
1. Create a Google Cloud project
2. Enable Custom Search API
3. Create a Custom Search Engine
4. Add keys to `_fetch_from_google_images()` method

## Logging

All operations are logged to `data_processor.log` with timestamps:

```
2024-01-15 10:30:15,123 - INFO - Starting Excel to database processing...
2024-01-15 10:30:16,456 - INFO - Successfully added 4 vendors and 285 products to database
2024-01-15 10:30:20,789 - INFO - Processing 1/50: Daikin Reefer Unit
2024-01-15 10:30:21,234 - INFO - ✓ Updated image for: Daikin Reefer Unit
```

## Troubleshooting

### Common Issues

**Excel file not found**
```
ERROR - Excel file not found: Vendor Category Matersheet Final.xlsx
```
→ Make sure the Excel file is in the same directory as the script

**CSV parsing errors**
```
ERROR - Required column not found: List of Items
```
→ Check that your CSV has the expected column headers

**Database errors**
```
ERROR - Error initializing database
```
→ Check file permissions and disk space

**Network issues**
```
WARNING - Unsplash fetch failed: Connection timeout
```
→ Check internet connection; the script will fall back to placeholders

### Debug Mode

For more detailed logging, change the logging level:

```python
logging.basicConfig(level=logging.DEBUG)  # Instead of INFO
```

## Performance Tips

1. **Batch Processing**: Script processes 50 products by default to avoid hitting API limits
2. **Caching**: Results are cached in `image_cache.json` - don't delete this file
3. **Rate Limiting**: 0.5 second delay between requests is built-in
4. **Backups**: Original files are backed up before modification

## Security Notes

- No API keys are required for basic functionality
- All data is stored locally in SQLite database
- No sensitive data is transmitted over the internet
- Image URLs are publicly accessible placeholder/stock images

## Support

Check the log file `data_processor.log` for detailed error information. The script is designed to be fault-tolerant and will continue processing even if some items fail.

For issues:
1. Check the log file for specific error messages
2. Verify file formats match expected structure
3. Ensure Python dependencies are correctly installed
4. Test with a smaller batch size first (`max_products=5`)

---

**Happy Data Processing! 🚀**

# Stock Manager

A comprehensive stock and inventory management system with purchase order generation and WhatsApp integration.

## Features

- **Inventory Management**: Track products, quantities, and stock levels
- **Purchase Orders**: Generate and manage purchase orders with PDF export
- **Supplier Management**: Maintain supplier information and contact details
- **Order Tracking**: Monitor orders from creation to fulfillment
- **WhatsApp Integration**: Send order updates via WhatsApp
- **PDF Generation**: Automatically generate professional PDF purchase orders

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **PDF Generation**: PDFKit
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- PostgreSQL
- Git

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Arzaan-k/Stock-Manager.git
   cd Stock-Manager
   ```

2. Install dependencies:
   ```bash
   # Install root dependencies
   npm install
   
   # Install client dependencies
   cd client
   npm install
   cd ..
   
   # Install server dependencies
   cd server
   npm install
   cd ..
   ```

3. Set up environment variables:
   - Create a `.env` file in the root directory
   - Copy the contents from `.env.example` and update with your configuration

4. Set up the database:
   - Create a PostgreSQL database
   - Update the database connection string in `.env`
   - Run migrations:
     ```bash
     cd server
     npx drizzle-kit push:pg
     ```

## Running the Application

1. Start the development server:
   ```bash
   # From the root directory
   npm run dev
   ```

2. The application will be available at:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## WhatsApp Cloud API Setup

Configure environment variables in the root `.env` (server reads from process.env):

- `WHATSAPP_WEBHOOK_TOKEN` – token you set when configuring the webhook on Meta
- `WHATSAPP_ACCESS_TOKEN` – permanent/long‑lived WhatsApp access token
- `WHATSAPP_PHONE_NUMBER_ID` – Business phone number ID from Meta
- `META_GRAPH_API_VERSION` – Graph API version (default `v20.0`)
- `GEMINI_API_KEY` – API key for Google Gemini

Webhook endpoints defined in `server/routes.ts`:
- GET `/api/whatsapp/webhook` – verification (uses `WHATSAPP_WEBHOOK_TOKEN`)
- POST `/api/whatsapp/webhook` – receives incoming messages (text/image)

The service implements sending messages and media download via Graph API in `server/services/whatsapp.ts`.

### Test Checklist

1. Set the env vars above in `.env`, restart server.
2. On Meta Developers, point the webhook to `https://<your-host>/api/whatsapp/webhook`.
3. Verify webhook (Meta sends a GET with `hub.*` query params).
4. Send a test text message to your business number – you should receive an AI reply.
5. Send an image – it will be analyzed; you’ll get detection + inventory lookup result.

## Project Structure

```
.
├── client/                 # Frontend React application
├── server/                 # Backend Node.js/Express server
│   ├── services/           # Business logic and services
│   └── routes.ts           # API routes
├── shared/                 # Shared types and utilities
├── migrations/             # Database migrations
└── .env                   # Environment variables
```

## Usage

1. **Add Products**: Navigate to the Products page and add your inventory items
2. **Create Orders**: Create new purchase orders and add products to them
3. **Generate PO**: Generate and download PDF purchase orders
4. **Manage Inventory**: Update stock levels and track inventory

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For any questions or feedback, please contact [Your Email] or open an issue on GitHub.
