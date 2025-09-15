# Role-Based Access Control (RBAC) System

## Overview

This system now includes a complete role-based access control implementation that allows employees to register themselves and access vendors, product catalog, and create orders with proper permission controls.

## User Roles

### 1. **Admin**
- Full access to all resources
- Can manage users, vendors, products, orders, and inventory
- Has all permissions

### 2. **Manager**
- Most permissions except delete operations
- Can view and manage vendors, products, orders
- Cannot delete resources

### 3. **Employee** (Target Role)
- Limited access focused on ordering workflow
- **Permissions:**
  - View vendors (read-only access to vendor catalog)
  - View products (read-only access to product catalog)
  - Create and view orders
  - Basic system access

### 4. **Viewer**
- Read-only access to all resources
- Cannot create, update, or delete anything

## Employee Features

### Self-Registration
Employees can register themselves using:
- **Endpoint:** `POST /api/auth/employee-register`
- **Required fields:** `name`, `email`, `mobile`, `password`
- Automatically assigned `employee` role

### Access Capabilities
Employees have access to these endpoints:

#### Vendor Access (Read-Only)
- `GET /api/employee/vendors` - List all active vendors
- `GET /api/employee/vendors/:id` - Get vendor details with products

#### Product Catalog Access (Read-Only)
- `GET /api/employee/products` - List all products
- `GET /api/employee/products/search?q=term` - Search products
- `POST /api/employee/stock/check` - Check stock levels for products

#### Order Management
- `POST /api/employee/orders` - Create new orders
- `GET /api/employee/orders` - View their orders
- `GET /api/employee/orders/:id` - View specific order details

#### Profile & Dashboard
- `GET /api/employee/profile` - View profile and permissions
- `GET /api/employee/dashboard` - Limited dashboard stats

## Authentication

### Login
- **Endpoint:** `POST /api/auth/login`
- **Payload:** `{ "username": "employee", "password": "employee123" }`
- **Response:** Returns user info with role and permissions + auth token

### Using the Token
Include the token in requests:
```
Authorization: Bearer mock-jwt-token
X-User: employee  (for development)
```

## Test Accounts

### Pre-created Employee Account
- **Username:** `employee`
- **Password:** `employee123`
- **Email:** `employee@example.com`
- **Mobile:** `+1234567890`

## API Examples

### 1. Employee Registration
```bash
curl -X POST http://localhost:5000/api/auth/employee-register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@company.com",
    "mobile": "+1234567890",
    "password": "password123"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "employee",
    "password": "employee123"
  }'
```

### 3. Access Vendor Catalog
```bash
curl http://localhost:5000/api/employee/vendors \
  -H "Authorization: Bearer mock-jwt-token" \
  -H "X-User: employee"
```

### 4. Create Order
```bash
curl -X POST http://localhost:5000/api/employee/orders \
  -H "Authorization: Bearer mock-jwt-token" \
  -H "X-User: employee" \
  -H "Content-Type: application/json" \
  -d '{
    "order": {
      "customerName": "Internal Order",
      "total": "100.00",
      "subtotal": "90.00",
      "tax": "10.00",
      "notes": "Employee order for office supplies"
    },
    "items": [{
      "productId": "product-uuid-here",
      "quantity": 2,
      "unitPrice": "45.00",
      "totalPrice": "90.00"
    }]
  }'
```

## Database Tables

The RBAC system adds these new tables:

### `permissions`
- Defines available system permissions
- Links resources (vendors, products, orders) with actions (read, create, update, delete)

### `role_permissions`
- Maps roles to specific permissions
- Defines what each role can do

### `users` (enhanced)
- Added `mobile` field for employee registration
- Enhanced role support

## Security Features

1. **Permission-based access control** - Every endpoint checks specific permissions
2. **Role isolation** - Employees can only access what they need
3. **Self-registration validation** - Email and mobile format validation
4. **Automatic role assignment** - New registrations get employee role
5. **Order attribution** - Orders created by employees are tagged with creator info

## Development Notes

- In development, the system uses mock JWT tokens for simplicity
- For production, implement proper JWT signing and validation
- Phone/mobile fields support international formats
- All employee actions are logged with user attribution
- Orders requiring approval (out-of-stock items) are automatically flagged

## Future Enhancements

1. **Email verification** for employee registration
2. **Password hashing** using bcrypt
3. **Role management UI** for admins
4. **Permission customization** per employee
5. **Order approval workflow** for managers
6. **Activity logging** and audit trails
