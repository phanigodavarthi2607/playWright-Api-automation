import { test, expect } from '@playwright/test';
import { ApiConnector } from '../../src/connectors/api-connector.js';

test.describe('Example API Test Suite', () => {
  let api;

  test.beforeAll(async () => {
    api = new ApiConnector();
  });

  test('health check endpoint responds', async () => {
    const result = await api.healthCheck('/health');
    expect(result.status).toBeDefined();
  });

  test('GET endpoint returns valid response', async () => {
    const response = await api.get('/');
    expect(response.status).toBeLessThan(500);
  });

  test('response validation works', async () => {
    const response = await api.get('/');
    const validation = api.validateResponse(response, { status: 200 });
    expect(validation).toHaveProperty('valid');
    expect(validation).toHaveProperty('issues');
  });
});
