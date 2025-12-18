import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEventExpense() {
  try {
    console.log('🧪 Testing Event Expense Recording\n');

    // Step 1: Find an event with approved budget
    console.log('Step 1: Finding an event with approved budget...');
    const event = await prisma.event.findFirst({
      where: {
        budgetStatus: 'APPROVED'
      },
      select: {
        id: true,
        title: true,
        budgetStatus: true,
        status: true,
        approvedBudget: true
      }
    });

    if (!event) {
      console.log('❌ No event with approved budget found.');
      console.log('\nLet me check for any events...');
      const anyEvent = await prisma.event.findFirst({
        select: {
          id: true,
          title: true,
          budgetStatus: true,
          status: true
        }
      });

      if (anyEvent) {
        console.log(`\nFound event: "${anyEvent.title}"`);
        console.log(`   Budget Status: ${anyEvent.budgetStatus}`);
        console.log(`   Event Status: ${anyEvent.status}`);
        console.log('\n⚠️ This event needs budget approval before expenses can be recorded.');
      } else {
        console.log('❌ No events found in the system.');
      }
      return;
    }

    console.log(`✅ Found event: "${event.title}"`);
    console.log(`   Event ID: ${event.id}`);
    console.log(`   Budget Status: ${event.budgetStatus}`);
    console.log(`   Approved Budget: $${event.approvedBudget || 'N/A'}\n`);

    // Step 2: Check for required data (vendor, currency, expense category)
    console.log('Step 2: Checking for required data...');

    // Check vendors
    const vendors = await prisma.vendor.findMany({
      take: 5,
      select: {
        id: true,
        name: true
      }
    });
    console.log(`   Vendors: ${vendors.length} found`);
    if (vendors.length === 0) {
      console.log('   ⚠️ No vendors found. Expense recording requires a vendor.');
    } else {
      console.log(`   ✅ Using vendor: ${vendors[0].name} (${vendors[0].id})`);
    }

    // Check currencies
    const currency = await prisma.currency.findFirst({
      where: {
        code: 'USD'
      },
      select: {
        id: true,
        code: true
      }
    });
    console.log(`   Currency: ${currency ? `✅ ${currency.code} (${currency.id})` : '❌ USD not found'}\n`);

    // Check expense categories
    const expenseCategories = await prisma.expenseCategory.findMany({
      take: 5,
      select: {
        id: true,
        name: true
      }
    });
    console.log(`   Expense Categories: ${expenseCategories.length} found`);
    if (expenseCategories.length === 0) {
      console.log('   ⚠️ No expense categories found.');
    } else {
      console.log(`   ✅ Using category: ${expenseCategories[0].name} (${expenseCategories[0].id})`);
    }

    // Step 3: Prepare test expense data
    console.log('\nStep 3: Preparing test expense data...');
    const testExpense = {
      description: 'Test Event Expense - Venue Rental',
      amount: 1000,
      category: expenseCategories[0]?.name || 'VENUE',
      vendorId: vendors[0]?.id || null,
      vendor: vendors[0]?.name || 'Test Vendor',
      paymentMethod: 'BANK_TRANSFER',
      isTaxable: true,
      currencyId: currency?.id || null,
      paymentDate: new Date().toISOString()
    };

    console.log('   Test Expense Data:');
    console.log(`   - Description: ${testExpense.description}`);
    console.log(`   - Amount: $${testExpense.amount}`);
    console.log(`   - Category: ${testExpense.category}`);
    console.log(`   - Vendor ID: ${testExpense.vendorId || 'MISSING'}`);
    console.log(`   - Currency ID: ${testExpense.currencyId || 'MISSING'}\n`);

    // Step 4: Check what's missing
    if (!testExpense.vendorId) {
      console.log('❌ CANNOT TEST: vendorId is required but not found.');
      console.log('   Please create a vendor first.');
      return;
    }

    if (!testExpense.currencyId) {
      console.log('❌ CANNOT TEST: currencyId is required but not found.');
      console.log('   Please ensure USD currency exists.');
      return;
    }

    // Step 5: Instructions for API test
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TO TEST VIA API:');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('1. Login to get token:');
    console.log('   POST http://localhost:3000/api/auth/login');
    console.log('   Body: { "email": "admin@nts.com", "password": "admin123" }\n');
    console.log('2. Record expense:');
    console.log(`   POST http://localhost:3000/api/events/${event.id}/expenses`);
    console.log('   Authorization: Bearer [token]');
    console.log('   Body:');
    console.log(JSON.stringify(testExpense, null, 2));
    console.log('\n3. Check for errors in the response.\n');

    // Step 6: Check existing expenses
    console.log('Step 4: Checking existing expenses for this event...');
    const existingExpenses = await prisma.eventExpense.findMany({
      where: {
        eventId: event.id
      },
      select: {
        id: true,
        description: true,
        amount: true,
        status: true,
        category: true
      }
    });

    console.log(`   Found ${existingExpenses.length} existing expense(s):`);
    existingExpenses.forEach((exp, index) => {
      console.log(`   ${index + 1}. ${exp.description}: $${exp.amount} (${exp.status})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEventExpense();

