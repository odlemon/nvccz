# Environment Variables Configuration

This document contains the environment variable configurations for both **Production** and **Development** environments.

---

## 📋 Overview

- **Production**: Uses `NVCCZ` branding and `app.kyntaro.com` URLs
- **Development**: Uses `Niakazi` branding and `dev.app.kyntaro.com` URLs

---

## 🚀 Production Environment (.env.production)

```bash
# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL="mysql://username:password@localhost:3306/nvccz_production"

# ============================================
# JWT CONFIGURATION
# ============================================
JWT_SECRET="your-production-jwt-secret-key-here"

# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=3000
NODE_ENV=production

# ============================================
# CORS ORIGINS
# ============================================
CORS_ORIGINS="http://app.kyntaro.com,https://app.kyntaro.com"

# ============================================
# FRONTEND URL (used in email links)
# ============================================
FRONTEND_URL="http://app.kyntaro.com"

# ============================================
# API URL
# ============================================
API_URL="https://nvccz-pi.vercel.app/api"

# ============================================
# EMAIL FROM NAMES
# ============================================
EMAIL_FROM_NAME_INVESTMENT="NVCCZ Investment Team"
EMAIL_FROM_NAME_PAYROLL="NVCCZ Payroll Team"
EMAIL_FROM_NAME_PROCUREMENT="NVCCZ Procurement Team"
EMAIL_FROM_NAME_FINANCE="NVCCZ Finance Team"
EMAIL_FROM_NAME_EVENTS="NVCCZ Events Team"
EMAIL_FROM_NAME_IT="NVCCZ IT Team"
EMAIL_FROM_NAME_PLATFORM="NVCCZ Investment Platform"
EMAIL_FROM_NAME_DEFAULT="NVCCZ Notifications"

# ============================================
# CONTACT EMAIL ADDRESSES
# ============================================
EMAIL_CONTACT_PROCUREMENT="procurement@nvccz.com"
EMAIL_CONTACT_FINANCE="finance@nvccz.com"
EMAIL_ADMIN="admin@nvccz.co.zw"
EMAIL_SUPPLIERS="suppliers@nvccz.co.zw"
EMAIL_SUPPORT="support@nvccz.co.zw"

# ============================================
# COMPANY INFORMATION
# ============================================
COMPANY_NAME_FULL="National Venture Capital Company of Zimbabwe"
COMPANY_NAME_SHORT="NVCCZ"

# ============================================
# PORTAL URLs
# ============================================
EVENTS_PORTAL_URL="http://app.kyntaro.com"
PROCUREMENT_PORTAL_URL="http://app.kyntaro.com"

# ============================================
# UPLOAD SERVICE URLs
# ============================================
UPLOAD_SERVICE_URL="http://31.220.82.129:3050/upload"
MEDIA_BASE_URL="http://31.220.82.129/uploads"

# ============================================
# SENTRY CONFIGURATION
# ============================================
SENTRY_DSN="https://your-sentry-dsn@sentry.io/project-id"
```

---

## 🛠️ Development Environment (.env.development)

```bash
# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL="mysql://username:password@localhost:3306/niakazi_development"

# ============================================
# JWT CONFIGURATION
# ============================================
JWT_SECRET="your-development-jwt-secret-key-here"

# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=3000
NODE_ENV=development

# ============================================
# CORS ORIGINS
# ============================================
CORS_ORIGINS="http://dev.app.kyntaro.com,https://dev.app.kyntaro.com,http://localhost:3000,http://localhost:3001"

# ============================================
# FRONTEND URL (used in email links)
# ============================================
FRONTEND_URL="http://dev.app.kyntaro.com"

# ============================================
# API URL
# ============================================
API_URL="http://localhost:3000/api"

# ============================================
# EMAIL FROM NAMES
# ============================================
EMAIL_FROM_NAME_INVESTMENT="Niakazi Investment Team"
EMAIL_FROM_NAME_PAYROLL="Niakazi Payroll Team"
EMAIL_FROM_NAME_PROCUREMENT="Niakazi Procurement Team"
EMAIL_FROM_NAME_FINANCE="Niakazi Finance Team"
EMAIL_FROM_NAME_EVENTS="Niakazi Events Team"
EMAIL_FROM_NAME_IT="Niakazi IT Team"
EMAIL_FROM_NAME_PLATFORM="Niakazi Investment Platform"
EMAIL_FROM_NAME_DEFAULT="Niakazi Notifications"

# ============================================
# CONTACT EMAIL ADDRESSES
# ============================================
EMAIL_CONTACT_PROCUREMENT="procurement@niakazi.com"
EMAIL_CONTACT_FINANCE="finance@niakazi.com"
EMAIL_ADMIN="admin@niakazi.com"
EMAIL_SUPPLIERS="suppliers@niakazi.com"
EMAIL_SUPPORT="support@niakazi.com"

# ============================================
# COMPANY INFORMATION
# ============================================
COMPANY_NAME_FULL="Niakazi"
COMPANY_NAME_SHORT="Niakazi"

# ============================================
# PORTAL URLs
# ============================================
EVENTS_PORTAL_URL="http://dev.app.kyntaro.com"
PROCUREMENT_PORTAL_URL="http://dev.app.kyntaro.com"

# ============================================
# UPLOAD SERVICE URLs
# ============================================
UPLOAD_SERVICE_URL="http://31.220.82.129:3050/upload"
MEDIA_BASE_URL="http://31.220.82.129/uploads"

# ============================================
# SENTRY CONFIGURATION (Optional for dev)
# ============================================
SENTRY_DSN=""
```

---

## 📊 Comparison Table

| Variable | Production | Development |
|----------|-----------|-------------|
| **Company Name (Short)** | `NVCCZ` | `Niakazi` |
| **Company Name (Full)** | `National Venture Capital Company of Zimbabwe` | `Niakazi` |
| **Frontend URL** | `http://app.kyntaro.com` | `http://dev.app.kyntaro.com` |
| **Events Portal URL** | `http://app.kyntaro.com` | `http://dev.app.kyntaro.com` |
| **Procurement Portal URL** | `http://app.kyntaro.com` | `http://dev.app.kyntaro.com` |
| **API URL** | `https://nvccz-pi.vercel.app/api` | `http://localhost:3000/api` |
| **Email From Names** | `NVCCZ * Team` | `Niakazi * Team` |
| **Contact Emails** | `*@nvccz.com` / `*@nvccz.co.zw` | `*@niakazi.com` |
| **NODE_ENV** | `production` | `development` |

---

## 🔑 Key Differences

### 1. **Branding**
- **Production**: All references use "NVCCZ" and "National Venture Capital Company of Zimbabwe"
- **Development**: All references use "Niakazi"

### 2. **URLs**
- **Production**: `app.kyntaro.com` (production domain)
- **Development**: `dev.app.kyntaro.com` (development domain)

### 3. **Email Addresses**
- **Production**: `@nvccz.com` and `@nvccz.co.zw` domains
- **Development**: `@niakazi.com` domain

### 4. **API URLs**
- **Production**: Vercel production API URL
- **Development**: Local development API URL

---

## 📝 Usage Instructions

### For Production:
1. Copy the production configuration above
2. Create a `.env` file in the project root
3. Paste the production variables
4. Update sensitive values (database credentials, JWT secret, etc.)
5. Never commit the `.env` file to version control

### For Development:
1. Copy the development configuration above
2. Create a `.env.development` file in the project root
3. Paste the development variables
4. Update sensitive values as needed
5. Use a tool like `dotenv-cli` or configure your runtime to load the appropriate file

### Example with dotenv-cli:
```bash
# Production
npm run start:prod  # Uses .env.production

# Development
npm run start:dev   # Uses .env.development
```

---

## ⚠️ Important Notes

1. **Never commit `.env` files** to version control
2. **Update sensitive values** (passwords, secrets, API keys) before deployment
3. **Database URLs** should match your actual database configurations
4. **JWT_SECRET** must be strong and unique for each environment
5. **CORS_ORIGINS** should only include trusted domains
6. **Email credentials** (SMTP) are configured in `src/config/email.config.ts` and should also be environment-specific

---

## 🔐 Security Checklist

- [ ] JWT_SECRET is strong and unique per environment
- [ ] Database credentials are secure
- [ ] SMTP credentials are stored securely (consider moving to env vars)
- [ ] CORS origins are restricted to known domains
- [ ] `.env` files are in `.gitignore`
- [ ] Production secrets are stored in a secure secrets manager

---

**Last Updated**: 2026-01-XX  
**Maintained By**: Development Team

