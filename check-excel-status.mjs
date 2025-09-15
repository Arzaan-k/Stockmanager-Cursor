import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the Excel file
const filePath = join(__dirname, 'Vendor Category Matersheet Final.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = 'Master Sheet';
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet);

console.log(`Total rows in Excel: ${data.length}\n`);

// Count different statuses
const statusCounts = {};
const statusExamples = {};

data.forEach(row => {
  const status = row['Status Of Vendor'];
  if (status !== undefined && status !== null && status !== '') {
    const statusStr = String(status).trim();
    if (!statusCounts[statusStr]) {
      statusCounts[statusStr] = 0;
      statusExamples[statusStr] = [];
    }
    statusCounts[statusStr]++;
    if (statusExamples[statusStr].length < 3) {
      statusExamples[statusStr].push(row['Vendor Name']);
    }
  } else {
    if (!statusCounts['(empty)']) {
      statusCounts['(empty)'] = 0;
      statusExamples['(empty)'] = [];
    }
    statusCounts['(empty)']++;
    if (statusExamples['(empty)'].length < 3) {
      statusExamples['(empty)'].push(row['Vendor Name']);
    }
  }
});

console.log('Status distribution in Excel:\n');
console.log('=' .repeat(50));

Object.entries(statusCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([status, count]) => {
    console.log(`\n"${status}": ${count} vendors`);
    console.log(`  Examples: ${statusExamples[status].slice(0, 3).join(', ')}`);
  });

console.log('\n' + '=' .repeat(50));

// Check for "Active" vendors specifically
const activeVendors = data.filter(row => {
  const status = row['Status Of Vendor'];
  if (!status) return false;
  const statusLower = String(status).toLowerCase().trim();
  return statusLower === 'active';
});

console.log(`\nActive vendors found: ${activeVendors.length}`);
if (activeVendors.length > 0) {
  console.log('\nFirst 10 active vendors:');
  activeVendors.slice(0, 10).forEach(vendor => {
    console.log(`  - ${vendor['Vendor Name']} (Status: "${vendor['Status Of Vendor']}")`);
  });
}
