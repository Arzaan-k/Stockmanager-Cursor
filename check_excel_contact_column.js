import XLSX from 'xlsx';

// Read Excel file and check Contact Number column
const workbook = XLSX.readFile('Vendor Category Matersheet Final.xlsx');
const worksheet = workbook.Sheets['Master Sheet'];
const excelData = XLSX.utils.sheet_to_json(worksheet);

console.log('📋 Checking Contact Number column in Excel...\n');

// Show first 10 rows to understand the data structure
console.log('First 10 rows with Contact Number data:');
excelData.slice(0, 10).forEach((row, index) => {
  const vendorName = row['Vendor Name'];
  const contactNumber = row['Contact Number'];
  
  console.log(`${index + 1}. ${vendorName}`);
  console.log(`   Contact Number: "${contactNumber}"`);
  console.log(`   Type: ${typeof contactNumber}`);
  console.log(`   Raw Value: ${JSON.stringify(contactNumber)}\n`);
});

// Check for any non-null contact numbers
const rowsWithContact = excelData.filter(row => 
  row['Contact Number'] && 
  row['Contact Number'] !== 'nan' && 
  row['Contact Number'] !== 'NaN' &&
  String(row['Contact Number']).trim() !== ''
);

console.log(`\n📊 Found ${rowsWithContact.length} rows with contact information out of ${excelData.length} total rows\n`);

// Show some examples with contact info
console.log('Examples with contact information:');
rowsWithContact.slice(0, 5).forEach((row, index) => {
  console.log(`${index + 1}. ${row['Vendor Name']}`);
  console.log(`   Contact: "${row['Contact Number']}"`);
  console.log(`   Type: ${typeof row['Contact Number']}\n`);
});
