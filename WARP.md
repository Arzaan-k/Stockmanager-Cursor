# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Setup and Installation
```bash
# Install all dependencies
npm install

# Set up environment variables
# Create .env file based on .env.example (if exists)

# Set up database
npm run db:push
```

### Development Server
```bash
# Start development server (both frontend and backend)
npm run dev

# TypeScript type checking
npm run check

# Build for production
npm run build

# Start production server
npm run start
```

### Database Management
```bash
# Push database schema changes
npm run db:push

# Generate new migration (using drizzle-kit)
npx drizzle-kit generate

# Push schema changes to database
npx drizzle-kit push
```

### Testing and Development
```bash
# Test database connection
node test-db-connection.js

# Test HTTP endpoints
tsx test-http.ts

# Run simple server test
node simple-server.js
```

## Architecture Overview

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with Radix UI components
- **PDF Generation**: PDFKit
- **AI Integration**: Google Gemini AI
- **WhatsApp Integration**: WhatsApp Cloud API

### Project Structure
```
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   └── ui/            # Radix UI component library
├── server/                 # Express backend server
│   ├── services/          # Business logic services
│   │   ├── whatsapp.ts    # WhatsApp Cloud API integration
│   │   ├── gemini.ts      # AI-powered inventory parsing
│   │   └── po.ts          # PDF purchase order generation
│   ├── db.ts              # Database connection setup
│   ├── storage.ts         # Database operations layer
│   └── routes.ts          # API route definitions
├── shared/                 # Shared TypeScript types and schemas
│   └── schema.ts          # Drizzle database schema
├── migrations/            # Database migrations
└── .env                   # Environment configuration
```

### Key Backend Services

#### WhatsApp Integration (`server/services/whatsapp.ts`)
- Handles WhatsApp Cloud API webhook verification and message processing
- Supports automatic token refresh for expired access tokens
- Processes incoming text and image messages with AI analysis
- Maintains conversation state and message history

#### AI Service (`server/services/gemini.ts`)
- Uses Google Gemini AI for natural language processing
- Parses inventory commands from WhatsApp messages
- Analyzes product images for inventory identification
- Supports structured data extraction from text commands

#### PDF Generation (`server/services/po.ts`)
- Generates purchase order PDFs using PDFKit
- Streams PDF responses for both viewing and downloading
- Includes company branding and formatted order details

#### Database Layer (`server/storage.ts`)
- Centralized database operations using Drizzle ORM
- Handles complex queries for dashboard analytics
- Manages stock movements and audit trails
- Supports advanced filtering and search operations

### Database Schema

#### Core Entities
- **Products**: Complete inventory management with extended business fields (crystal part codes, MFG codes, usage metrics)
- **Orders**: Purchase orders with approval workflow and GRN (Goods Receipt Note) integration
- **Warehouses**: Multi-location stock tracking with warehouse-specific inventory
- **Customers**: Customer relationship management
- **Users**: Role-based authentication (admin, staff, viewer, customer)

#### WhatsApp Tables
- **whatsapp_conversations**: Per-phone conversation tracking with status management
- **whatsapp_messages**: Full message history with metadata
- **whatsapp_logs**: Action logging for audit trails

#### Workflow Tables
- **grns**: Goods Receipt Notes linked to orders
- **grn_items**: Line items for GRN records
- **stock_movements**: Complete audit trail for all stock changes

### Frontend Architecture
- **Component Library**: Radix UI with custom Tailwind styling
- **State Management**: TanStack React Query for server state
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation

## Important Environment Variables

### Required Configuration
```env
DATABASE_URL=postgresql://...
PORT=5000

# WhatsApp Cloud API
WHATSAPP_WEBHOOK_TOKEN=your_webhook_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
META_GRAPH_API_VERSION=v20.0

# AI Integration
GEMINI_API_KEY=your_gemini_api_key
```

## Development Patterns

### API Route Structure
- Authentication endpoints: `/api/auth/*`
- RESTful resource routes: `/api/{resource}`, `/api/{resource}/:id`
- Specialized actions: `/api/{resource}/:id/{action}`
- WhatsApp webhooks: `/api/whatsapp/*`

### Database Operations
- Use Drizzle ORM with TypeScript for type safety
- Centralize database operations in `server/storage.ts`
- Use schema validation with Zod for all inputs
- Maintain audit trails via `stock_movements` table

### Error Handling
- Use try-catch blocks with proper error logging
- Return structured JSON error responses
- Validate inputs using Zod schemas
- Log errors with context for debugging

### File Organization
- Shared types and schemas in `shared/` directory
- Business logic in `server/services/`
- UI components follow Radix UI patterns
- Path aliases: `@/` for client src, `@shared/` for shared directory

## Key Features to Understand

### WhatsApp Integration
- Automatic message processing with AI analysis
- Token management with automatic refresh
- Conversation state management
- Image analysis for product identification
- See WHATSAPP_SETUP.md for detailed setup instructions

### Approval Workflow
- Orders require approval before fulfillment
- GRN (Goods Receipt Note) integration
- Multi-step status tracking (pending → needs_approval → approved)
- Audit trail maintenance

### Stock Management
- Multi-warehouse support
- Real-time stock tracking
- Low stock alerts
- Historical movement tracking
- CSV import functionality

### Dashboard Analytics
- Real-time inventory statistics
- Recent stock movements
- Low stock product alerts
- Order status summaries

## Development Tips

### Database Changes
- Always run `npm run db:push` after schema changes
- Test database operations with isolated scripts
- Use transactions for multi-table operations

### WhatsApp Testing
- Use the test endpoint `/api/test/nlp-parse` for AI parsing
- Monitor logs in `/api/whatsapp/logs` for debugging
- Test webhook verification before production deployment

### Frontend Development
- Use existing UI components from `client/src/components/ui/`
- Follow Tailwind CSS conventions
- Leverage React Query for API integration
- Use Zod schemas for form validation
