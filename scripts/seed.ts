import 'dotenv/config';
import { storage } from '../server/storage';
import { vendors, vendorContacts } from '../migrations/vendor-schema';
import { db } from '../server/db';

async function seedData() {
  console.log('🌱 Starting data seeding...');
  
  try {
    // Initialize permissions first
    console.log('Initializing permissions...');
    await storage.initializePermissions();
    
    // Create sample users with different roles
    console.log('Creating sample users...');
    
    const users = [
      {
        username: 'admin',
        email: 'admin@stocksmarthub.com',
        password: 'admin123',
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User'
      },
      {
        username: 'manager',
        email: 'manager@stocksmarthub.com', 
        password: 'manager123',
        role: 'manager',
        firstName: 'Jane',
        lastName: 'Manager'
      },
      {
        username: 'employee1',
        email: 'employee1@stocksmarthub.com',
        password: 'employee123',
        role: 'employee', 
        firstName: 'John',
        lastName: 'Employee'
      },
      {
        username: 'employee2',
        email: 'employee2@stocksmarthub.com',
        password: 'employee123',
        role: 'employee',
        firstName: 'Sarah',
        lastName: 'Worker'
      },
      {
        username: 'viewer',
        email: 'viewer@stocksmarthub.com',
        password: 'viewer123', 
        role: 'viewer',
        firstName: 'View',
        lastName: 'Only'
      }
    ];

    for (const userData of users) {
      const existingUser = await storage.getUserByUsername(userData.username);
      if (!existingUser) {
        await storage.createUser(userData as any);
        console.log(`✓ Created user: ${userData.username} (${userData.role})`);
      } else {
        console.log(`- User already exists: ${userData.username}`);
      }
    }

    // Create sample warehouses
    console.log('Creating sample warehouses...');
    const warehouseData = [
      {
        name: 'Main Warehouse',
        location: 'Downtown',
        address: '123 Industrial Street, City Center',
      },
      {
        name: 'Secondary Storage',
        location: 'Suburb',
        address: '456 Storage Avenue, Suburban Area',
      }
    ];

    const createdWarehouses = [];
    for (const warehouse of warehouseData) {
      const created = await storage.createWarehouse(warehouse);
      createdWarehouses.push(created);
      console.log(`✓ Created warehouse: ${warehouse.name}`);
    }

    // Create sample products
    console.log('Creating sample products...');
    const productData = [
      {
        sku: 'BOLT-001',
        name: 'Steel Bolt M8x20',
        description: 'High-grade steel bolt, 8mm diameter, 20mm length',
        type: 'Fasteners',
        price: '0.50',
        stockTotal: 1000,
        stockUsed: 200,
        stockAvailable: 800,
        minStockLevel: 100,
        units: 'pieces'
      },
      {
        sku: 'BOLT-002', 
        name: 'Steel Bolt M10x25',
        description: 'High-grade steel bolt, 10mm diameter, 25mm length',
        type: 'Fasteners',
        price: '0.75',
        stockTotal: 500,
        stockUsed: 50,
        stockAvailable: 450,
        minStockLevel: 50,
        units: 'pieces'
      },
      {
        sku: 'WASHER-001',
        name: 'Steel Washer M8',
        description: 'Steel washer for M8 bolts',
        type: 'Fasteners',
        price: '0.10',
        stockTotal: 2000,
        stockUsed: 400,
        stockAvailable: 1600,
        minStockLevel: 200,
        units: 'pieces'
      },
      {
        sku: 'GEAR-001',
        name: 'Industrial Gear 24T',
        description: '24-tooth industrial gear, hardened steel',
        type: 'Mechanical',
        price: '45.00',
        stockTotal: 50,
        stockUsed: 10,
        stockAvailable: 40,
        minStockLevel: 5,
        units: 'pieces'
      },
      {
        sku: 'MOTOR-001',
        name: 'AC Motor 1HP',
        description: '1 Horsepower AC motor, 1800 RPM',
        type: 'Electrical',
        price: '250.00',
        stockTotal: 20,
        stockUsed: 5,
        stockAvailable: 15,
        minStockLevel: 3,
        units: 'pieces'
      },
      {
        sku: 'WIRE-001',
        name: 'Electrical Wire 12AWG',
        description: '12 AWG electrical wire, copper core',
        type: 'Electrical',
        price: '1.50',
        stockTotal: 500,
        stockUsed: 100,
        stockAvailable: 400,
        minStockLevel: 50,
        units: 'meters'
      }
    ];

    const createdProducts = [];
    for (const product of productData) {
      const created = await storage.createProduct(product as any);
      createdProducts.push(created);
      console.log(`✓ Created product: ${product.name} (${product.sku})`);
      
      // Add stock to warehouses
      if (createdWarehouses.length > 0) {
        const stockPerWarehouse = Math.floor(product.stockTotal / createdWarehouses.length);
        for (let i = 0; i < createdWarehouses.length; i++) {
          const warehouse = createdWarehouses[i];
          const stockAmount = i === 0 ? product.stockTotal - (stockPerWarehouse * (createdWarehouses.length - 1)) : stockPerWarehouse;
          await storage.updateWarehouseStock(created.id, warehouse.id, stockAmount);
        }
      }
    }

    // Create sample vendors
    console.log('Creating sample vendors...');
    const vendorData = [
      {
        name: 'Industrial Supply Co.',
        mainCategory: 'Manufacturing',
        subcategory: 'Fasteners',
        productType: 'Bolts & Screws',
        productCode: 'ISC-001',
        contactNumber: '+1-555-0101',
        email: 'orders@industrialsupply.com',
        location: 'Industrial District',
        address: '789 Factory Road',
        city: 'Industrial City',
        state: 'State A',
        zone: 'North',
        status: 'active' as any,
        rating: '4.5'
      },
      {
        name: 'MechParts Ltd.',
        mainCategory: 'Engineering',
        subcategory: 'Gears',
        productType: 'Mechanical Components',
        productCode: 'MPL-002',
        contactNumber: '+1-555-0102', 
        email: 'sales@mechparts.com',
        location: 'Tech Park',
        address: '321 Engineering Blvd',
        city: 'Tech City',
        state: 'State B',
        zone: 'South',
        status: 'active' as any,
        rating: '4.8'
      },
      {
        name: 'ElectroMax Solutions',
        mainCategory: 'Electrical',
        subcategory: 'Motors',
        productType: 'AC Motors',
        productCode: 'EMS-003',
        contactNumber: '+1-555-0103',
        email: 'info@electromax.com',
        location: 'Electric Avenue',
        address: '654 Power Street',
        city: 'Electric City',
        state: 'State C', 
        zone: 'East',
        status: 'active' as any,
        rating: '4.2'
      }
    ];

    for (const vendorInfo of vendorData) {
      try {
        const [createdVendor] = await db.insert(vendors).values(vendorInfo).returning();
        console.log(`✓ Created vendor: ${vendorInfo.name}`);
        
        // Add vendor contact
        await db.insert(vendorContacts).values({
          vendorId: createdVendor.id,
          name: `${vendorInfo.name} Sales`,
          designation: 'Sales Representative',
          phone: vendorInfo.contactNumber,
          email: vendorInfo.email,
          isPrimary: true
        });
        console.log(`✓ Added contact for vendor: ${vendorInfo.name}`);
      } catch (error) {
        console.error(`Error creating vendor ${vendorInfo.name}:`, error);
      }
    }

    // Create sample customers
    console.log('Creating sample customers...');
    const customerData = [
      {
        name: 'ABC Manufacturing',
        email: 'purchasing@abcmfg.com',
        phone: '+1-555-1001',
        address: '100 Manufacturing Lane',
        city: 'Industrial City'
      },
      {
        name: 'XYZ Engineering',
        email: 'orders@xyzeng.com', 
        phone: '+1-555-1002',
        address: '200 Engineering Drive',
        city: 'Tech City'
      }
    ];

    const createdCustomers = [];
    for (const customer of customerData) {
      const created = await storage.createCustomer(customer);
      createdCustomers.push(created);
      console.log(`✓ Created customer: ${customer.name}`);
    }

    // Create sample orders
    console.log('Creating sample orders...');
    if (createdCustomers.length > 0 && createdProducts.length > 0) {
      const orderData = {
        customerName: createdCustomers[0].name,
        customerEmail: createdCustomers[0].email,
        customerPhone: createdCustomers[0].phone,
        total: '127.50',
        subtotal: '115.00',
        tax: '12.50',
        notes: 'Sample order for testing'
      };

      const orderItems = [
        {
          productId: createdProducts[0].id,
          quantity: 50,
          unitPrice: '0.50',
          totalPrice: '25.00'
        },
        {
          productId: createdProducts[3].id,
          quantity: 2,
          unitPrice: '45.00', 
          totalPrice: '90.00'
        }
      ];

      const createdOrder = await storage.createOrder(orderData as any, orderItems as any);
      console.log(`✓ Created sample order: ${createdOrder.orderNumber}`);
    }

    console.log('\n🎉 Data seeding completed successfully!');
    console.log('\nDefault login credentials:');
    console.log('Admin: admin / admin123');
    console.log('Manager: manager / manager123');  
    console.log('Employee: employee1 / employee123');
    console.log('Employee: employee2 / employee123');
    console.log('Viewer: viewer / viewer123');

  } catch (error) {
    console.error('❌ Error during data seeding:', error);
    throw error;
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedData()
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedData };
