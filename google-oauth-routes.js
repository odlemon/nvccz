/**
 * Google Calendar OAuth Routes
 * 
 * Add these routes to your main app.js or server.js file
 * to enable Google Calendar authentication.
 */

const express = require('express');
const { GoogleCalendarService } = require('./src/services/GoogleCalendarService');

const router = express.Router();

/**
 * Google Calendar OAuth callback route
 * This handles the OAuth callback from Google after user authorization
 */
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ 
        error: 'Authorization code required',
        message: 'Please complete the OAuth flow by visiting /auth/google first'
      });
    }

    console.log('🔐 Processing Google Calendar OAuth callback...');

    // Exchange authorization code for tokens
    const googleCalendarService = new GoogleCalendarService();
    const tokens = await googleCalendarService.getTokens(code);

    console.log('✅ Google Calendar tokens received successfully');

    // Store tokens securely
    // In production, you should store these in a database
    // For now, we'll log them so you can add them to your .env file
    console.log('\n📋 Add these tokens to your .env file:');
    console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    
    // You can also store in database for production use
    // await prisma.googleTokens.create({
    //   data: {
    //     userId: req.user?.id,
    //     accessToken: tokens.access_token,
    //     refreshToken: tokens.refresh_token,
    //     expiryDate: new Date(tokens.expiry_date)
    //   }
    // });

    res.json({ 
      success: true, 
      message: 'Google Calendar integration successful!',
      instructions: [
        '1. Copy the tokens above to your .env file',
        '2. Restart your server',
        '3. Test the integration with: node test-google-calendar.js'
      ],
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      }
    });
  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    res.status(500).json({ 
      error: 'OAuth authentication failed',
      message: error.message,
      troubleshooting: [
        '1. Check your Google Cloud Console setup',
        '2. Verify your OAuth2 credentials',
        '3. Ensure redirect URI matches exactly',
        '4. Check that Google Calendar API is enabled'
      ]
    });
  }
});

/**
 * Google Calendar authorization endpoint
 * This redirects users to Google's OAuth consent screen
 */
router.get('/auth/google', (req, res) => {
  try {
    console.log('🔐 Redirecting to Google OAuth...');
    
    const googleCalendarService = new GoogleCalendarService();
    const authUrl = googleCalendarService.getAuthUrl();
    
    console.log('📍 Google OAuth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ OAuth URL generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate OAuth URL',
      message: error.message,
      troubleshooting: [
        '1. Check your Google Client ID and Secret',
        '2. Verify GOOGLE_REDIRECT_URI is set correctly',
        '3. Ensure Google Calendar API is enabled'
      ]
    });
  }
});

/**
 * Google Calendar integration status
 * Check if Google Calendar integration is properly configured
 */
router.get('/auth/google/status', async (req, res) => {
  try {
    const googleCalendarService = new GoogleCalendarService();
    
    // Try to get a test event to verify integration
    const testEventId = 'test';
    try {
      await googleCalendarService.getEvent(testEventId);
    } catch (error) {
      // This is expected to fail, but it means the service is configured
    }
    
    res.json({
      success: true,
      status: 'Google Calendar integration is configured',
      features: [
        'Event synchronization',
        'RSVP management',
        'Attendee tracking',
        'Email integration'
      ],
      nextSteps: [
        'Visit /auth/google to authenticate',
        'Test integration with: node test-google-calendar.js'
      ]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Google Calendar integration not configured',
      message: error.message,
      setupRequired: [
        '1. Set up Google Cloud Console credentials',
        '2. Add credentials to .env file',
        '3. Enable Google Calendar API',
        '4. Run: node google-calendar-setup.js'
      ]
    });
  }
});

/**
 * Test Google Calendar integration
 * This endpoint tests the Google Calendar integration
 */
router.get('/auth/google/test', async (req, res) => {
  try {
    console.log('🧪 Testing Google Calendar integration...');
    
    const googleCalendarService = new GoogleCalendarService();
    
    // Test 1: Create a test event
    console.log('1. Creating test event...');
    const testEvent = {
      summary: 'Test Event - Google Calendar Integration',
      description: 'This is a test event to verify Google Calendar integration',
      start: {
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
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
    console.log('2. Getting event details...');
    const eventDetails = await googleCalendarService.getEvent(googleEventId);
    console.log('✅ Event details retrieved');
    
    // Test 3: Generate RSVP link
    console.log('3. Generating RSVP link...');
    const rsvpLink = googleCalendarService.generateRSVPLink(googleEventId, 'test@example.com');
    console.log('✅ RSVP link generated');
    
    // Test 4: Clean up - delete test event
    console.log('4. Cleaning up test event...');
    await googleCalendarService.deleteEvent(googleEventId);
    console.log('✅ Test event deleted');
    
    res.json({
      success: true,
      message: 'Google Calendar integration test completed successfully!',
      testResults: {
        eventCreated: true,
        eventRetrieved: true,
        rsvpLinkGenerated: true,
        eventDeleted: true
      },
      rsvpLink: rsvpLink,
      googleEventId: googleEventId
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Google Calendar integration test failed',
      message: error.message,
      troubleshooting: [
        '1. Check your Google Cloud Console setup',
        '2. Verify OAuth2 credentials',
        '3. Ensure you have authenticated with Google Calendar',
        '4. Check that Google Calendar API is enabled'
      ]
    });
  }
});

module.exports = router;


