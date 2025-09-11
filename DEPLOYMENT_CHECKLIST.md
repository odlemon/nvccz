# 🚀 Deployment Checklist

## ✅ CI/CD Pipeline Configuration

### Files Updated:
- ✅ `.github/workflows/deploy-prod.yml` - Triggers on `master` branch
- ✅ `deploy.sh` - Enhanced with Prisma, build, and env validation
- ✅ `ecosystem.config.js` - Optimized PM2 configuration

## 🔧 Server Setup Requirements

### 1. Environment File
Create `.env` file on your server at `/root/projects/nvccz-server/.env`:

```bash
# Database Configuration
DATABASE_URL="mysql://avnadmin:AVNS_krm65lR20GfGftQmBjJ@nvcc-veximagames-0d4d.d.aivencloud.com:24079/defaultdb?ssl-mode=REQUIRED"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_EXPIRES_IN=7d
DB_MAX_POOL_SIZE=15
DB_SERVER_SELECTION_TIMEOUT=9000

# Server Configuration
PORT=3000
NODE_ENV=production
```

### 2. GitHub Secrets Required
Set these in your GitHub repository settings:

```
SERVER_IP=your.server.ip.address
SERVER_USER=root
SERVER_SSH_KEY=your_private_ssh_key
```

### 3. Server Prerequisites
```bash
# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Create log directory
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

# Make deploy script executable
chmod +x /root/projects/nvccz-server/deploy.sh
```

### 4. Initial Server Setup
```bash
# Clone repository (first time only)
cd /root/projects
git clone https://github.com/your-username/nvccz.git nvccz-server
cd nvccz-server

# Create .env file
nano .env
# Paste your environment variables

# Install dependencies
npm ci --production

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Build application
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔄 Deployment Flow

1. **Push to master** → Triggers GitHub Action
2. **SSH to server** → Runs `deploy.sh`
3. **Pull latest code** → `git reset --hard origin/master`
4. **Install dependencies** → `npm ci --production`
5. **Generate Prisma client** → `npx prisma generate`
6. **Run migrations** → `npx prisma migrate deploy`
7. **Build application** → `npm run build`
8. **Validate .env** → Check environment file exists
9. **Restart PM2** → `pm2 reload ecosystem.config.js --update-env`

## 🐛 Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check if Aiven database is accessible
- Ensure SSL mode is properly configured

### PM2 Issues
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs nvccz-server

# Restart manually
pm2 restart nvccz-server
```

### Build Issues
```bash
# Check if dist folder exists
ls -la dist/

# Rebuild manually
npm run build
```

## 📊 Monitoring

### PM2 Monitoring
```bash
# Real-time monitoring
pm2 monit

# View specific logs
pm2 logs nvccz-server --lines 100
```

### Application Health
- Check if app responds on port 3000
- Verify database connectivity
- Monitor memory usage with PM2


