import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createVendorAndTestExpense() {
  try {
    console.log('🧪 Creating Vendor and Testing Event Expense\n');

    // Step 1: Create a test vendor
    console.log('Step 1: Creating test vendor...');
    const vendor = await prisma.vendor.create({
      data: {
        name: 'Test Event Vendor',
        contactPerson: 'John Doe',
        email: 'vendor@test.com',
        phone: '+1234567890',
        address: '123 Test Street',
        isActive: true
      }
    });
    console.log(`✅ Created vendor: ${vendor.name} (${vendor.id})\n`);

    // Step 2: Get event with approved budget
    console.log('Step 2: Getting event with approved budget...');
    const event = await prisma.event.findFirst({
      where: {
        budgetStatus: 'APPROVED'
      },
      select: {
        id: true,
        title: true,
        budgetStatus: true,
        approvedBudget: true
      }
    });

    if (!event) {
      console.log('❌ No event with approved budget found.');
      return;
    }

    console.log(`✅ Found event: "${event.title}" (${event.id})\n`);

    // Step 3: Get currency and expense category
    const currency = await prisma.currency.findFirst({
      where: { code: 'USD' }
    });

    const expenseCategory = await prisma.expenseCategory.findFirst({
      where: { name: 'Office Equipment' }
    });

    // Step 4: Prepare expense data
    const expenseData = {
      description: 'Test Event Expense - Venue Rental',
      amount: 500,
      category: expenseCategory?.name || 'VENUE',
      vendorId: vendor.id,
      vendor: vendor.name,
      paymentMethod: 'BANK_TRANSFER',
      isTaxable: true,
      currencyId: currency?.id,
      paymentDate: new Date().toISOString()
    };

    console.log('Step 3: Expense data prepared:');
    console.log(JSON.stringify(expenseData, null, 2));
    console.log('\n');

    // Step 5: Test via API
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TESTING VIA API');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Login first
    const loginBody = {
      email: 'admin@nts.com',
      password: 'admin123'
    };

    console.log('1. Logging in...');
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loginBody)
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.log(`❌ Login failed: ${loginResponse.status} - ${errorText}`);
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Logged in successfully\n');

    // Record expense
    console.log('2. Recording expense...');
    const expenseUrl = `http://localhost:3000/api/events/${event.id}/expenses`;
    console.log(`   URL: ${expenseUrl}`);
    console.log(`   Method: POST`);
    console.log(`   Body:`, JSON.stringify(expenseData, null, 2));
    console.log('');

    const expenseResponse = await fetch(expenseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(expenseData)
    });

    const responseText = await expenseResponse.text();
    console.log(`   Status: ${expenseResponse.status} ${expenseResponse.statusText}`);
    console.log(`   Response:`, responseText);

    if (!expenseResponse.ok) {
      console.log('\n❌ ERROR OCCURRED!');
      try {
        const errorData = JSON.parse(responseText);
        console.log('   Error Details:');
        console.log(JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.log('   Raw Error:', responseText);
      }
    } else {
      console.log('\n✅ Expense recorded successfully!');
      try {
        const successData = JSON.parse(responseText);
        console.log('   Response Data:');
        console.log(JSON.stringify(successData, null, 2));
      } catch (e) {
        console.log('   Response:', responseText);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createVendorAndTestExpense();

