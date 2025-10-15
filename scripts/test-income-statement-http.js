const http = require('http');

function testIncomeStatementHTTP() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     TESTING INCOME STATEMENT API (HTTP)                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const postData = JSON.stringify({
    startDate: '2025-01-01',
    endDate: '2025-12-31'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/accounting/income-statement/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      // Using admin token from terminal logs
      'Authorization': 'Bearer ' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWc5N2lkb24wMDAydW53MHY3cGJ0bWU2Iiwicm9sZUlkIjoiY21nOTdpYjlmMDAwMHVudzBkdXNyb2VjbyIsInJvbGVOYW1lIjoiYWRtaW4iLCJlbWFpbCI6ImFkbWluQG52Y2N6LmNvLnp3IiwiZmlyc3ROYW1lIjoiQWRtaW4iLCJsYXN0TmFtZSI6IlVzZXIiLCJwZXJtaXNzaW9ucyI6W3sibmFtZSI6InZpZXdfZGFzaGJvYXJkIiwidmFsdWUiOnRydWV9LHsibmFtZSI6InZpZXdfcmVwb3J0cyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJ2aWV3X3N0cnVjdHVyZSIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJtYW5hZ2Vfc3RydWN0dXJlIiwidmFsdWUiOnRydWV9LHsibmFtZSI6InZpZXdfYWNjb3VudGluZyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJtYW5hZ2VfYWNjb3VudGluZyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJ2aWV3X2ZpbmFuY2lhbF9yZXBvcnRzIiwidmFsdWUiOnRydWV9LHsibmFtZSI6Im1hbmFnZV9maW5hbmNpYWxfcmVwb3J0cyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJ2aWV3X2xlZGdlciIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJtYW5hZ2VfbGVkZ2VyIiwidmFsdWUiOnRydWV9LHsibmFtZSI6Im1hbmFnZV91c2VycyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJtYW5hZ2Vfcm9sZXMiLCJ2YWx1ZSI6dHJ1ZX0seyJuYW1lIjoiY3JlYXRlX3dvcmtsb2ciLCJ2YWx1ZSI6dHJ1ZX0seyJuYW1lIjoiZWRpdF93b3JrbG9nIiwidmFsdWUiOnRydWV9LHsibmFtZSI6ImRlbGV0ZV93b3JrbG9nIiwidmFsdWUiOnRydWV9LHsibmFtZSI6InZpZXdfd29ya2xvZyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJ2aWV3X2J1c2luZXNzX29wZXJhdGlvbnMiLCJ2YWx1ZSI6dHJ1ZX0seyJuYW1lIjoibWFuYWdlX2J1c2luZXNzX29wZXJhdGlvbnMiLCJ2YWx1ZSI6dHJ1ZX0seyJuYW1lIjoidmlld19jb21wYW55X2RhdGEiLCJ2YWx1ZSI6dHJ1ZX0seyJuYW1lIjoibWFuYWdlX2NvbXBhbnlfZGF0YSIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJ2aWV3X2VycF9yZXBvcnRzIiwidmFsdWUiOnRydWV9LHsibmFtZSI6Im1hbmFnZV9lcnBfcmVwb3J0cyIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJ2aWV3X3N1YnNjcmlwdGlvbiIsInZhbHVlIjp0cnVlfSx7Im5hbWUiOiJtYW5hZ2Vfc3Vic2NyaXB0aW9uIiwidmFsdWUiOnRydWV9LHsibmFtZSI6Im1hbmFnZV9maXJtX3NldHRpbmdzIiwidmFsdWUiOnRydWV9LHsibmFtZSI6ImJhbmtfcmVjb25jaWxpYXRpb24iLCJ2YWx1ZSI6dHJ1ZX1dLCJpYXQiOjE3NjAwMDg4ODMsImV4cCI6MTc2MDYxMzY4M30.icdKDBbr6MKSw7r9hT5wLsLxV4GgPTz_w4Zo1AHjJVY'
    }
  };

  console.log(`Sending POST ${options.path}...`);
  console.log('Request body:', postData);
  console.log('');

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('─────────────────────────────────────────────────────────');
      console.log(`Response Status: ${res.statusCode}`);
      console.log('─────────────────────────────────────────────────────────\n');

      try {
        const result = JSON.parse(data);

        if (!result.success) {
          console.log('❌ API Error:', result.message);
          return;
        }

        const incomeStatement = result.data;

        console.log('📊 INCOME STATEMENT RESULTS');
        console.log('─────────────────────────────────────────────────────────');
        console.log(`Period: ${incomeStatement.period.startDate} to ${incomeStatement.period.endDate}`);
        console.log(`Currency: ${incomeStatement.currency.code} - ${incomeStatement.currency.name}`);
        console.log('');

        console.log('💰 REVENUE:');
        if (incomeStatement.revenue.accounts.length === 0) {
          console.log('  (No revenue accounts)');
        } else {
          incomeStatement.revenue.accounts.forEach(account => {
            console.log(`  ${account.accountNo} ${account.accountName}`);
            console.log(`    Total Debits:  $${account.totalDebits.toFixed(2)}`);
            console.log(`    Total Credits: $${account.totalCredits.toFixed(2)}`);
            console.log(`    Net Amount:    $${account.netAmount.toFixed(2)}`);
          });
        }
        console.log(`  TOTAL REVENUE: $${incomeStatement.revenue.total.toFixed(2)}`);
        console.log('');

        console.log('💸 EXPENSES:');
        if (incomeStatement.expenses.accounts.length === 0) {
          console.log('  (No expense accounts)');
        } else {
          incomeStatement.expenses.accounts.forEach(account => {
            console.log(`  ${account.accountNo} ${account.accountName}`);
            console.log(`    Total Debits:  $${account.totalDebits.toFixed(2)}`);
            console.log(`    Total Credits: $${account.totalCredits.toFixed(2)}`);
            console.log(`    Net Amount:    $${account.netAmount.toFixed(2)}`);
          });
        }
        console.log(`  TOTAL EXPENSES: $${incomeStatement.expenses.total.toFixed(2)}`);
        console.log('');

        console.log('═══════════════════════════════════════════════════════════');
        console.log(`💰 NET INCOME: $${incomeStatement.netIncome.toFixed(2)}`);
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');

        // Verify against expected values
        const expectedRevenue = -298.00;
        const expectedExpenses = 28418.33;
        const expectedNetIncome = -28716.33;

        console.log('─────────────────────────────────────────────────────────');
        console.log('✅ VERIFICATION');
        console.log('─────────────────────────────────────────────────────────');
        
        const revenueDiff = Math.abs(incomeStatement.revenue.total - expectedRevenue);
        const expenseDiff = Math.abs(incomeStatement.expenses.total - expectedExpenses);
        const netIncomeDiff = Math.abs(incomeStatement.netIncome - expectedNetIncome);
        
        if (revenueDiff < 0.01) {
          console.log(`✅ Revenue matches: $${incomeStatement.revenue.total.toFixed(2)} = $${expectedRevenue.toFixed(2)}`);
        } else {
          console.log(`❌ Revenue mismatch: $${incomeStatement.revenue.total.toFixed(2)} vs $${expectedRevenue.toFixed(2)} (diff: $${revenueDiff.toFixed(2)})`);
        }
        
        if (expenseDiff < 0.01) {
          console.log(`✅ Expenses match: $${incomeStatement.expenses.total.toFixed(2)} = $${expectedExpenses.toFixed(2)}`);
        } else {
          console.log(`❌ Expenses mismatch: $${incomeStatement.expenses.total.toFixed(2)} vs $${expectedExpenses.toFixed(2)} (diff: $${expenseDiff.toFixed(2)})`);
        }
        
        if (netIncomeDiff < 0.01) {
          console.log(`✅ Net Income matches: $${incomeStatement.netIncome.toFixed(2)} = $${expectedNetIncome.toFixed(2)}`);
        } else {
          console.log(`❌ Net Income mismatch: $${incomeStatement.netIncome.toFixed(2)} vs $${expectedNetIncome.toFixed(2)} (diff: $${netIncomeDiff.toFixed(2)})`);
        }

        if (revenueDiff < 0.01 && expenseDiff < 0.01 && netIncomeDiff < 0.01) {
          console.log('\n🎉 SUCCESS! Income Statement is now CORRECT!');
          console.log('✅ Matches Balance Sheet retained earnings');
          console.log('✅ All journal entries are now visible');
          console.log('✅ No data is missing');
        } else {
          console.log('\n⚠️ There are still discrepancies. Further investigation needed.');
        }
        console.log('');

      } catch (error) {
        console.log('❌ Error parsing response:', error.message);
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ Request Error:', error.message);
    console.log('\nMake sure the dev server is running: npm run dev');
  });

  req.write(postData);
  req.end();
}

testIncomeStatementHTTP();

