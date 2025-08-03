# Vercel Deployment Guide

## Overview
This guide will help you deploy your Node.js/Express API to Vercel successfully.

## Prerequisites
1. Vercel account (free tier available)
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
3. MySQL database (you can use PlanetScale, Railway, or any MySQL provider)

## Step 1: Prepare Your Environment Variables

Before deploying, make sure you have these environment variables ready:

```env
DATABASE_URL="mysql://username:password@host:port/database"
JWT_SECRET="your-super-secret-jwt-key"
CORS_ORIGINS="https://your-frontend-domain.com,http://localhost:3000"
PORT=3000
NODE_ENV=production
```

## Step 2: Deploy to Vercel

### Option A: Using Vercel CLI
1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

### Option B: Using Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your Git repository
4. Configure the project settings

## Step 3: Configure Environment Variables in Vercel

1. Go to your project dashboard in Vercel
2. Navigate to Settings → Environment Variables
3. Add all the environment variables from Step 1

## Step 4: Configure Build Settings

The project is already configured with:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## Step 5: Database Setup

### For Production Database:
1. Set up a MySQL database (PlanetScale, Railway, etc.)
2. Update your `DATABASE_URL` in Vercel environment variables
3. Run database migrations:
   ```bash
   npx prisma db push
   ```

### For Seeding Admin User:
After deployment, you can seed the admin user by:
1. Going to your Vercel function logs
2. Running the seed command manually or
3. Using a database management tool to insert the admin user

## Step 6: Verify Deployment

1. Check your deployment URL (e.g., `https://your-app.vercel.app`)
2. Test the health endpoint: `GET /api/health`
3. Test login: `POST /api/auth/login`
4. Check Swagger docs: `GET /api/docs`

## Troubleshooting

### Common Issues:

1. **"No Output Directory named 'public' found"**
   - ✅ **Fixed**: Added proper `vercel.json` configuration
   - The build now outputs to `dist/` directory

2. **Prisma Client not found**
   - ✅ **Fixed**: Build command now includes `prisma generate`
   - Ensure `DATABASE_URL` is set correctly

3. **Database connection errors**
   - Check your `DATABASE_URL` format
   - Ensure your database allows external connections
   - Verify network access from Vercel's servers

4. **CORS errors**
   - Update `CORS_ORIGINS` in environment variables
   - Include your frontend domain

### Build Logs
If deployment fails, check the build logs in Vercel dashboard for specific errors.

## Post-Deployment

1. **Test all endpoints** using the Swagger documentation
2. **Verify admin login** with `admin@nvccz.co.zw` / `admin123`
3. **Check database connectivity**
4. **Monitor function logs** for any runtime errors

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:3306/db` |
| `JWT_SECRET` | Secret for JWT tokens | `your-secret-key-here` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `https://app.com,http://localhost:3000` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `production` |

## Support

If you encounter issues:
1. Check Vercel function logs
2. Verify environment variables
3. Test database connectivity
4. Review build logs for compilation errors

The application is now properly configured for Vercel deployment with the correct build process and output directory. 