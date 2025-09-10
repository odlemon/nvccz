import request from 'supertest';
import app from '../../src/app';
import { setupTests, cleanupTests, authToken } from './setup';

describe('CEO Dashboard Drill-down', () => {
  beforeAll(async () => {
    await setupTests();
  }, 30000);

  afterAll(async () => {
    await cleanupTests();
  });

  it('GET /api/ceo-dashboard should return dashboard data', async () => {
    const res = await request(app)
      .get('/api/ceo-dashboard')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('financialPerformance');
    expect(res.body.data).toHaveProperty('investmentPipeline');
    expect(res.body.data).toHaveProperty('operationalMetrics');
  });

  it('GET /api/ceo-dashboard/drill-down/:type/:id should 400 on missing params', async () => {
    const res = await request(app)
      .get('/api/ceo-dashboard/drill-down/fund/')
      .set('Authorization', `Bearer ${authToken}`);
    expect([400,404]).toContain(res.status);
  });
});


