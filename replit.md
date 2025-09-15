# StockSmart - Smart Inventory Management System

## Overview

StockSmart is a comprehensive inventory and order management system designed for small to medium businesses managing spare parts, warehouses, or distribution operations. The application provides a Shopify-like interface with smart features including AI-powered WhatsApp integration for inventory updates, PWA support for offline/online functionality, and real-time analytics for stock tracking and usage monitoring.

The system enables businesses to efficiently manage products, track stock levels across multiple warehouses, process orders, and leverage AI assistance for inventory management through WhatsApp messaging with image recognition capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack React Query for server state and local React hooks for client state
- **Routing**: Wouter for lightweight client-side routing
- **PWA Support**: Service workers for offline functionality and app-like experience
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for type safety across the stack
- **Database ORM**: Drizzle ORM for type-safe database operations
- **API Design**: RESTful APIs with structured error handling and logging middleware
- **Authentication**: Session-based authentication with role-based access control

### Database Design
- **Database**: PostgreSQL with Neon serverless hosting
- **Schema**: Comprehensive relational design covering:
  - Users with role-based permissions (admin, staff, viewer, customer)
  - Products with SKU tracking, stock levels, and metadata
  - Warehouses with location tracking and GPS coordinates
  - Orders with customer information and item details
  - Stock movements for audit trails and analytics
  - WhatsApp logs for AI interaction tracking

### AI Integration
- **Image Recognition**: OpenAI GPT-5 for product identification from images
- **OCR/Barcode**: Automated product recognition and SKU generation
- **Conversational AI**: Smart WhatsApp bot for inventory updates and order creation
- **Product Analysis**: AI-powered categorization and naming suggestions

### Progressive Web App Features
- **Offline Support**: Service worker caching for critical app functionality
- **Mobile Optimization**: Responsive design with touch-friendly interfaces
- **App Installation**: Web app manifest for native-like installation experience
- **Push Notifications**: Real-time updates for inventory changes and order status

### External Integrations
- **WhatsApp Business API**: Real-time messaging for inventory management
- **Image Processing**: AI-powered product recognition from photos
- **GPS/Location Services**: Warehouse location tracking and management

## External Dependencies

### Core Infrastructure
- **Database**: Neon PostgreSQL serverless database
- **Authentication**: Custom session-based auth with role management
- **File Storage**: Local/cloud storage for product images

### AI and ML Services
- **OpenAI API**: GPT-5 for image analysis and conversational AI
- **Image Recognition**: Product identification and categorization
- **OCR Services**: Barcode and text recognition from images

### Communication APIs
- **WhatsApp Business API**: Real-time messaging integration
- **Webhook Services**: Automated message processing and responses

### Development and Deployment
- **Build Tools**: Vite for frontend bundling and esbuild for backend
- **TypeScript**: Full-stack type safety and development experience
- **React Query**: Server state management and caching
- **Tailwind CSS**: Utility-first styling framework

### UI and UX Libraries
- **Radix UI**: Accessible component primitives
- **Lucide React**: Icon library for consistent iconography
- **React Hook Form**: Form handling with Zod validation
- **Date-fns**: Date manipulation and formatting utilities