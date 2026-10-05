import fs from 'fs/promises';
import path from 'path';
import { createAgentLogger } from '../core/logger.js';

const log = createAgentLogger('Enterprise');

/**
 * Organisation-level configuration.  Lives at the framework root as
 * `enterprise.config.js` and defines shared standards across all projects.
 */
export const DEFAULT_ORG_CONFIG = {
  organization: {
    name: '',
    jiraBaseUrl: '',
    jiraEmail: '',
  },

  standards: {
    mandatoryBrowsers: ['chromium'],
    mandatoryTestCategories: ['smoke', 'regression'],
    namingConvention: {
      testFiles: '{feature}.spec.js',
      pageObjects: '{page-name}-page.js',
      projectKeys: 'lowercase-with-hyphens',
    },
    locatorStrategy: ['data-testid', 'id', 'aria-label', 'role', 'text', 'css'],
    maxTestTimeout: 120_000,
    requiredEnvs: ['dev', 'uat', 'prod'],
  },

  sharedDataSources: {},

  teams: [],

  reporting: {
    centralReportDir: './reports',
    retainHistoryDays: 90,
    notifyOnFailure: true,
  },
};

export class EnterpriseManager {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.configPath = path.join(rootDir, 'enterprise.config.js');
    this.registryPath = path.join(rootDir, 'enterprise-registry.json');
    this.config = null;
    this.registry = { projects: [], lastUpdated: null };
  }

  async loadConfig() {
    try {
      const mod = await import(this.configPath);
      this.config = mod.default;
      log.info('Enterprise config loaded');
    } catch {
      this.config = { ...DEFAULT_ORG_CONFIG };
      log.info('No enterprise config found, using defaults');
    }
    return this.config;
  }

  async loadRegistry() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      this.registry = JSON.parse(data);
      log.info(`Registry loaded: ${this.registry.projects.length} projects`);
    } catch {
      this.registry = { projects: [], lastUpdated: null };
    }
    return this.registry;
  }

  async saveRegistry() {
    this.registry.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.registryPath, JSON.stringify(this.registry, null, 2));
  }

  registerProject(projectConfig) {
    const existing = this.registry.projects.find((p) => p.key === projectConfig.project.key);
    const entry = {
      key: projectConfig.project.key,
      name: projectConfig.project.name,
      type: projectConfig.project.type,
      team: projectConfig.project.team,
      environments: Object.keys(projectConfig.environments),
      jiraProjectKey: projectConfig.jira.projectKey,
      testCategories: projectConfig.testing.categories,
      registeredAt: existing?.registeredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      Object.assign(existing, entry);
    } else {
      this.registry.projects.push(entry);
    }

    log.info(`Project registered: ${entry.key} (${entry.team})`);
    return entry;
  }

  getProjectsByTeam(teamName) {
    return this.registry.projects.filter((p) => p.team === teamName);
  }

  getAllTeams() {
    return [...new Set(this.registry.projects.map((p) => p.team))];
  }

  validateAgainstStandards(projectConfig) {
    if (!this.config) return { compliant: true, violations: [] };

    const violations = [];
    const standards = this.config.standards;

    for (const browser of standards.mandatoryBrowsers || []) {
      if (!projectConfig.testing.browsers?.includes(browser)) {
        violations.push(`Missing mandatory browser: ${browser}`);
      }
    }

    for (const category of standards.mandatoryTestCategories || []) {
      if (!projectConfig.testing.categories?.includes(category)) {
        violations.push(`Missing mandatory test category: ${category}`);
      }
    }

    for (const env of standards.requiredEnvs || []) {
      if (!projectConfig.environments[env]) {
        violations.push(`Missing required environment: ${env}`);
      }
    }

    return { compliant: violations.length === 0, violations };
  }

  async generateCrossProjectReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalProjects: this.registry.projects.length,
      teams: this.getAllTeams(),
      byTeam: {},
      byType: {},
    };

    for (const project of this.registry.projects) {
      if (!report.byTeam[project.team]) {
        report.byTeam[project.team] = { projects: [], totalTests: 0 };
      }
      report.byTeam[project.team].projects.push(project.key);

      if (!report.byType[project.type]) report.byType[project.type] = 0;
      report.byType[project.type]++;
    }

    return report;
  }
}

export default EnterpriseManager;
