// @ts-nocheck
import fetch from 'node-fetch';

async function testBatchEndpoints() {
  try {
    console.log('🧪 Testing Batch Endpoints');
    
    // Step 1: Login to get authentication token
    console.log('🔐 Logging in...');
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@nvccz.co.zw',
        password: 'admin123'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('✅ Login response:', JSON.stringify(loginData, null, 2));
    
    if (!loginData.success) {
      throw new Error('Login failed');
    }
    
    const token = loginData.data?.token || loginData.token;
    console.log('🎫 Token obtained:', token.substring(0, 20) + '...');
    
    // Step 2: Test list batches endpoint
    console.log('\n📋 Testing list batches endpoint...');
    const batchesResponse = await fetch('http://localhost:3000/api/cashbook/batches', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const batchesData = await batchesResponse.json();
    console.log('✅ Batches response:', JSON.stringify(batchesData, null, 2));
    
    // Step 3: Test CSV import (if we have a sample file)
    console.log('\n📁 Testing CSV import...');
    const FormData = require('form-data');
    const fs = require('fs');
    
    const form = new FormData();
    form.append('file', fs.createReadStream('sample-cashbook-transactions-clean.csv'));
    
    const importResponse = await fetch('http://localhost:3000/api/cashbook/batches/import', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });
    
    const importData = await importResponse.json();
    console.log('✅ Import response:', JSON.stringify(importData, null, 2));
    
    if (importData.success && importData.data.batchId) {
      const batchId = importData.data.batchId;
      
      // Step 4: Test get batch details
      console.log('\n🔍 Testing get batch details...');
      const batchResponse = await fetch(`http://localhost:3000/api/cashbook/batches/${batchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const batchData = await batchResponse.json();
      console.log('✅ Batch details:', JSON.stringify(batchData, null, 2));
      
      // Step 5: Test update batch
      console.log('\n✏️ Testing update batch...');
      const updateResponse = await fetch(`http://localhost:3000/api/cashbook/batches/${batchId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Batch Name',
          description: 'Updated description'
        })
      });
      
      const updateData = await updateResponse.json();
      console.log('✅ Update response:', JSON.stringify(updateData, null, 2));
    }
    
    console.log('\n🎉 All batch endpoint tests completed!');
    
  } catch (error: any) {
    console.error('❌ Error testing batch endpoints:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testBatchEndpoints();
