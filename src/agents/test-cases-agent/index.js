import fs from 'fs/promises';
import path from 'path';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';
import { JiraConnector } from '../../connectors/jira-connector.js';

const log = createAgentLogger('TestCasesAgent');

export class TestCasesAgent {
  constructor() {
    this.jira = new JiraConnector();
    this.testCaseRegistry = new Map();
    this.registryPath = path.join(config.paths.reports, 'test-case-registry.json');
  }

  async loadRegistry() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      const entries = JSON.parse(data);
      for (const entry of entries) {
        this.testCaseRegistry.set(entry.id, entry);
      }
      log.info(`Loaded ${entries.length} test cases from registry`);
    } catch {
      log.info('No existing registry found, starting fresh');
    }
  }

  async saveRegistry() {
    const entries = Array.from(this.testCaseRegistry.values());
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, JSON.stringify(entries, null, 2));
    log.info(`Saved ${entries.length} test cases to registry`);
  }

  registerTestCase(testCase) {
    const id = testCase.id || `TC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const entry = {
      id,
      jiraKey: testCase.jiraKey,
      name: testCase.name,
      type: testCase.type || 'functional',
      priority: testCase.priority || 'medium',
      status: testCase.status || 'pending',
      automated: testCase.automated || false,
      testFile: testCase.testFile || null,
      scenarios: testCase.scenarios || [],
      lastRun: null,
      lastResult: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.testCaseRegistry.set(id, entry);
    log.info(`Registered test case: ${id} - ${entry.name}`);
    return entry;
  }

  updateTestCase(id, updates) {
    const existing = this.testCaseRegistry.get(id);
    if (!existing) throw new Error(`Test case ${id} not found`);

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.testCaseRegistry.set(id, updated);
    return updated;
  }

  markAutomated(id, testFile) {
    return this.updateTestCase(id, { automated: true, testFile, status: 'automated' });
  }

  recordResult(id, result) {
    return this.updateTestCase(id, {
      lastRun: new Date().toISOString(),
      lastResult: {
        passed: result.passed,
        duration: result.duration,
        error: result.error || null,
        screenshot: result.screenshot || null,
      },
    });
  }

  getTestCasesByJiraKey(jiraKey) {
    return Array.from(this.testCaseRegistry.values()).filter((tc) => tc.jiraKey === jiraKey);
  }

  getPendingTestCases() {
    return Array.from(this.testCaseRegistry.values()).filter((tc) => !tc.automated);
  }

  getAutomatedTestCases() {
    return Array.from(this.testCaseRegistry.values()).filter((tc) => tc.automated);
  }

  getFailingTestCases() {
    return Array.from(this.testCaseRegistry.values()).filter((tc) => tc.lastResult && !tc.lastResult.passed);
  }

  async syncWithJira() {
    log.info('Syncing test cases with Jira');
    const jql = `project = "${config.jira.projectKey}" AND "${config.jira.autoField}" = "Yes"`;
    const issues = await this.jira.searchIssues(jql);

    let synced = 0;
    for (const issue of issues) {
      const existing = this.getTestCasesByJiraKey(issue.key);
      if (existing.length === 0) {
        const ac = await this.jira.getAcceptanceCriteria(issue.key);
        this.registerTestCase({
          jiraKey: issue.key,
          name: issue.fields.summary,
          type: 'functional',
          scenarios: ac.acceptanceCriteria.map((c) => ({ description: c })),
        });
        synced++;
      }
    }

    await this.saveRegistry();
    log.info(`Synced ${synced} new test cases from Jira (total: ${this.testCaseRegistry.size})`);
    return { total: this.testCaseRegistry.size, newlyAdded: synced };
  }

  generateSummary() {
    const all = Array.from(this.testCaseRegistry.values());
    return {
      total: all.length,
      automated: all.filter((t) => t.automated).length,
      pending: all.filter((t) => !t.automated).length,
      passing: all.filter((t) => t.lastResult?.passed).length,
      failing: all.filter((t) => t.lastResult && !t.lastResult.passed).length,
      neverRun: all.filter((t) => !t.lastRun).length,
      byType: all.reduce((acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

export default TestCasesAgent;

if (process.argv[1] && process.argv[1].includes('test-cases-agent')) {
  const agent = new TestCasesAgent();
  agent
    .loadRegistry()
    .then(() => agent.syncWithJira())
    .then((result) => log.info('Sync complete', result))
    .catch((err) => {
      log.error('Test Cases Agent failed', { error: err.message });
      process.exit(1);
    });
}
