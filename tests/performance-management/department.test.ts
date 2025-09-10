import { getAuthenticatedRequest, createTestDepartment } from './setup';

describe('Department CRUD Tests', () => {
  let createdDepartmentId: string;

  describe('POST /api/departments - CREATE DEPARTMENT', () => {
    it('should create a new department successfully', async () => {
      const departmentData = createTestDepartment();
      
      const response = await getAuthenticatedRequest()
        .post('/api/departments')
        .send(departmentData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(departmentData.name);
      expect(response.body.data.description).toBe(departmentData.description);
      expect(response.body.data.branch).toBe(departmentData.branch);
      expect(response.body.data.isActive).toBe(true);

      createdDepartmentId = response.body.data.id;
    });

    it('should create department with minimal required fields', async () => {
      const departmentData = {
        name: 'Minimal Department'
      };

      const response = await getAuthenticatedRequest()
        .post('/api/departments')
        .send(departmentData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.name).toBe(departmentData.name);
      expect(response.body.data.isActive).toBe(true);
    });

    it('should fail with missing required name field', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/departments')
        .send({
          description: 'Department without name'
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with duplicate department name', async () => {
      const departmentData = createTestDepartment();
      
      // First creation should succeed
      await getAuthenticatedRequest()
        .post('/api/departments')
        .send(departmentData)
        .expect(201);

      // Second creation with same name should fail
      const response = await getAuthenticatedRequest()
        .post('/api/departments')
        .send(departmentData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('GET /api/departments/:id - READ DEPARTMENT BY ID', () => {
    it('should get department by ID successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/departments/${createdDepartmentId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id', createdDepartmentId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('isActive');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should return 404 for non-existent department', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/departments/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('GET /api/departments - READ ALL DEPARTMENTS', () => {
    it('should get all departments successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/departments')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check if our created department is in the list
      const createdDepartment = response.body.data.find((dept: any) => dept.id === createdDepartmentId);
      expect(createdDepartment).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/departments?page=1&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by active status', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/departments?isActive=true')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned departments should be active
      response.body.data.forEach((dept: any) => {
        expect(dept.isActive).toBe(true);
      });
    });
  });

  describe('PUT /api/departments/:id - UPDATE DEPARTMENT', () => {
    it('should update department successfully', async () => {
      const updateData = {
        name: 'Updated Engineering Department',
        description: 'Updated software development department',
        isActive: false
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/departments/${createdDepartmentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.isActive).toBe(updateData.isActive);
    });

    it('should update only provided fields', async () => {
      const updateData = {
        description: 'Only description updated'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/departments/${createdDepartmentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.description).toBe(updateData.description);
      // Other fields should remain unchanged
      expect(response.body.data.name).toBe('Updated Engineering Department');
    });

    it('should return 404 for non-existent department update', async () => {
      const response = await getAuthenticatedRequest()
        .put('/api/departments/non-existent-id')
        .send({ name: 'Updated Name' })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('DELETE /api/departments/:id - DELETE DEPARTMENT', () => {
    it('should delete department successfully', async () => {
      const response = await getAuthenticatedRequest()
        .delete(`/api/departments/${createdDepartmentId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent department deletion', async () => {
      const response = await getAuthenticatedRequest()
        .delete('/api/departments/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/departments/statistics - DEPARTMENT STATISTICS', () => {
    it('should get department statistics successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/departments/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalDepartments');
      expect(response.body.data).toHaveProperty('activeDepartments');
      expect(response.body.data).toHaveProperty('inactiveDepartments');
      expect(typeof response.body.data.totalDepartments).toBe('number');
    });
  });
});



