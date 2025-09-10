import request from 'supertest';
import app from '../../src/app';
import { setupTests, cleanupTests, authToken } from './setup';

describe('Stakeholder Management', () => {
  let stakeholderId: string = '';

  beforeAll(async () => {
    await setupTests();
  }, 30000);

  afterAll(async () => {
    await cleanupTests();
  });

  it('creates stakeholder', async () => {
    const payload = {
      stakeholderId: `stk_${Date.now()}`,
      type: 'INVESTOR',
      legalName: 'Test LP Co',
      email: `stk_${Date.now()}@example.com`,
      country: 'ZW'
    };
    const res = await request(app)
      .post('/api/stakeholders')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);
    expect([200,201]).toContain(res.status);
    stakeholderId = res.body?.data?.id || res.body?.stakeholder?.id || '';
    expect(stakeholderId).toBeTruthy();
  });

  it('lists stakeholders', async () => {
    const res = await request(app)
      .get('/api/stakeholders')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});


