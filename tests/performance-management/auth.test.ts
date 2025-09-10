import request from 'supertest';
import app from '../../src/app';
import { TEST_CONFIG, setupTests } from './setup';

describe('Authentication Tests', () => {
  beforeAll(async () => {
    await setupTests();
  });

  describe('POST /api/auth/login', () => {
    it('should login admin user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(TEST_CONFIG.adminCredentials)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe(TEST_CONFIG.adminCredentials.email);
    });

    it('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@nvccz.co.zw',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Protected Endpoint Access', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/kpis')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('token');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/kpis')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });
  });
});
