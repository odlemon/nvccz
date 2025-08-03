# Authentication API

A simplified authentication API built with Express, TypeScript, Prisma, and MySQL.

## Features

- User login with JWT authentication
- Get current user information
- MySQL database with Prisma ORM
- TypeScript support
- Express.js framework

## Prerequisites

- Node.js (v16 or higher)
- MySQL database
- npm or yarn

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nvcc
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the root directory with the following variables:
   ```env
   # Database Configuration
   DATABASE_URL="mysql://username:password@localhost:3306/your_database_name"
   
   # JWT Configuration
   JWT_SECRET="your-super-secret-jwt-key-here"
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run prisma:generate
   
   # Run database migrations
   npm run prisma:migrate
   
   # Or push schema directly (for development)
   npm run prisma:db:push
   
   # Seed the database with admin user
   npm run prisma:seed
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
  - Body: `{ "email": "admin@nvccz.co.zw", "password": "admin123" }`
  - Returns: JWT token and user information

- `GET /api/auth/me` - Get current user info (requires authentication)
  - Headers: `Authorization: Bearer <jwt_token>`
  - Returns: Current user information

### Health Check

- `GET /health` - Server health check
  - Returns: Server status and database connection info

## Database Schema

The application uses two main tables:

- **users** - User accounts with authentication details
- **roles** - User roles and permissions (dynamic, not enums)

## Development

- **Prisma Studio**: `npm run prisma:studio` - Open database GUI
- **Seed Database**: `npm run prisma:seed` - Create admin user
- **Linting**: `npm run lint` - Run ESLint
- **Formatting**: `npm run format` - Run Prettier

## 📚 API Documentation

The API includes comprehensive Swagger documentation for easy testing and integration.

### Access Swagger UI
Once the server is running, visit:
```
http://localhost:3000/api-docs
```

### Features
- **Interactive Testing** - Test all endpoints directly from the browser
- **Authentication Setup** - Easy JWT token management
- **Request/Response Examples** - Complete examples for all endpoints
- **Schema Validation** - Automatic validation of request data
- **Error Documentation** - All possible error responses

### Quick Start with Swagger
1. Start the server: `npm run dev`
2. Open: `http://localhost:3000/api-docs`
3. Login with admin credentials to get a JWT token
4. Click "Authorize" and enter: `Bearer YOUR_TOKEN`
5. Test any endpoint with "Try it out"

For detailed Swagger usage instructions, see [SWAGGER_GUIDE.md](./SWAGGER_GUIDE.md)

## Project Structure

```
src/
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── routes/          # API routes
├── utils/           # Utility functions
└── app.ts          # Main application file
```

## License

ISC

