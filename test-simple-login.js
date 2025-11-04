// Simple test to get auth token
const http = require('http');

const postData = JSON.stringify({
  email: 'admin@nvccz.co.zw',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\nRESPONSE BODY:');
    console.log(data);
    try {
      const parsed = JSON.parse(data);
      if (parsed.token) {
        console.log('\n✅ TOKEN RECEIVED:', parsed.token.substring(0, 50) + '...');
      }
    } catch (e) {
      console.log('Not JSON');
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();

