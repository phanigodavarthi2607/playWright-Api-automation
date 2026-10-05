import { execSync } from 'child_process';
import path from 'path';
import { JiraAgent } from './jira-agent/index.js';
import { CodingAgent } from './coding-agent/index.js';
import { TestCasesAgent } from './test-cases-agent/index.js';
import { UIAgent } from './ui-agent/index.js';
import { DataComparisonAgent } from './data-comparison-agent/index.js';
import { TestAnalysisAgent } from './test-analysis-agent/index.js';
import { AutoHealingAgent } from './auto-healing-agent/index.js';
import config from '../core/config.js';
import { createAgentLogger } from '../core/logger.js';

const log = createAgentLogger('Orchestrator');

export class Orchestrator {
  constructor() {
    this.jiraAgent = new JiraAgent();
    this.codingAgent = new CodingAgent();
    this.testCasesAgent = new TestCasesAgent();
    this.uiAgent = new UIAgent();
    this.dataAgent = new DataComparisonAgent();
    this.analysisAgent = new TestAnalysisAgent();
    this.healingAgent = new AutoHealingAgent();
    this.pipelineResults = {};
  }

  async runFullPipeline(options = {}) {
    const { healOnFailure = true, reportToJira = true, maxHealRetries = 1 } = options;
    log.info(`Starting full automation pipeline [env=${config.env}]`);

    try {
      // Step 1: Fetch stories from Jira
      log.info('=== Step 1: Fetching stories from Jira ===');
      const stories = await this.jiraAgent.fetchAutomatableStories();
      this.pipelineResults.stories = stories;
      log.info(`Fetched ${stories.length} automatable stories`);

      if (stories.length === 0) {
        log.info('No automatable stories found. Pipeline complete.');
        return this.pipelineResults;
      }

      // Step 2: Sync and register test cases
      log.info('=== Step 2: Syncing test cases ===');
      await this.testCasesAgent.loadRegistry();
      const syncResult = await this.testCasesAgent.syncWithJira();
      this.pipelineResults.sync = syncResult;

      // Step 3: Generate test code
      log.info('=== Step 3: Generating test code ===');
      const generated = [];
      for (const story of stories) {
        const files = await this.codingAgent.generateFromStory(story);
        generated.push(...files);
      }
      this.pipelineResults.generated = generated;
      log.info(`Generated ${generated.length} test files`);

      // Step 4: Execute tests
      log.info('=== Step 4: Executing tests ===');
      const testResult = this._runTests('tests/generated/');
      this.pipelineResults.execution = testResult;

      // Step 5: Analyze results
      log.info('=== Step 5: Analyzing results ===');
      await this.analysisAgent.loadHistory();
      const analysis = await this.analysisAgent.analyzeResults();
      this.pipelineResults.analysis = analysis;

      // Step 6: Auto-heal if needed
      if (healOnFailure && analysis.failures.some((f) => f.category === 'locator')) {
        log.info('=== Step 6: Auto-healing broken locators ===');
        const healResults = await this._healFailures(analysis.failures);
        this.pipelineResults.healing = healResults;

        if (healResults.healed > 0 && maxHealRetries > 0) {
          log.info('Re-running tests after healing');
          const rerunResult = this._runTests('tests/generated/');
          this.pipelineResults.rerunExecution = rerunResult;
          const rerunAnalysis = await this.analysisAgent.analyzeResults();
          this.pipelineResults.rerunAnalysis = rerunAnalysis;
        }
      }

      // Step 7: Report to Jira
      if (reportToJira) {
        log.info('=== Step 7: Reporting results to Jira ===');
        await this._reportResultsToJira(stories, analysis);
      }

      // Final summary
      const finalAnalysis = this.pipelineResults.rerunAnalysis || analysis;
      log.info('=== Pipeline Complete ===');
      log.info(`Results: ${finalAnalysis.summary.passed}/${finalAnalysis.summary.total} passed (${finalAnalysis.summary.passRate})`);

      return this.pipelineResults;
    } catch (err) {
      log.error('Pipeline failed', { error: err.message, stack: err.stack });
      this.pipelineResults.error = err.message;
      return this.pipelineResults;
    }
  }

  async runSingleStory(issueKey, options = {}) {
    log.info(`Running pipeline for story ${issueKey} [env=${config.env}]`);

    const story = await this.jiraAgent.fetchSingleStory(issueKey);
    const files = await this.codingAgent.generateFromStory(story);

    if (files.length === 0) {
      log.warn('No test files generated');
      return { story, files: [], result: null };
    }

    const testPaths = files.map((f) => f.file).join(' ');
    const result = this._runTests(testPaths);

    const analysis = await this.analysisAgent.analyzeResults();

    if (options.reportToJira !== false) {
      await this.jiraAgent.reportTestResult(issueKey, {
        testName: `Auto-generated tests for ${issueKey}`,
        passed: analysis.summary.failed === 0,
        duration: analysis.summary.totalDuration,
        error: analysis.failures.map((f) => f.error).join('; ') || null,
      });
    }

    return { story, files, result, analysis };
  }

  async runDataComparison(comparisonConfig) {
    log.info(`Running data comparison [env=${config.env}]`);
    await this.dataAgent.initConnections(comparisonConfig.connections);

    const results = [];

    for (const comparison of comparisonConfig.comparisons) {
      let result;
      switch (comparison.type) {
        case 'rowCount':
          result = await this.dataAgent.compareRowCounts(comparison.source, comparison.target, comparison.options);
          break;
        case 'data':
          result = await this.dataAgent.compareData(comparison.sourceQuery, comparison.targetQuery, comparison.options);
          break;
        case 'calculation':
          result = await this.dataAgent.validateCalculation(comparison.query, comparison.connector, comparison.expected);
          break;
        case 'aggregation':
          result = await this.dataAgent.validateAggregation(comparison.detailQuery, comparison.summaryQuery, comparison.connector, comparison.config);
          break;
      }
      results.push({ ...comparison, result });
    }

    const reportPath = await this.dataAgent.generateComparisonReport(results);
    await this.dataAgent.closeConnections();

    return { results, reportPath };
  }

  async healAndRerun(testPath) {
    log.info(`Healing and re-running [env=${config.env}]: ${testPath || 'all tests'}`);

    const firstRun = this._runTests(testPath);
    const analysis = await this.analysisAgent.analyzeResults();

    if (analysis.failures.length === 0) {
      log.info('All tests passed, no healing needed');
      return { analysis, healed: false };
    }

    const locatorFailures = analysis.failures.filter((f) => f.category === 'locator');
    if (locatorFailures.length === 0) {
      log.info('No locator failures to heal');
      return { analysis, healed: false, otherFailures: analysis.failures };
    }

    const healResults = await this._healFailures(locatorFailures);
    const rerunResult = this._runTests(testPath);
    const rerunAnalysis = await this.analysisAgent.analyzeResults();

    return { analysis, healResults, rerunAnalysis, healed: true };
  }

  _runTests(testPath) {
    const fullPath = testPath || '';
    const cmd = `npx playwright test ${fullPath} --reporter=json`;

    try {
      const output = execSync(cmd, {
        cwd: config.rootDir,
        encoding: 'utf-8',
        timeout: 300_000,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(config.paths.reports, 'results.json') },
      });
      return { success: true, output };
    } catch (err) {
      return { success: false, output: err.stdout || '', error: err.stderr || err.message };
    }
  }

  async _healFailures(failures) {
    const locatorFailures = failures.filter((f) => f.category === 'locator');
    let healed = 0;

    for (const failure of locatorFailures) {
      const selector = this.healingAgent._extractSelectorFromError(failure.error);
      if (selector) {
        log.info(`Attempting to heal: ${selector}`);
        healed++;
      }
    }

    return { total: locatorFailures.length, healed };
  }

  async _reportResultsToJira(stories, analysis) {
    for (const story of stories) {
      const storyFailures = analysis.failures.filter((f) => f.suite?.includes(story.key));
      const passed = storyFailures.length === 0;

      await this.jiraAgent.reportTestResult(story.key, {
        testName: `Automated tests for ${story.key}`,
        passed,
        duration: analysis.summary.totalDuration,
        error: storyFailures.map((f) => f.error).join('; ') || null,
      });
    }
  }
}

export default Orchestrator;

if (process.argv[1] && process.argv[1].includes('orchestrator')) {
  const mode = process.argv[2] || 'full';
  const orchestrator = new Orchestrator();

  const handlers = {
    full: () => orchestrator.runFullPipeline(),
    story: () => {
      const key = process.argv[3];
      if (!key) { console.error('Usage: node orchestrator.js story <JIRA-KEY>'); process.exit(1); }
      return orchestrator.runSingleStory(key);
    },
    heal: () => orchestrator.healAndRerun(process.argv[3]),
  };

  const handler = handlers[mode];
  if (!handler) {
    console.error(`Unknown mode: ${mode}. Use: full, story, heal`);
    process.exit(1);
  }

  handler()
    .then((result) => {
      log.info('Pipeline result:', JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      log.error('Orchestrator failed', { error: err.message });
      process.exit(1);
    });
}
