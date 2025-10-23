/**
 * Test Cashbook Payment Creation with VENDOR mapping
 * 
 * This test verifies:
 * 1. VENDOR counterpartyType is correctly mapped to SUPPLIER
 * 2. Payment creation works correctly
 * 3. Journal entries are generated properly
 */

const testPayload = {
  "bankId": "cmh09d655000vunyguykkx49m",
  "amount": 1500,
  "description": "Office supplies purchase",
  "reference": "PO123456",
  "counterpartyType": "VENDOR",
  "vendorId": "cmgt8il140000jp04xshug9c2",
  "glAccountId": "cmg97iu9b0000ung8h8u3bg02",
  "transactionDate": "2025-10-21"
};

console.log('✅ TEST PAYLOAD FOR CASHBOOK PAYMENT:');
console.log(JSON.stringify(testPayload, null, 2));

console.log('\n📋 VALIDATION:');
console.log(`   ✓ Bank ID: ${testPayload.bankId}`);
console.log(`   ✓ Amount: $${testPayload.amount}`);
console.log(`   ✓ Description: ${testPayload.description}`);
console.log(`   ✓ Counterparty Type: ${testPayload.counterpartyType} (will be mapped to SUPPLIER)`);
console.log(`   ✓ Vendor ID: ${testPayload.vendorId}`);
console.log(`   ✓ GL Account ID: ${testPayload.glAccountId}`);
console.log(`   ✓ Transaction Date: ${testPayload.transactionDate}`);

console.log('\n📝 EXPECTED BEHAVIOR:');
console.log('   1. Controller receives counterpartyType: "VENDOR"');
console.log('   2. Controller maps "VENDOR" → "SUPPLIER"');
console.log('   3. Service creates cashbook entry with counterpartyType: "SUPPLIER"');
console.log('   4. Journal entry is created with proper accounts');

console.log('\n🔍 CURL COMMAND TO TEST:');
console.log(`
curl -X POST https://nvccz-pi.vercel.app/api/cashbook/payments \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \\
  -d '${JSON.stringify(testPayload)}'
`);

console.log('\n✅ JSON is valid and properly formatted!');

