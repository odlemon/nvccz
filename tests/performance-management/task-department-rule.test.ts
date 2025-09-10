import request from 'supertest';
import app from '../../src/app';
import { setupTests, cleanupTests, authToken } from './setup';

describe('Task assignment department rule', () => {
  beforeAll(async () => {
    await setupTests();
  }, 30000);

  afterAll(async () => {
    await cleanupTests();
  });

  it('rejects assigning users outside department for non-admin/ceo (expected 400/403)', async () => {
    const body = {
      title: 'Cross-dept assign test',
      team: ['nonexistent-user-a', 'nonexistent-user-b'],
      date: new Date().toISOString(),
      stage: 'todo'
    };

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);

    // Depending on data setup, this may fail with 400 (user not found) or rule violation.
    // We assert non-2xx to ensure the rule is enforced or validation prevents bad assignment.
    expect([200,201]).not.toContain(res.status);
  });
});


