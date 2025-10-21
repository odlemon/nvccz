// Simple test to verify cashbook routes are working
const express = require('express');
const app = express();

// Mock authentication middleware
app.use((req, res, next) => {
  req.user = {
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User'
  };
  next();
});

// Test cashbook routes
app.get('/api/cashbook/test', (req, res) => {
  res.json({ 
    success: true, 
    message: "Cashbook routes are working!",
    timestamp: new Date().toISOString()
  });
});

app.get('/api/cashbook/banks', (req, res) => {
  res.json({
    success: true,
    message: "Banks endpoint working",
    data: [
      {
        id: "test-bank-1",
        name: "Test Bank Account",
        accountNumber: "TEST-001",
        isActive: true
      }
    ]
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test endpoints:`);
  console.log(`- GET http://localhost:${PORT}/api/cashbook/test`);
  console.log(`- GET http://localhost:${PORT}/api/cashbook/banks`);
});
