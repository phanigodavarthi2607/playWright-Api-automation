/**
 * Cucumber profiles.
 *
 * Pick one with: `cucumber-js --profile <name>`.
 * The TEST_ENV variable selects the .env.<env> file at runtime — it is
 * orthogonal to the profile, but the per-env profiles below set sensible
 * defaults.
 */

const common = {
  require: ['features/support/**/*.js', 'features/step_definitions/**/*.js'],
  paths: ['features/**/*.feature'],
  format: [
    'progress-bar',
    'summary',
    'html:cucumber-report/cucumber-report.html',
    'json:cucumber-report/cucumber-report.json',
  ],
  formatOptions: {
    snippetInterface: 'async-await',
  },
  parallel: 1,
};

module.exports = {
  default: { ...common },

  dev: { ...common },
  uat: { ...common },
  buat: { ...common },

  baseline: { ...common, tags: '@baseline' },
  db: { ...common, tags: '@db' },
  smoke: { ...common, tags: '@smoke' },

  ci: {
    ...common,
    parallel: 4,
    retry: 1,
    format: [
      'summary',
      'html:cucumber-report/cucumber-report.html',
      'json:cucumber-report/cucumber-report.json',
      'junit:cucumber-report/cucumber-report.xml',
    ],
  },
};
