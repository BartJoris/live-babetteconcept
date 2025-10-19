# Babette POS - Point of Sale Management System

A secure Next.js application for managing Babette's point of sale operations, product imports, and sales analytics integrated with Odoo.

## 🔒 Security Features

This application implements industry-standard security practices:

- **Session-based Authentication**: Secure server-side sessions using iron-session
- **Encrypted Credentials**: Passwords never stored in localStorage or client-side code
- **Protected API Routes**: All endpoints require authentication via middleware
- **Security Headers**: CSP, HSTS, X-Frame-Options, and more
- **Input Validation**: Zod schemas validate all user inputs
- **TypeScript Strict Mode**: Enhanced type safety across the codebase
- **Rate Limiting Ready**: Infrastructure for rate limiting sensitive endpoints

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Access to Odoo instance with API credentials
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pos-sessies
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example environment file:
   ```bash
   cp env.example .env.local
   ```

   Edit `.env.local` and configure the following required variables:

   ```env
   # Odoo Configuration
   ODOO_URL=https://your-odoo-instance.com/jsonrpc
   ODOO_DB=your_database_name
   ODOO_USERNAME=your_odoo_username
   ODOO_API_KEY=your_odoo_api_key

   # Session Secret (IMPORTANT: Generate a secure random string for production)
   # Generate using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   SESSION_SECRET=your_generated_secret_here

   # Optional: N8N Integration
   N8N_API_KEY=your_n8n_api_key
   ```

   **⚠️ IMPORTANT**: Never commit `.env.local` to version control!

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000) and log in with your Odoo credentials.

## 📁 Project Structure

```
pos-sessies/
├── components/          # React components (Navigation, etc.)
├── lib/
│   ├── hooks/          # Custom React hooks (useAuth)
│   ├── middleware/     # API middleware (withAuth)
│   ├── validation/     # Zod schemas for input validation
│   ├── odooClient.ts   # Centralized Odoo API client
│   └── session.ts      # Session configuration
├── pages/
│   ├── api/           # API routes (38 endpoints)
│   ├── index.tsx      # Login page
│   ├── dashboard.tsx  # Main dashboard
│   └── ...            # Other pages
├── styles/            # Global styles
├── public/            # Static assets
└── env.example        # Environment variables template
```

## 🔐 Authentication Flow

1. User submits credentials on login page
2. Server validates credentials with Odoo
3. Session created with encrypted credentials (iron-session)
4. Session cookie set (httpOnly, secure, sameSite=strict)
5. All API calls automatically authenticated via session
6. Logout destroys session and clears cookie

## 🛡️ Security Best Practices

### For Developers

1. **Never log sensitive data**: Avoid logging passwords, API keys, or session tokens
2. **Use the centralized Odoo client**: Always use `lib/odooClient.ts` for Odoo operations
3. **Protect new API routes**: Wrap handlers with `withAuth()` middleware
4. **Validate inputs**: Use Zod schemas for all user inputs
5. **Handle errors gracefully**: Never expose internal errors to clients

### For Production Deployment

1. **Generate a strong SESSION_SECRET**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Set NODE_ENV=production**

3. **Enable HTTPS**: The security headers expect HTTPS in production

4. **Review Vercel/deployment settings**: Ensure environment variables are properly configured

5. **Monitor logs**: Watch for failed login attempts and unusual API activity

## 📊 Features

- **Real-time POS Dashboard**: View current and past sales sessions
- **Product Import System**: Bulk import products with variants from CSV
- **Sales Analytics**: Yearly, monthly, and daily sales insights
- **Brand Management**: Track inventory and performance by brand
- **E-commerce Integration**: Manage online product listings
- **Image Management**: Upload and manage product images

## 🔧 API Routes

All API routes are protected with authentication middleware. Key endpoints:

- `/api/odoo-login` - User authentication
- `/api/logout` - Destroy session
- `/api/auth/session` - Check authentication status
- `/api/odoo-call` - Generic Odoo RPC calls
- `/api/import-products` - Bulk product import
- `/api/pos-sales` - Fetch POS sales data
- ... and 32 more endpoints

## 🧪 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

### TypeScript

The project uses strict TypeScript settings for enhanced type safety. See `tsconfig.json` for configuration.

## 📦 Key Dependencies

- **Next.js 15.5+**: React framework with API routes
- **React 19**: UI library
- **iron-session**: Secure session management
- **zod**: Schema validation
- **TailwindCSS 4**: Utility-first CSS
- **Chart.js**: Data visualization

## 🚨 Troubleshooting

### "Unauthorized" errors

- Ensure you're logged in
- Check that SESSION_SECRET is set
- Verify Odoo credentials are correct

### Session expires frequently

- Check browser cookie settings
- Verify SESSION_SECRET is consistent across deploys
- Sessions expire after 24 hours by default

### API calls failing

- Check Odoo connectivity
- Verify ODOO_URL and ODOO_DB in environment
- Check API credentials validity

## 📝 License

Private - All rights reserved

## 🤝 Contributing

This is a private project. Contact the repository owner for contribution guidelines.
