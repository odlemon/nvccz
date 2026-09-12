// @ts-nocheck
/**
 * Test Email Connection Script
 * 
 * This script tests the email transport connection and sends a test email
 */

import { emailTransport, verifyEmailConnection, getFromAddress } from '../src/config/email.config';

async function testEmailConnection() {
  console.log('🔍 Testing Email Connection...\n');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test 1: Verify connection
    console.log('📝 Step 1: Verifying email transport connection...');
    const isConnected = await verifyEmailConnection();
    
    if (!isConnected) {
      console.error('❌ Email connection verification failed!');
      process.exit(1);
    }

    console.log('');
    console.log('📝 Step 2: Sending test email...');
    
    // Test 2: Send test email
    const from = getFromAddress('it');
    const testEmail = process.argv[2] || 'test@example.com';
    
    console.log(`To: ${testEmail}`);
    console.log(`From: "${from.name}" <${from.address}>`);
    console.log('');

    const mailOptions = {
      from: `"${from.name}" <${from.address}>`,
      to: testEmail,
      subject: 'Test Email - NVCCZ Password Reset System',
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from the NVCCZ password reset system.</p>
        <p>If you received this email, the email configuration is working correctly.</p>
        <p>Time: ${new Date().toISOString()}</p>
      `,
      text: 'This is a test email from the NVCCZ password reset system.'
    };

    const result = await emailTransport.sendMail(mailOptions);
    
    console.log('✅ Test email sent successfully!');
    console.log('');
    console.log('Email Details:');
    console.log(`  Message ID: ${result.messageId}`);
    console.log(`  Response: ${result.response}`);
    console.log(`  Accepted: ${result.accepted.join(', ')}`);
    if (result.rejected.length > 0) {
      console.log(`  Rejected: ${result.rejected.join(', ')}`);
    }
    console.log('');

  } catch (error: any) {
    console.error('❌ Error testing email connection:');
    console.error(`  Message: ${error.message}`);
    console.error(`  Code: ${error.code}`);
    if (error.command) {
      console.error(`  Command: ${error.command}`);
    }
    if (error.response) {
      console.error(`  Response: ${error.response}`);
    }
    if (error.responseCode) {
      console.error(`  Response Code: ${error.responseCode}`);
    }
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  }
}

testEmailConnection()
  .then(() => {
    console.log('🎉 Email test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Email test failed:', error);
    process.exit(1);
  });

