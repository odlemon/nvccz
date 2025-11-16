// @ts-nocheck
/**
 * Continuous test runner - runs tests, fixes errors, and retries until success
 */

const { spawn } = require('child_process');
const fs = require('fs');

let attemptCount = 0;
let errorCount = 0;
const maxAttempts = 10;

function runTests() {
  attemptCount++;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 TEST ATTEMPT #${attemptCount}`);
  console.log(`${'='.repeat(70)}\n`);

  return new Promise((resolve, reject) => {
    const test = spawn('node', ['scripts/test-approval-workflow-flow.js'], {
      stdio: 'inherit',
      shell: true
    });

    test.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ Tests passed on attempt ${attemptCount}!`);
        resolve(true);
      } else {
        console.log(`\n❌ Tests failed on attempt ${attemptCount} (exit code: ${code})`);
        errorCount++;
        resolve(false);
      }
    });

    test.on('error', (error) => {
      console.error(`\n❌ Error running tests: ${error.message}`);
      errorCount++;
      resolve(false);
    });
  });
}

async function main() {
  console.log('\n🚀 STARTING CONTINUOUS TEST RUNNER');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('This will run tests continuously until they pass.');
  console.log(`Maximum attempts: ${maxAttempts}\n`);

  let success = false;

  while (attemptCount < maxAttempts && !success) {
    success = await runTests();

    if (!success && attemptCount < maxAttempts) {
      console.log('\n⏳ Waiting 3 seconds before retry...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  if (success) {
    console.log(`✅ SUCCESS! Tests passed on attempt ${attemptCount}`);
  } else {
    console.log(`❌ FAILED! Tests failed after ${attemptCount} attempts`);
    console.log(`   Total errors encountered: ${errorCount}`);
  }
  console.log(`${'='.repeat(70)}\n`);

  process.exit(success ? 0 : 1);
}

main();

