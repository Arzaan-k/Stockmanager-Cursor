const XLSX = require('xlsx');
const path = require('path');

// Read the Excel file
const filePath = path.join(__dirname, 'Vendor Category Matersheet Final.xlsx');
console.log('Reading file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);
  console.log('Sheet names:', workbook.SheetNames);
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log('Total rows found:', data.length);
  console.log('\nFirst 3 rows:');
  console.log(JSON.stringify(data.slice(0, 3), null, 2));
  
  // Check column names
  if (data.length > 0) {
    console.log('\nColumn names found:');
    console.log(Object.keys(data[0]));
  }
  
  // Count non-empty vendor names
  const validVendors = data.filter(row => row['Vendor Name'] || row['VENDOR NAME']);
  console.log('\nVendors with names:', validVendors.length);
  
} catch (error) {
  console.error('Error reading Excel file:', error.message);
}
