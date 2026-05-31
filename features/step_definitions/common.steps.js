const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { getPath, tableToObject, maybeJson } = require('../support/helpers');

const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function verb(method) {
  const m = String(method).toUpperCase();
  if (!VERBS.includes(m)) {
    throw new Error(`Unsupported HTTP method "${method}". Expected one of ${VERBS.join(', ')}`);
  }
  return m.toLowerCase();
}

async function send(world, method, path, opts = {}) {
  world.request = { method, path, ...opts };
  world.response = await world.api[verb(method)](path, opts);
  try {
    world.responseBody = await world.response.json();
  } catch {
    world.responseBody = await world.response.text().catch(() => null);
  }
}

/* ---------------------------------------------------------------- */
/* Auth / environment                                                */
/* ---------------------------------------------------------------- */

Given('I am authenticated', function () {
  // No-op: the Before hook builds an authenticated ApiClient. This step
  // exists so feature files can read naturally.
  assert.ok(this.api, 'ApiClient was not initialised by the Before hook.');
});

Given('the test runs against the {string} environment', function (envName) {
  assert.equal(
    this.env.name,
    envName.toLowerCase(),
    `Active env is "${this.env.name}" but feature requires "${envName}".`,
  );
});

/* ---------------------------------------------------------------- */
/* Request steps                                                     */
/* ---------------------------------------------------------------- */

When('I send a {word} request to {string}', async function (method, path) {
  await send(this, method, path);
});

When('I send a {word} request to {string} with query:', async function (method, path, table) {
  await send(this, method, path, { query: tableToObject(table) });
});

When('I send a {word} request to {string} with body:', async function (method, path, docString) {
  await send(this, method, path, { body: maybeJson(docString) });
});

When(
  'I send a {word} request to {string} with headers:',
  async function (method, path, table) {
    await send(this, method, path, { headers: tableToObject(table) });
  },
);

When('I save the response field {string} as {string}', function (path, key) {
  this.scratch[key] = getPath(this.responseBody, path);
});

/* ---------------------------------------------------------------- */
/* Response assertions                                               */
/* ---------------------------------------------------------------- */

Then('the response status should be {int}', function (status) {
  assert.equal(
    this.response.status(),
    status,
    `Expected status ${status} but got ${this.response.status()}. ` +
      `Body: ${JSON.stringify(this.responseBody)?.slice(0, 500)}`,
  );
});

Then('the response status should be one of {string}', function (csv) {
  const allowed = csv.split(',').map((s) => Number(s.trim()));
  const actual = this.response.status();
  assert.ok(
    allowed.includes(actual),
    `Expected status in [${allowed.join(', ')}] but got ${actual}.`,
  );
});

Then('the response should have header {string}', function (name) {
  const h = this.response.headers()[name.toLowerCase()];
  assert.ok(h, `Expected header "${name}" to be present.`);
});

Then('the response field {string} should equal {string}', function (path, expected) {
  const actual = getPath(this.responseBody, path);
  assert.equal(
    String(actual),
    expected,
    `Expected ${path} == "${expected}" but got "${actual}".`,
  );
});

Then('the response field {string} should exist', function (path) {
  const actual = getPath(this.responseBody, path);
  assert.notEqual(actual, undefined, `Expected field "${path}" to be present.`);
});

Then('the response field {string} should have {int} items', function (path, count) {
  const actual = getPath(this.responseBody, path);
  assert.ok(Array.isArray(actual), `Field "${path}" is not an array.`);
  assert.equal(actual.length, count, `Expected ${count} items in "${path}", got ${actual.length}.`);
});
