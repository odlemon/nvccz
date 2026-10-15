import request from 'supertest';

const TEST_CONFIG = {
  baseUrl: process.env.TEST_API_URL || 'http://localhost:3010',
  adminCredentials: {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  }
};

describe('CEO Dashboard Simple Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Login as admin
    const loginResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/auth/login')
      .send(TEST_CONFIG.adminCredentials);

    authToken = loginResponse.body.token;
    console.log('✅ Admin authentication successful');
  });

  describe('CEO Dashboard - Basic Functionality', () => {
    it('should get CEO dashboard data', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 CEO DASHBOARD Response Status:', response.status);
      console.log('🔍 CEO DASHBOARD Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should get fund performance data', async () => {
      // First get all funds to get a fund ID
      const fundsResponse = await request(TEST_CONFIG.baseUrl)
        .get('/api/funds')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 FUNDS Response Status:', fundsResponse.status);
      console.log('🔍 FUNDS Response Body:', JSON.stringify(fundsResponse.body, null, 2));

      if (fundsResponse.status === 200 && fundsResponse.body.funds && fundsResponse.body.funds.length > 0) {
        const fundId = fundsResponse.body.funds[0].id;
        
        const response = await request(TEST_CONFIG.baseUrl)
          .get(`/api/ceo-dashboard/fund-performance/${fundId}`)
          .set('Authorization', `Bearer ${authToken}`);

        console.log('🔍 FUND PERFORMANCE Response Status:', response.status);
        console.log('🔍 FUND PERFORMANCE Response Body:', JSON.stringify(response.body, null, 2));

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
      } else {
        console.log('⚠️ No funds found, skipping fund performance test');
      }
    });

    it('should get pipeline analytics', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/pipeline-analytics')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 PIPELINE ANALYTICS Response Status:', response.status);
      console.log('🔍 PIPELINE ANALYTICS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should get portfolio health', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/portfolio-health')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 PORTFOLIO HEALTH Response Status:', response.status);
      console.log('🔍 PORTFOLIO HEALTH Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should get operational metrics', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/operational-metrics')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 OPERATIONAL METRICS Response Status:', response.status);
      console.log('🔍 OPERATIONAL METRICS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should get key insights', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/key-insights')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 KEY INSIGHTS Response Status:', response.status);
      console.log('🔍 KEY INSIGHTS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });
  });
});


