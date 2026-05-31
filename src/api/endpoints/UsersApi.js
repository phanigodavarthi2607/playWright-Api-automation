/**
 * Example endpoint wrapper. Group related routes here so specs stay clean.
 * Copy the pattern for each service module you need to test.
 */
class UsersApi {
  constructor(api) {
    this.api = api;
  }

  list({ page, pageSize } = {}) {
    return this.api.get('/v1/users', { query: { page, pageSize } });
  }

  getById(id) {
    return this.api.get(`/v1/users/${id}`);
  }

  create(body) {
    return this.api.post('/v1/users', { body });
  }
}

module.exports = { UsersApi };
