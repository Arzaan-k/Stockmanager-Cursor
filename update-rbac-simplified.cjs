require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function updateRBACSimplified() {
  try {
    console.log('🔄 Updating RBAC system to admin and employee only...');
    
    // Clear existing role permissions
    console.log('Clearing existing role permissions...');
    await sql`DELETE FROM role_permissions WHERE role NOT IN ('admin', 'employee')`;
    
    // Update permissions for employee role (only products, vendors, and orders)
    console.log('Setting up employee permissions (products, vendors, cart, orders)...');
    await sql`DELETE FROM role_permissions WHERE role = 'employee'`;
    
    await sql`
      INSERT INTO role_permissions (role, permission_id)
      SELECT 'employee', id FROM permissions 
      WHERE (resource = 'vendors' AND action = 'read')
         OR (resource = 'products' AND action = 'read')
         OR (resource = 'orders' AND action IN ('read', 'create'))
         OR (resource = 'system' AND action = 'access')
      ON CONFLICT (role, permission_id) DO NOTHING
    `;

    // Ensure admin has all permissions
    console.log('Ensuring admin has all permissions...');
    await sql`DELETE FROM role_permissions WHERE role = 'admin'`;
    
    await sql`
      INSERT INTO role_permissions (role, permission_id)
      SELECT 'admin', id FROM permissions
      ON CONFLICT (role, permission_id) DO NOTHING
    `;

    // Create shopping cart table
    console.log('Creating shopping cart table...');
    await sql`
      CREATE TABLE IF NOT EXISTS shopping_cart (
        id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
        user_id VARCHAR NOT NULL,
        product_id VARCHAR NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        CONSTRAINT shopping_cart_user_product_unique UNIQUE (user_id, product_id)
      )
    `;

    // Update existing users to have proper roles (admin or employee only)
    console.log('Updating user roles to admin or employee only...');
    await sql`
      UPDATE users 
      SET role = CASE 
        WHEN username = 'admin' THEN 'admin'
        ELSE 'employee'
      END
      WHERE role NOT IN ('admin', 'employee')
    `;

    console.log('\n✅ RBAC system updated successfully!');
    console.log('\n📋 Current system setup:');
    console.log('👑 Admin Role: Full access to all features');
    console.log('👥 Employee Role: Access to products, vendors, and ordering only');
    console.log('\n🛒 Shopping cart functionality added');
    console.log('🔐 All other roles removed for simplicity');

  } catch (error) {
    console.error('❌ Error during RBAC update:', error);
    throw error;
  }
}

// Run the update
updateRBACSimplified()
  .then(() => {
    console.log('RBAC update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('RBAC update failed:', error);
    process.exit(1);
  });
