import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function checkContact() {
  // First check schema
  const schema = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'vendors' 
    ORDER BY column_name
  `;
  
  console.log('Vendors table columns:');
  schema.forEach(col => console.log(`- ${col.column_name}: ${col.data_type}`));
  console.log();
  
  // Check specific vendors
  const vendors = await sql`
    SELECT name, full_contact_info, contact_number
    FROM vendors 
    WHERE name IN ('Aakash Universal Limited', 'Shree Salasar Marbles Impex Pvt Ltd', 'AirflowControl')
    ORDER BY name
  `;
  
  console.log('Current database contact info:');
  vendors.forEach(v => {
    console.log(`${v.name}:`);
    console.log(`  Contact Number: ${v.contact_number}`);
    console.log(`  Full Contact Info: ${v.full_contact_info}`);
    console.log();
  });
}

checkContact();
