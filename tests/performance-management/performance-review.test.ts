import request from 'supertest';
import app from '../../src/app';
import { setupTests, cleanupTests, authToken } from './setup';

describe('Performance Reviews', () => {
  let reviewId: string = '';

  beforeAll(async () => {
    await setupTests();
  }, 30000);

  afterAll(async () => {
    await cleanupTests();
  });

  it('creates performance review (basic)', async () => {
    const payload = {
      reviewType: 'QUARTERLY',
      reviewPeriod: '2025-Q3',
      title: 'Q3 Review',
      status: 'IN_PROGRESS'
    };
    const res = await request(app)
      .post('/api/performance-reviews')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);
    expect([200,201]).toContain(res.status);
    reviewId = res.body?.data?.id || res.body?.review?.id || '';
  });

  it('lists performance reviews', async () => {
    const res = await request(app)
      .get('/api/performance-reviews')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});


