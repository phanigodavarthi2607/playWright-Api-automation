import axios from 'axios';
import config from '../core/config.js';
import { createAgentLogger } from '../core/logger.js';

const log = createAgentLogger('ApiConnector');

export class ApiConnector {
  constructor(baseURL, headers = {}) {
    this.client = axios.create({
      baseURL: baseURL || config.app.apiBaseUrl,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 30_000,
      validateStatus: () => true,
    });
    this.interceptors();
  }

  interceptors() {
    this.client.interceptors.request.use((req) => {
      req._startTime = Date.now();
      log.info(`${req.method.toUpperCase()} ${req.url}`);
      return req;
    });

    this.client.interceptors.response.use((res) => {
      const duration = Date.now() - res.config._startTime;
      log.info(`Response ${res.status} (${duration}ms)`, { url: res.config.url });
      return res;
    });
  }

  setAuthToken(token) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async get(path, params = {}) {
    return this.client.get(path, { params });
  }

  async post(path, data = {}) {
    return this.client.post(path, data);
  }

  async put(path, data = {}) {
    return this.client.put(path, data);
  }

  async patch(path, data = {}) {
    return this.client.patch(path, data);
  }

  async delete(path) {
    return this.client.delete(path);
  }

  async healthCheck(path = '/health') {
    const res = await this.get(path);
    return { healthy: res.status === 200, status: res.status, data: res.data };
  }

  validateResponse(response, { status, schema, requiredFields } = {}) {
    const issues = [];

    if (status && response.status !== status) {
      issues.push(`Expected status ${status}, got ${response.status}`);
    }

    if (requiredFields && response.data) {
      for (const field of requiredFields) {
        if (!(field in response.data)) {
          issues.push(`Missing required field: ${field}`);
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }
}

export default ApiConnector;
