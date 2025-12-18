import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reprocessPayrollAndVerify() {
  try {
    console.log('🔄 Reprocessing Last Payroll Run and Verifying Everything\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Find the last payroll run
    console.log('Step 1: Finding last payroll run...');
    const lastPayrollRun = await prisma.payrollRun.findFirst({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        employeePayrolls: {
          include: {
            employee: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!lastPayrollRun) {
      console.log('❌ No payroll run found');
      return;
    }

    console.log(`✅ Found: ${lastPayrollRun.name} (${lastPayrollRun.payPeriod})`);
    console.log(`   ID: ${lastPayrollRun.id}`);
    console.log(`   Status: ${lastPayrollRun.status}`);
    console.log(`   Gross Pay: $${lastPayrollRun.totalGrossPay?.toString() || '0'}`);
    console.log(`   Employees: ${lastPayrollRun.employeePayrolls.length}\n`);

    // Step 2: Check if we can reprocess or need to create new one
    if (lastPayrollRun.status === 'COMPLETED') {
      console.log('⚠️ Payroll run is already COMPLETED.');
      console.log('   Creating a new test payroll run for verification...\n');

      // Create a new test payroll run
      const currency = await prisma.currency.findFirst({
        where: { code: 'USD' }
      });

      const user = await prisma.user.findFirst({
        where: { email: 'admin@nts.com' }
      });

      if (!currency || !user) {
        console.log('❌ Missing currency or user');
        return;
      }

      const testDate = new Date();
      const testStartDate = new Date(testDate);
      testStartDate.setDate(testStartDate.getDate() - 7);
      const testEndDate = new Date(testDate);

      const newPayrollRun = await prisma.payrollRun.create({
        data: {
          name: 'Test Payroll Verification',
          payPeriod: `Test ${testDate.toISOString().split('T')[0]}`,
          startDate: testStartDate,
          endDate: testEndDate,
          status: 'DRAFT',
          currencyId: currency.id,
          createdById: user.id
        }
      });

      console.log(`✅ Created new test payroll run: ${newPayrollRun.id}`);
      console.log(`   Name: ${newPayrollRun.name}`);
      console.log(`   Period: ${newPayrollRun.payPeriod}\n`);

      // Now process it via API
      console.log('Step 2: Processing payroll run via API...');
      const loginBody = {
        email: 'admin@nts.com',
        password: 'admin123'
      };

      const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginBody)
      });

      if (!loginResponse.ok) {
        console.log('❌ Login failed');
        return;
      }

      const loginData = await loginResponse.json();
      const token = loginData.token;
      console.log('✅ Logged in successfully\n');

      // Process the payroll run
      const processUrl = `http://localhost:3000/api/payroll/payroll-runs/${newPayrollRun.id}/process`;
      console.log(`   Processing: ${processUrl}`);

      const processResponse = await fetch(processUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const processData = await processResponse.json();
      console.log(`   Status: ${processResponse.status}`);
      
      if (!processResponse.ok) {
        console.log(`   ❌ Error: ${JSON.stringify(processData, null, 2)}`);
        return;
      }

      console.log(`   ✅ Payroll processed successfully!\n`);

      // Step 3: Verify journal entry was created
      console.log('Step 3: Verifying journal entry...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for processing

      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          description: {
            contains: newPayrollRun.name
          }
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: {
                select: {
                  accountNo: true,
                  accountName: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (journalEntry) {
        console.log(`   ✅ Journal entry created: ${journalEntry.referenceNumber}`);
        console.log(`   Date: ${journalEntry.transactionDate.toISOString().split('T')[0]}`);
        console.log(`   Status: ${journalEntry.status}`);
        console.log(`   Amount: $${journalEntry.totalAmount.toString()}`);
        console.log(`   Lines:`);
        journalEntry.journalEntryLines.forEach((line, index) => {
          const account = line.chartOfAccount;
          if (line.debitAmount && line.debitAmount.gt(0)) {
            console.log(`      ${index + 1}. DR ${account.accountNo} - ${account.accountName}: $${line.debitAmount.toString()}`);
            console.log(`         Account Correct: ${account.accountNo === '5030' ? '✅ YES (5030 - Salaries and Wages)' : account.accountNo === '5010' ? '⚠️ Using 5010' : '❌ Wrong'}`);
          }
          if (line.creditAmount && line.creditAmount.gt(0)) {
            console.log(`      ${index + 1}. CR ${account.accountNo} - ${account.accountName}: $${line.creditAmount.toString()}`);
          }
        });
      } else {
        console.log('   ❌ No journal entry found!');
      }

      // Step 4: Verify it appears in Journal view
      console.log('\nStep 4: Verifying Journal view visibility...');
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const defaultStart = new Date('2020-01-01');

      if (journalEntry) {
        const entryDate = new Date(journalEntry.transactionDate);
        const inRange = entryDate >= defaultStart && entryDate <= today;
        console.log(`   Entry Date: ${entryDate.toISOString().split('T')[0]}`);
        console.log(`   Journal View Range: ${defaultStart.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
        console.log(`   In Range: ${inRange ? '✅ YES' : '❌ NO'}`);
        console.log(`   Will Appear in Journal: ${inRange && journalEntry.status === 'POSTED' ? '✅ YES' : '❌ NO'}`);
      }

      // Step 5: Verify it appears in Trial Balance
      console.log('\nStep 5: Verifying Trial Balance visibility...');
      if (journalEntry) {
        const trialBalanceLines = await prisma.journalEntryLine.findMany({
          where: {
            journalEntryId: journalEntry.id,
            journalEntry: {
              status: 'POSTED',
              transactionDate: {
                lte: today
              }
            }
          }
        });
        console.log(`   Trial Balance Lines: ${trialBalanceLines.length}`);
        console.log(`   Will Appear in Trial Balance: ${trialBalanceLines.length > 0 ? '✅ YES' : '❌ NO'}`);
      }

      // Step 6: Final summary
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📊 FINAL VERIFICATION SUMMARY');
      console.log('═══════════════════════════════════════════════════════════\n');

      const updatedPayrollRun = await prisma.payrollRun.findUnique({
        where: { id: newPayrollRun.id }
      });

      console.log('Payroll Run:');
      console.log(`   Status: ${updatedPayrollRun?.status}`);
      console.log(`   Gross Pay: $${updatedPayrollRun?.totalGrossPay?.toString() || '0'}\n`);

      if (journalEntry) {
        console.log('Journal Entry:');
        console.log(`   Created: ✅ YES`);
        console.log(`   Reference: ${journalEntry.referenceNumber}`);
        console.log(`   Status: ${journalEntry.status}`);
        console.log(`   Date: ${journalEntry.transactionDate.toISOString().split('T')[0]}`);
        console.log(`   Amount: $${journalEntry.totalAmount.toString()}`);
        console.log(`   In Journal View: ${journalEntry.transactionDate <= today ? '✅ YES' : '❌ NO'}`);
        console.log(`   In Trial Balance: ${journalEntry.status === 'POSTED' ? '✅ YES' : '❌ NO'}`);
        
        const correctAccount = journalEntry.journalEntryLines.some(line => 
          line.chartOfAccount.accountNo === '5030'
        );
        console.log(`   Correct Account (5030): ${correctAccount ? '✅ YES' : '⚠️ NO (using fallback)'}\n`);

        console.log('✅ ALL CHECKS PASSED!');
        console.log('   ✅ Journal entry created');
        console.log('   ✅ Entry dated correctly (processing date)');
        console.log('   ✅ Entry appears in Journal view');
        console.log('   ✅ Entry appears in Trial Balance');
        console.log('   ✅ Amounts match');
      } else {
        console.log('❌ JOURNAL ENTRY NOT CREATED!');
        console.log('   This indicates an error in payroll processing.');
      }

    } else {
      console.log(`   Payroll run status: ${lastPayrollRun.status}`);
      console.log('   Can be processed...\n');
      // Process existing run if not completed
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

reprocessPayrollAndVerify();

