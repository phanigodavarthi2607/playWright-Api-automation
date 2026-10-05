import fs from 'fs/promises';
import path from 'path';
import { JiraConnector } from '../../connectors/jira-connector.js';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';

const log = createAgentLogger('JiraAgent');

export class JiraAgent {
  constructor() {
    this.jira = new JiraConnector();
    this.projectKey = config.jira.projectKey;
  }

  async fetchAutomatableStories() {
    log.info(`Fetching automatable stories for project ${this.projectKey}`);
    const issues = await this.jira.getStoriesWithAutoTestCases(this.projectKey);
    const stories = [];

    for (const issue of issues) {
      const ac = await this.jira.getAcceptanceCriteria(issue.key);
      stories.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name,
        acceptanceCriteria: ac.acceptanceCriteria,
        rawDescription: ac.description,
        testScenarios: this._deriveTestScenarios(ac),
      });
    }

    log.info(`Processed ${stories.length} automatable stories`);
    return stories;
  }

  async fetchStoriesByJql(jql) {
    const issues = await this.jira.searchIssues(jql);
    return Promise.all(issues.map((issue) => this.jira.getAcceptanceCriteria(issue.key)));
  }

  async fetchSingleStory(issueKey) {
    const ac = await this.jira.getAcceptanceCriteria(issueKey);
    return {
      ...ac,
      testScenarios: this._deriveTestScenarios(ac),
    };
  }

  _deriveTestScenarios(storyData) {
    const scenarios = [];
    const { acceptanceCriteria, summary } = storyData;

    if (!acceptanceCriteria?.length) {
      scenarios.push({
        name: `Verify: ${summary}`,
        type: 'functional',
        steps: [{ action: 'verify', detail: summary }],
        priority: 'medium',
      });
      return scenarios;
    }

    const givenWhenThen = this._groupGherkinSteps(acceptanceCriteria);
    if (givenWhenThen.length > 0) return givenWhenThen;

    for (const [index, criterion] of acceptanceCriteria.entries()) {
      scenarios.push({
        name: `AC-${index + 1}: ${criterion.substring(0, 80)}`,
        type: this._classifyScenario(criterion),
        steps: this._parseSteps(criterion),
        priority: 'medium',
        source: criterion,
      });
    }

    return scenarios;
  }

  _groupGherkinSteps(criteria) {
    const scenarios = [];
    let current = null;

    for (const line of criteria) {
      const lower = line.toLowerCase().trim();
      if (lower.startsWith('given ')) {
        if (current) scenarios.push(current);
        current = { name: '', type: 'functional', steps: [], priority: 'medium' };
        current.steps.push({ keyword: 'given', text: line });
      } else if (lower.startsWith('when ') && current) {
        current.steps.push({ keyword: 'when', text: line });
        current.name = line.substring(5).trim();
      } else if (lower.startsWith('then ') && current) {
        current.steps.push({ keyword: 'then', text: line });
      } else if (lower.startsWith('and ') && current) {
        const prev = current.steps[current.steps.length - 1];
        current.steps.push({ keyword: prev?.keyword || 'and', text: line });
      }
    }

    if (current) scenarios.push(current);
    return scenarios;
  }

  _classifyScenario(criterion) {
    const lower = criterion.toLowerCase();
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('response')) return 'api';
    if (lower.includes('data') || lower.includes('database') || lower.includes('query')) return 'data';
    if (lower.includes('calculate') || lower.includes('sum') || lower.includes('total')) return 'calculation';
    if (lower.includes('display') || lower.includes('show') || lower.includes('page') || lower.includes('button')) return 'ui';
    return 'functional';
  }

  _parseSteps(criterion) {
    const words = criterion.split(/\s+/);
    const steps = [];
    let currentStep = [];

    for (const word of words) {
      currentStep.push(word);
      if (word.endsWith('.') || word.endsWith(',')) {
        steps.push({ action: 'verify', detail: currentStep.join(' ') });
        currentStep = [];
      }
    }

    if (currentStep.length > 0) {
      steps.push({ action: 'verify', detail: currentStep.join(' ') });
    }

    return steps.length > 0 ? steps : [{ action: 'verify', detail: criterion }];
  }

  async reportTestResult(issueKey, testResult) {
    const status = testResult.passed ? 'PASSED' : 'FAILED';
    const comment = [
      `Automated Test Result: ${status}`,
      `Test: ${testResult.testName}`,
      `Duration: ${testResult.duration}ms`,
      testResult.error ? `Error: ${testResult.error}` : '',
      `Run at: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    await this.jira.addComment(issueKey, comment);
    log.info(`Reported ${status} result for ${issueKey}`);
  }

  async exportStoriesToFile(outputPath) {
    const stories = await this.fetchAutomatableStories();
    const outputFile = outputPath || path.join(config.paths.reports, 'jira-stories.json');
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(stories, null, 2));
    log.info(`Exported ${stories.length} stories to ${outputFile}`);
    return stories;
  }
}

export default JiraAgent;

if (process.argv[1] && process.argv[1].includes('jira-agent')) {
  const agent = new JiraAgent();
  agent.exportStoriesToFile().catch((err) => {
    log.error('Jira Agent failed', { error: err.message });
    process.exit(1);
  });
}
