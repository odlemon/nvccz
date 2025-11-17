// Calculate totals from Journal Entries
const journalEntries = [
  // POSTED entries only
  { id: "cmi1p53bo003kun7g3i3jgdwy", status: "POSTED", lines: [
    { debit: 4140, credit: 0 },
    { debit: 0, credit: 4140 }
  ]},
  { id: "cmi1nk2xo002punaogzo5iyk2", status: "POSTED", lines: [
    { debit: 3850, credit: 0 },
    { debit: 0, credit: 3850 }
  ]},
  { id: "cmi0ee3d0000vun5s1gs5vq3t", status: "POSTED", lines: [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 }
  ]},
  { id: "cmi0edvhh000pun5sp25n3x9z", status: "POSTED", lines: [
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 }
  ]},
  { id: "cmi0edrdx000jun5stuaihwwp", status: "POSTED", lines: [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 }
  ]},
  { id: "cmi0edn3w000dun5sebuny5j5", status: "POSTED", lines: [
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 }
  ]},
  { id: "cmi0edh5h0007un5sqw5ulpsb", status: "POSTED", lines: [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 }
  ]},
  { id: "cmi0eddxc0001un5s8bhqarpu", status: "POSTED", lines: [
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 }
  ]},
  { id: "cmi0cwh7i0011unwoyuvv9krs", status: "POSTED", lines: [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 }
  ]},
  { id: "cmi0cw7ee000runwo7d3a2kup", status: "POSTED", lines: [
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 }
  ]},
  { id: "cmi0cu91q000dunwo83bgzosh", status: "POSTED", lines: [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 }
  ]},
  { id: "cmi0ctxr20003unwo2x2waxfy", status: "POSTED", lines: [
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 }
  ]},
  { id: "cmi0crk7h000duns8aci1w8b2", status: "POSTED", lines: [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 }
  ]},
  { id: "cmi0cr8600003uns836dq5g0v", status: "POSTED", lines: [
    { debit: 5000, credit: 0 },
    { debit: 0, credit: 5000 }
  ]},
  { id: "cmi0dtl33000jun00vgzmza4w", status: "POSTED", lines: [
    { debit: 15000, credit: 0 },
    { debit: 0, credit: 15000 }
  ]},
  { id: "cmi0du69x0017un00msi5ygor", status: "POSTED", lines: [
    { debit: 3000, credit: 0 },
    { debit: 0, credit: 3000 }
  ]},
  { id: "cmi0dteh5000bun00c0ol88qb", status: "POSTED", lines: [
    { debit: 7500, credit: 0 },
    { debit: 0, credit: 7500 }
  ]},
  { id: "cmi0dtyr6000zun00v9hsbl0l", status: "POSTED", lines: [
    { debit: 500, credit: 0 },
    { debit: 0, credit: 500 }
  ]},
  { id: "cmi0dt5nh0003un00d9v5ooi8", status: "POSTED", lines: [
    { debit: 10000, credit: 0 },
    { debit: 0, credit: 10000 }
  ]},
  { id: "cmi0dtrve000run00ibcdv5ca", status: "POSTED", lines: [
    { debit: 2000, credit: 0 },
    { debit: 0, credit: 2000 }
  ]}
];

let totalDebits = 0;
let totalCredits = 0;

console.log('════════════════════════════════════════════════════════════════');
console.log('📊 CALCULATING TOTALS FROM JOURNAL ENTRIES (POSTED ONLY)');
console.log('════════════════════════════════════════════════════════════════\n');

for (const entry of journalEntries) {
  if (entry.status !== 'POSTED') continue;
  
  for (const line of entry.lines) {
    totalDebits += line.debit;
    totalCredits += line.credit;
  }
}

console.log(`Total Debits from Journal Entries:  $${totalDebits.toFixed(2)}`);
console.log(`Total Credits from Journal Entries: $${totalCredits.toFixed(2)}`);
console.log(`Difference:                          $${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
console.log(`Is Balanced:                         ${Math.abs(totalDebits - totalCredits) < 0.01 ? '✅ YES' : '❌ NO'}`);

console.log('\n════════════════════════════════════════════════════════════════');
console.log('📊 TRIAL BALANCE TOTALS');
console.log('════════════════════════════════════════════════════════════════');
console.log(`Total Debits:  $81990.00`);
console.log(`Total Credits: $81990.00`);
console.log(`Is Balanced:   ✅ YES`);

console.log('\n════════════════════════════════════════════════════════════════');
console.log('🔍 COMPARISON');
console.log('════════════════════════════════════════════════════════════════');

const debitDiff = Math.abs(81990 - totalDebits);
const creditDiff = Math.abs(81990 - totalCredits);

console.log(`Debits Match:  ${debitDiff < 0.01 ? '✅ YES' : '❌ NO'} (Difference: $${debitDiff.toFixed(2)})`);
console.log(`Credits Match: ${creditDiff < 0.01 ? '✅ YES' : '❌ NO'} (Difference: $${creditDiff.toFixed(2)})`);

if (debitDiff < 0.01 && creditDiff < 0.01) {
  console.log('\n✅ SUCCESS: Journal Entry totals match Trial Balance totals!');
} else {
  console.log('\n❌ ERROR: Totals do NOT match!');
  console.log('\n   This indicates the Trial Balance is not correctly summing');
  console.log('   all debits and credits from journal entries.');
}

console.log('\n════════════════════════════════════════════════════════════════\n');

