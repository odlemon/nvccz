#!/usr/bin/env node

/**
 * Google Calendar Integration Setup Script
 * 
 * This script helps you set up Google Calendar integration for the Events Management module.
 * Run this script to configure your Google Calendar API credentials and test the integration.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 Google Calendar Integration Setup');
console.log('=====================================\n');

// Step 1: Check if .env file exists
function checkEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found. Creating one...');
    fs.writeFileSync(envPath, '');
  }
  return envPath;
}

// Step 2: Get Google Cloud Console credentials
async function getGoogleCredentials() {
  console.log('📋 Google Cloud Console Setup:');
  console.log('1. Go to https://console.cloud.google.com/');
  console.log('2. Create a new project or select existing one');
  console.log('3. Enable Google Calendar API');
  console.log('4. Go to APIs & Services → Credentials');
  console.log('5. Create OAuth 2.0 Client ID (Web application)');
  console.log('6. Add redirect URI: http://localhost:3000/auth/google/callback\n');

  const clientId = await askQuestion('Enter your Google Client ID: ');
  const clientSecret = await askQuestion('Enter your Google Client Secret: ');
  const redirectUri = await askQuestion('Enter redirect URI (default: http://localhost:3000/auth/google/callback): ') || 'http://localhost:3000/auth/google/callback';

  return { clientId, clientSecret, redirectUri };
}

// Step 3: Configure environment variables
async function configureEnvironment() {
  const envPath = checkEnvFile();
  const credentials = await getGoogleCredentials();

  const envContent = `
# Google Calendar Integration
GOOGLE_CLIENT_ID=${credentials.clientId}
GOOGLE_CLIENT_SECRET=${credentials.clientSecret}
GOOGLE_REDIRECT_URI=${credentials.redirectUri}
GOOGLE_CALENDAR_ENABLED=true
FRONTEND_URL=http://localhost:3000

# Google Calendar OAuth Tokens (will be set after authentication)
GOOGLE_ACCESS_TOKEN=
GOOGLE_REFRESH_TOKEN=
`;

  fs.appendFileSync(envPath, envContent);
  console.log('✅ Environment variables added to .env file');
}

// Step 4: Create OAuth callback route
function createOAuthCallback() {
  const callbackCode = `
// Add this to your main app.js or server.js file

// Google Calendar OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }

    // Exchange code for tokens
    const googleCalendarService = new GoogleCalendarService();
    const tokens = await googleCalendarService.getTokens(code);

    // Store tokens securely (you might want to save to database)
    console.log('Google Calendar tokens received:', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    // Update your .env file with the tokens
    // Or store in database for production use
    
    res.json({ 
      success: true, 
      message: 'Google Calendar integration successful!',
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

// Google Calendar authorization endpoint
app.get('/auth/google', (req, res) => {
  const googleCalendarService = new GoogleCalendarService();
  const authUrl = googleCalendarService.getAuthUrl();
  res.redirect(authUrl);
});
`;

  fs.writeFileSync('google-oauth-callback.js', callbackCode);
  console.log('✅ OAuth callback code created in google-oauth-callback.js');
}

// Step 5: Create test script
function createTestScript() {
  const testCode = `
// Google Calendar Integration Test Script
const { GoogleCalendarService } = require('./src/services/GoogleCalendarService');

async function testGoogleCalendarIntegration() {
  try {
    console.log('🧪 Testing Google Calendar Integration...');
    
    const googleCalendarService = new GoogleCalendarService();
    
    // Test 1: Create a test event
    console.log('\\n1. Creating test event...');
    const testEvent = {
      summary: 'Test Event - Google Calendar Integration',
      description: 'This is a test event to verify Google Calendar integration',
      start: {
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        timeZone: 'UTC'
      },
      end: {
        dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
        timeZone: 'UTC'
      },
      location: 'Test Location',
      attendees: [
        { email: 'test@example.com', displayName: 'Test User' }
      ]
    };
    
    const googleEventId = await googleCalendarService.createEvent(testEvent);
    console.log('✅ Test event created:', googleEventId);
    
    // Test 2: Get event details
    console.log('\\n2. Getting event details...');
    const eventDetails = await googleCalendarService.getEvent(googleEventId);
    console.log('✅ Event details retrieved:', eventDetails.summary);
    
    // Test 3: Generate RSVP link
    console.log('\\n3. Generating RSVP link...');
    const rsvpLink = googleCalendarService.generateRSVPLink(googleEventId, 'test@example.com');
    console.log('✅ RSVP link generated:', rsvpLink);
    
    // Test 4: Clean up - delete test event
    console.log('\\n4. Cleaning up test event...');
    await googleCalendarService.deleteEvent(googleEventId);
    console.log('✅ Test event deleted');
    
    console.log('\\n🎉 Google Calendar integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\\n💡 Make sure you have:');
    console.log('1. Set up Google Cloud Console credentials');
    console.log('2. Added credentials to .env file');
    console.log('3. Authenticated with Google Calendar (run /auth/google)');
  }
}

// Run the test
testGoogleCalendarIntegration();
`;

  fs.writeFileSync('test-google-calendar.js', testCode);
  console.log('✅ Test script created in test-google-calendar.js');
}

// Step 6: Create setup instructions
function createSetupInstructions() {
  const instructions = `
# Google Calendar Integration Setup Instructions

## 🚀 Quick Start

### 1. Run the setup script
\`\`\`bash
node google-calendar-setup.js
\`\`\`

### 2. Authenticate with Google Calendar
\`\`\`bash
# Start your server
npm start

# In another terminal, visit the auth URL
curl http://localhost:3000/auth/google
\`\`\`

### 3. Test the integration
\`\`\`bash
node test-google-calendar.js
\`\`\`

## 📋 Manual Setup Steps

### 1. Google Cloud Console Setup
1. Go to https://console.cloud.google.com/
2. Create a new project or select existing one
3. Enable Google Calendar API
4. Go to APIs & Services → Credentials
5. Create OAuth 2.0 Client ID (Web application)
6. Add redirect URI: http://localhost:3000/auth/google/callback

### 2. Environment Variables
Add these to your .env file:
\`\`\`env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ENABLED=true
FRONTEND_URL=http://localhost:3000
\`\`\`

### 3. OAuth Authentication
1. Visit http://localhost:3000/auth/google
2. Authorize the application
3. Copy the tokens from the callback response
4. Add tokens to your .env file or database

### 4. Test Integration
Run the test script to verify everything works:
\`\`\`bash
node test-google-calendar.js
\`\`\`

## 🔧 Troubleshooting

### Common Issues:
1. **Invalid credentials**: Check your Google Cloud Console setup
2. **OAuth errors**: Ensure redirect URI matches exactly
3. **API quota exceeded**: Check your Google Cloud Console quotas
4. **Token expired**: Re-authenticate to get new tokens

### Debug Mode:
Set \`GOOGLE_CALENDAR_DEBUG=true\` in your .env file for detailed logging.

## 📞 Support

If you encounter issues:
1. Check the Google Calendar API documentation
2. Verify your OAuth2 setup
3. Check the console logs for error messages
4. Ensure all environment variables are set correctly
`;

  fs.writeFileSync('GOOGLE_CALENDAR_SETUP_INSTRUCTIONS.md', instructions);
  console.log('✅ Setup instructions created in GOOGLE_CALENDAR_SETUP_INSTRUCTIONS.md');
}

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Main setup function
async function runSetup() {
  try {
    console.log('🔧 Setting up Google Calendar integration...\n');
    
    await configureEnvironment();
    createOAuthCallback();
    createTestScript();
    createSetupInstructions();
    
    console.log('\n🎉 Google Calendar integration setup completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Start your server: npm start');
    console.log('2. Visit: http://localhost:3000/auth/google');
    console.log('3. Authorize the application');
    console.log('4. Run test: node test-google-calendar.js');
    console.log('\n📖 See GOOGLE_CALENDAR_SETUP_INSTRUCTIONS.md for detailed instructions');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    rl.close();
  }
}

// Run the setup
runSetup();


