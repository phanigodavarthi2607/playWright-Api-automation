import fs from 'fs/promises';
import path from 'path';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';

const log = createAgentLogger('TestAnalysisAgent');

export class TestAnalysisAgent {
  constructor() {
    this.historyPath = path.join(config.paths.reports, 'test-history.json');
    this.history = [];
  }

  async loadHistory() {
    try {
      const data = await fs.readFile(this.historyPath, 'utf-8');
      this.history = JSON.parse(data);
      log.info(`Loaded ${this.history.length} historical runs`);
    } catch {
      this.history = [];
    }
  }

  async saveHistory() {
    await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
    await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2));
  }

  async analyzeResults(resultsPath) {
    const resultsFile = resultsPath || path.join(config.paths.reports, 'results.json');
    const raw = await fs.readFile(resultsFile, 'utf-8');
    const results = JSON.parse(raw);

    const analysis = {
      timestamp: new Date().toISOString(),
      summary: this._buildSummary(results),
      failures: this._analyzeFailures(results),
      slowTests: this._findSlowTests(results),
      flakyTests: this._detectFlakyTests(results),
      trends: this._computeTrends(),
      recommendations: [],
    };

    analysis.recommendations = this._generateRecommendations(analysis);
    this.history.push({ timestamp: analysis.timestamp, summary: analysis.summary });
    await this.saveHistory();

    const reportPath = path.join(config.paths.reports, `analysis-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(analysis, null, 2));
    log.info('Analysis complete', { report: reportPath });

    return analysis;
  }

  _buildSummary(results) {
    const suites = results.suites || [];
    let total = 0, passed = 0, failed = 0, skipped = 0, totalDuration = 0;

    const walk = (suite) => {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          total++;
          totalDuration += test.results?.[0]?.duration || 0;
          const status = test.results?.[0]?.status || test.status;
          if (status === 'passed' || status === 'expected') passed++;
          else if (status === 'failed' || status === 'unexpected') failed++;
          else if (status === 'skipped') skipped++;
        }
      }
      for (const child of suite.suites || []) walk(child);
    };

    suites.forEach(walk);

    return {
      total,
      passed,
      failed,
      skipped,
      passRate: total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : 'N/A',
      totalDuration,
      avgDuration: total > 0 ? Math.round(totalDuration / total) : 0,
    };
  }

  _analyzeFailures(results) {
    const failures = [];

    const walk = (suite, suitePath = '') => {
      const currentPath = suitePath ? `${suitePath} > ${suite.title}` : suite.title;
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const result = test.results?.[0];
          const status = result?.status || test.status;
          if (status === 'failed' || status === 'unexpected') {
            failures.push({
              test: spec.title,
              suite: currentPath,
              error: result?.error?.message || 'Unknown error',
              errorSnippet: result?.error?.snippet || null,
              category: this._categorizeError(result?.error?.message || ''),
              duration: result?.duration || 0,
              retries: (test.results?.length || 1) - 1,
            });
          }
        }
      }
      for (const child of suite.suites || []) walk(child, currentPath);
    };

    (results.suites || []).forEach((s) => walk(s));
    return failures;
  }

  _categorizeError(errorMsg) {
    const lower = errorMsg.toLowerCase();
    if (lower.includes('timeout')) return 'timeout';
    if (lower.includes('locator') || lower.includes('selector') || lower.includes('not found')) return 'locator';
    if (lower.includes('expect') || lower.includes('assertion')) return 'assertion';
    if (lower.includes('network') || lower.includes('net::err')) return 'network';
    if (lower.includes('navigation')) return 'navigation';
    if (lower.includes('permission') || lower.includes('auth')) return 'authentication';
    if (lower.includes('data') || lower.includes('undefined') || lower.includes('null')) return 'data';
    return 'unknown';
  }

  _findSlowTests(results, thresholdMs = 30_000) {
    const slow = [];

    const walk = (suite) => {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const duration = test.results?.[0]?.duration || 0;
          if (duration > thresholdMs) {
            slow.push({ test: spec.title, duration, threshold: thresholdMs });
          }
        }
      }
      for (const child of suite.suites || []) walk(child);
    };

    (results.suites || []).forEach(walk);
    return slow.sort((a, b) => b.duration - a.duration);
  }

  _detectFlakyTests(results) {
    const flaky = [];

    const walk = (suite) => {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          if (test.results && test.results.length > 1) {
            const statuses = test.results.map((r) => r.status);
            const hasPass = statuses.includes('passed') || statuses.includes('expected');
            const hasFail = statuses.includes('failed') || statuses.includes('unexpected');
            if (hasPass && hasFail) {
              flaky.push({
                test: spec.title,
                attempts: test.results.length,
                statuses,
              });
            }
          }
        }
      }
      for (const child of suite.suites || []) walk(child);
    };

    (results.suites || []).forEach(walk);
    return flaky;
  }

  _computeTrends() {
    if (this.history.length < 2) return { message: 'Insufficient history for trend analysis' };

    const recent = this.history.slice(-10);
    const passRates = recent.map((r) => parseFloat(r.summary.passRate) || 0);
    const avgPassRate = passRates.reduce((a, b) => a + b, 0) / passRates.length;

    const trend = passRates.length >= 3
      ? passRates[passRates.length - 1] > passRates[passRates.length - 3]
        ? 'improving'
        : passRates[passRates.length - 1] < passRates[passRates.length - 3]
        ? 'declining'
        : 'stable'
      : 'insufficient_data';

    return { runs: recent.length, avgPassRate: avgPassRate.toFixed(1) + '%', trend };
  }

  _generateRecommendations(analysis) {
    const recs = [];

    if (analysis.failures.length > 0) {
      const categoryCounts = {};
      for (const f of analysis.failures) {
        categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
      }

      const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
      if (topCategory) {
        const [cat, count] = topCategory;
        if (cat === 'locator') recs.push({ priority: 'high', message: `${count} locator failures detected. Run the Auto Healing Agent to fix broken selectors.` });
        if (cat === 'timeout') recs.push({ priority: 'high', message: `${count} timeout failures. Consider increasing timeouts or optimizing page load.` });
        if (cat === 'network') recs.push({ priority: 'medium', message: `${count} network failures. Check API availability and add retry logic.` });
        if (cat === 'data') recs.push({ priority: 'medium', message: `${count} data-related failures. Validate test data setup.` });
      }
    }

    if (analysis.slowTests.length > 0) {
      recs.push({ priority: 'low', message: `${analysis.slowTests.length} slow tests detected. Consider optimizing or parallelizing.` });
    }

    if (analysis.flakyTests.length > 0) {
      recs.push({ priority: 'high', message: `${analysis.flakyTests.length} flaky tests detected. Stabilize before adding new tests.` });
    }

    return recs;
  }
}

export default TestAnalysisAgent;

if (process.argv[1] && process.argv[1].includes('test-analysis-agent')) {
  const agent = new TestAnalysisAgent();
  agent
    .loadHistory()
    .then(() => agent.analyzeResults())
    .then((analysis) => {
      console.log('\n=== Test Analysis Summary ===');
      console.log(JSON.stringify(analysis.summary, null, 2));
      console.log('\nRecommendations:');
      analysis.recommendations.forEach((r) => console.log(`  [${r.priority}] ${r.message}`));
    })
    .catch((err) => {
      log.error('Test Analysis Agent failed', { error: err.message });
      process.exit(1);
    });
}
