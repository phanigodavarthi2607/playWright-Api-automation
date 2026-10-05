import axios from 'axios';
import config from '../core/config.js';
import { createAgentLogger } from '../core/logger.js';

const log = createAgentLogger('JiraConnector');

export class JiraConnector {
  constructor(overrides = {}) {
    const jiraCfg = { ...config.jira, ...overrides };
    this.baseUrl = jiraCfg.baseUrl;
    this.autoField = jiraCfg.autoField;

    this.client = axios.create({
      baseURL: `${jiraCfg.baseUrl}/rest/api/3`,
      auth: { username: jiraCfg.email, password: jiraCfg.apiToken },
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  }

  async searchIssues(jql, fields = ['summary', 'description', 'status', 'acceptanceCriteria', this.autoField]) {
    log.info('Searching Jira issues', { jql });
    const results = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const { data } = await this.client.get('/search', {
        params: { jql, fields: fields.join(','), startAt, maxResults },
      });
      results.push(...data.issues);
      if (startAt + maxResults >= data.total) break;
      startAt += maxResults;
    }

    log.info(`Found ${results.length} issues`);
    return results;
  }

  async getIssue(issueKey) {
    const { data } = await this.client.get(`/issue/${issueKey}`);
    return data;
  }

  async getStoriesWithAutoTestCases(projectKey) {
    const jql = `project = "${projectKey}" AND "${this.autoField}" = "Yes" AND type in (Story, Task)`;
    return this.searchIssues(jql);
  }

  async getAcceptanceCriteria(issueKey) {
    const issue = await this.getIssue(issueKey);
    const description = this._extractText(issue.fields.description);
    const ac = this._parseAcceptanceCriteria(description);
    return {
      issueKey,
      summary: issue.fields.summary,
      description,
      acceptanceCriteria: ac,
      status: issue.fields.status?.name,
      automate: issue.fields[this.autoField],
    };
  }

  async addComment(issueKey, body) {
    await this.client.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
      },
    });
    log.info(`Comment added to ${issueKey}`);
  }

  async transitionIssue(issueKey, transitionName) {
    const { data } = await this.client.get(`/issue/${issueKey}/transitions`);
    const transition = data.transitions.find((t) => t.name.toLowerCase() === transitionName.toLowerCase());
    if (!transition) throw new Error(`Transition "${transitionName}" not found for ${issueKey}`);

    await this.client.post(`/issue/${issueKey}/transitions`, { transition: { id: transition.id } });
    log.info(`Issue ${issueKey} transitioned to "${transitionName}"`);
  }

  _extractText(adfContent) {
    if (!adfContent) return '';
    if (typeof adfContent === 'string') return adfContent;

    const extract = (node) => {
      if (!node) return '';
      if (node.type === 'text') return node.text || '';
      if (node.content) return node.content.map(extract).join('');
      return '';
    };

    return extract(adfContent);
  }

  _parseAcceptanceCriteria(text) {
    if (!text) return [];

    const criteria = [];
    const patterns = [
      /(?:given|when|then|and)\s+(.+)/gi,
      /(?:ac|acceptance criteria)\s*\d*[:.]\s*(.+)/gi,
      /[-*]\s+(.+)/g,
      /\d+[.)]\s+(.+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const criterion = match[1].trim();
        if (criterion.length > 5 && !criteria.includes(criterion)) {
          criteria.push(criterion);
        }
      }
    }

    return criteria;
  }
}

export default JiraConnector;
