import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createExpensesCorrected() {
  console.log('💰 Creating Sample Expenses with Correct Schema...\n');
  
  try {
    // First, let's get or create the required entities
    console.log('🔍 Setting up required entities...');
    
    // Get or create vendor
    let vendor = await prisma.vendor.findFirst({
      where: { name: { contains: "Sample" } }
    });
    
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          name: "Sample Vendor Ltd",
          email: "contact@samplevendor.com",
          phone: "+263771234567",
          address: "123 Business Street, Harare, Zimbabwe",
          isActive: true
        }
      });
      console.log(`✅ Created vendor: ${vendor.name} (ID: ${vendor.id})`);
    } else {
      console.log(`✅ Using existing vendor: ${vendor.name} (ID: ${vendor.id})`);
    }
    
    // Get or create currency
    let currency = await prisma.currency.findFirst({
      where: { code: "USD" }
    });
    
    if (!currency) {
      currency = await prisma.currency.create({
        data: {
          code: "USD",
          name: "US Dollar",
          symbol: "$",
          isActive: true
        }
      });
      console.log(`✅ Created currency: ${currency.code} (ID: ${currency.id})`);
    } else {
      console.log(`✅ Using existing currency: ${currency.code} (ID: ${currency.id})`);
    }
    
    // Get or create expense categories
    const categories = [
      { name: "Office Equipment", description: "Office equipment and furniture" },
      { name: "Travel and Accommodation", description: "Business travel expenses" }
    ];
    
    const expenseCategories = [];
    for (const catData of categories) {
      let category = await prisma.expenseCategory.findFirst({
        where: { name: catData.name }
      });
      
      if (!category) {
        category = await prisma.expenseCategory.create({
          data: catData
        });
        console.log(`✅ Created category: ${category.name} (ID: ${category.id})`);
      } else {
        console.log(`✅ Using existing category: ${category.name} (ID: ${category.id})`);
      }
      expenseCategories.push(category);
    }
    
    // Get or create user (for createdById)
    let user = await prisma.user.findFirst({
      where: { email: { contains: "admin" } }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          firstName: "Admin",
          lastName: "User",
          email: "admin@example.com",
          password: "hashed_password_placeholder",
          roleId: "admin_role_id"
        }
      });
      console.log(`✅ Created user: ${user.firstName} ${user.lastName} (ID: ${user.id})`);
    } else {
      console.log(`✅ Using existing user: ${user.firstName} ${user.lastName} (ID: ${user.id})`);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Now create the expenses
    const expenses = [
      {
        name: "Bank Payment Expense",
        data: {
          vendorId: vendor.id,
          categoryId: expenseCategories[0].id, // Office Equipment
          amount: 1500.00,
          currencyId: currency.id,
          transactionDate: new Date("2024-01-15"),
          description: "Office equipment purchase - computers and furniture",
          receiptNumber: "BANK-EXP-001",
          isTaxable: true,
          paymentMethod: "BANK",
          createdById: user.id
        }
      },
      {
        name: "Credit Payment Expense", 
        data: {
          vendorId: vendor.id,
          categoryId: expenseCategories[1].id, // Travel and Accommodation
          amount: 800.00,
          currencyId: currency.id,
          transactionDate: new Date("2024-01-16"),
          description: "Business travel expenses - client meetings",
          receiptNumber: "CREDIT-EXP-001",
          isTaxable: true,
          paymentMethod: "CREDIT",
          createdById: user.id
        }
      }
    ];
    
    for (const expense of expenses) {
      try {
        console.log(`🚀 Creating ${expense.name}...`);
        console.log(`📋 Details:`);
        console.log(`   Category: ${expense.data.categoryId}`);
        console.log(`   Amount: $${expense.data.amount.toLocaleString()}`);
        console.log(`   Payment Method: ${expense.data.paymentMethod}`);
        console.log(`   Currency: USD`);
        console.log(`   Description: ${expense.data.description}`);
        console.log(`   Receipt: ${expense.data.receiptNumber}`);
        console.log(`   Taxable: ${expense.data.isTaxable ? 'Yes' : 'No'}`);
        
        // Calculate VAT and total
        const vatAmount = expense.data.amount * 0.15; // 15% VAT
        const totalAmount = expense.data.amount + vatAmount;
        console.log(`   VAT Amount: $${vatAmount.toFixed(2)}`);
        console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
        
        // Create expense in database
        const createdExpense = await prisma.expense.create({
          data: {
            vendorId: expense.data.vendorId,
            categoryId: expense.data.categoryId,
            amount: expense.data.amount,
            vatAmount: vatAmount,
            totalAmount: totalAmount,
            currencyId: expense.data.currencyId,
            transactionDate: expense.data.transactionDate,
            description: expense.data.description,
            receiptNumber: expense.data.receiptNumber,
            isTaxable: expense.data.isTaxable,
            paymentMethod: expense.data.paymentMethod,
            status: "DRAFT",
            createdById: expense.data.createdById
          }
        });
        
        console.log('\n✅ Expense Created Successfully!');
        console.log('📊 Database Details:');
        console.log(`   Expense ID: ${createdExpense.id}`);
        console.log(`   Amount: $${createdExpense.amount}`);
        console.log(`   VAT Amount: $${createdExpense.vatAmount}`);
        console.log(`   Total Amount: $${createdExpense.totalAmount}`);
        console.log(`   Payment Method: ${createdExpense.paymentMethod}`);
        console.log(`   Status: ${createdExpense.status}`);
        console.log(`   Created At: ${createdExpense.createdAt}`);
        
      } catch (error: any) {
        console.error(`\n❌ Error creating ${expense.name}:`);
        console.error(`   Error: ${error.message}`);
        
        if (error.code === 'P2003') {
          console.error('\n🔗 Foreign Key Constraint Error:');
          console.error('   The vendor ID, category ID, currency ID, or user ID does not exist');
        } else if (error.code === 'P2002') {
          console.error('\n⚠️  Unique Constraint Error:');
          console.error('   A record with this data already exists');
        }
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    }
    
    console.log('🎯 Expected Journal Entries:');
    console.log('\n📝 Bank Payment Expense (Office Equipment):');
    console.log('   Dr. 5100 - Office Equipment          $1,500.00');
    console.log('   Dr. 1101 - VAT Input                 $225.00');
    console.log('       Cr. (Bank GL linked to the selected bank) $1,725.00');
    
    console.log('\n📝 Credit Payment Expense (Travel and Accommodation):');
    console.log('   Dr. 5070 - Travel Expense            $800.00');
    console.log('   Dr. 1101 - VAT Input                 $120.00');
    console.log('       Cr. Accounts Payable (or relevant liability) $920.00');
    
    console.log('\n💡 Note: These expenses are created directly in the database.');
    console.log('   Journal entries would need to be created separately for proper accounting.');
    
  } catch (error: any) {
    console.error('\n❌ Setup Error:');
    console.error(`   Error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the expense creation
createExpensesCorrected();



