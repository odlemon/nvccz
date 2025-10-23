#!/bin/bash

# Reset Database and Seed All Data
# This script resets the database and runs all seeder files

echo "🔄 RESETTING DATABASE AND SEEDING ALL DATA"
echo "=========================================="

# Step 1: Reset the database
echo ""
echo "🗑️ Step 1: Resetting Database..."
npx prisma db push --force-reset

# Step 2: Generate Prisma client
echo ""
echo "📊 Step 2: Generating Prisma Client..."
npx prisma generate

# Step 3: Seed core data
echo ""
echo "🌱 Step 3: Seeding Core Data (Admin User, Roles)..."
npx ts-node prisma/seed.ts

# Step 4: Seed chart of accounts
echo ""
echo "📚 Step 4: Seeding Chart of Accounts..."
npx ts-node prisma/seedChartOfAccounts.ts

# Step 5: Create departments
echo ""
echo "🏢 Step 5: Creating Departments..."
npx ts-node scripts/check-and-create-departments.ts

# Step 6: Seed KPIs
echo ""
echo "📈 Step 6: Seeding KPIs..."
npx ts-node scripts/seed-kpis.ts

# Step 7: Seed journal entries
echo ""
echo "📝 Step 7: Seeding Journal Entries..."
npx ts-node scripts/seed-simple-journal-entries.ts

echo ""
echo "🎉 DATABASE RESET AND SEEDING COMPLETE!"
echo ""
echo "💡 Your system is now ready with:"
echo "   ✅ Admin user and role"
echo "   ✅ Chart of accounts"
echo "   ✅ Departments and KPIs"
echo "   ✅ Vendors and customers"
echo "   ✅ Journal entries"
echo "   ✅ Performance module data"
echo ""
echo "🔑 Admin Credentials:"
echo "   Email: admin@nvccz.co.zw"
echo "   Password: admin123"
echo "   Role: admin"
