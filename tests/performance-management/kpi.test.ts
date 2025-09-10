import { getAuthenticatedRequest, createTestKpi, testKpiId } from './setup';

describe('KPI CRUD Tests', () => {
  let createdKpiId: string;

  describe('POST /api/kpis - CREATE KPI', () => {
    it('should create a new KPI successfully', async () => {
      const kpiData = createTestKpi();
      
      const response = await getAuthenticatedRequest()
        .post('/api/kpis')
        .send(kpiData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(kpiData.name);
      expect(response.body.data.type).toBe(kpiData.type);
      expect(response.body.data.weightValue).toBe(kpiData.weightValue);
      expect(response.body.data.hasUnit).toBe(kpiData.hasUnit);
      expect(response.body.data.unit).toBe(kpiData.unit);
      expect(response.body.data.unitSymbol).toBe(kpiData.unitSymbol);

      createdKpiId = response.body.data.id;
    });

    it('should create KPI without unit information', async () => {
      const kpiData = {
        name: 'Customer Satisfaction Score',
        type: 'operational',
        branch: 'main',
        weightValue: 20.00,
        hasUnit: false
      };

      const response = await getAuthenticatedRequest()
        .post('/api/kpis')
        .send(kpiData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.name).toBe(kpiData.name);
      expect(response.body.data.hasUnit).toBe(false);
    });

    it('should fail with missing required fields', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/kpis')
        .send({
          type: 'financial'
          // Missing 'name' field
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid data types', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/kpis')
        .send({
          name: 'Test KPI',
          type: 'financial',
          weightValue: 'invalid-number'
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/kpis/:id - READ KPI BY ID', () => {
    it('should get KPI by ID successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/kpis/${createdKpiId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id', createdKpiId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('type');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should return 404 for non-existent KPI', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/kpis/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('GET /api/kpis - READ ALL KPIs', () => {
    it('should get all KPIs successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/kpis')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check if our created KPI is in the list
      const createdKpi = response.body.data.find((kpi: any) => kpi.id === createdKpiId);
      expect(createdKpi).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/kpis?page=1&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('PUT /api/kpis/:id - UPDATE KPI', () => {
    it('should update KPI successfully', async () => {
      const updateData = {
        name: 'Updated Revenue Growth',
        weightValue: 30.00,
        isActive: false
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/kpis/${createdKpiId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.weightValue).toBe(updateData.weightValue);
      expect(response.body.data.isActive).toBe(updateData.isActive);
    });

    it('should update only provided fields', async () => {
      const updateData = {
        weightValue: 35.00
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/kpis/${createdKpiId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.weightValue).toBe(updateData.weightValue);
      // Other fields should remain unchanged
      expect(response.body.data.name).toBe('Updated Revenue Growth');
    });

    it('should return 404 for non-existent KPI update', async () => {
      const response = await getAuthenticatedRequest()
        .put('/api/kpis/non-existent-id')
        .send({ name: 'Updated Name' })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('DELETE /api/kpis/:id - DELETE KPI', () => {
    it('should delete KPI successfully', async () => {
      const response = await getAuthenticatedRequest()
        .delete(`/api/kpis/${createdKpiId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent KPI deletion', async () => {
      const response = await getAuthenticatedRequest()
        .delete('/api/kpis/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/kpis/statistics - KPI STATISTICS', () => {
    it('should get KPI statistics successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/kpis/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalKpis');
      expect(response.body.data).toHaveProperty('activeKpis');
      expect(response.body.data).toHaveProperty('inactiveKpis');
      expect(response.body.data).toHaveProperty('kpisByType');
      expect(typeof response.body.data.totalKpis).toBe('number');
    });
  });
});

