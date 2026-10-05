#!/usr/bin/env node

/**
 * Interactive CLI wizard for onboarding a new project.
 *
 * Usage:
 *   node src/agents/onboarding-agent/cli.js [output-dir]
 *
 * Walks the user through every applicable question, generates the project
 * config, and scaffolds the full test project.
 */

import readline from 'readline';
import path from 'path';
import { OnboardingAgent, ONBOARDING_QUESTIONS } from './index.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

async function main() {
  console.log(`
${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗
║         Agent Playwright Framework - Project Setup       ║
╚══════════════════════════════════════════════════════════╝${RESET}

This wizard will ask questions about your project and generate
a complete test automation setup with all agents configured.
`);

  const agent = new OnboardingAgent();
  const answers = {};
  let currentSection = '';

  const applicable = agent.getApplicableQuestions(answers);

  for (const question of ONBOARDING_QUESTIONS) {
    if (question.condition && !question.condition(answers)) continue;

    if (question.section !== currentSection) {
      currentSection = question.section;
      console.log(`\n${BOLD}${CYAN}── ${currentSection} ─────────────────────────${RESET}\n`);
    }

    let value;

    if (question.type === 'select') {
      value = await askSelect(question);
    } else if (question.type === 'multi-select') {
      value = await askMultiSelect(question);
    } else if (question.type === 'env-url-map') {
      value = await askEnvUrlMap(question, answers);
      for (const [envName, url] of Object.entries(value)) {
        answers[`${envName}AppUrl`] = url;
        if (question.id === 'envApiUrls') answers[`${envName}ApiUrl`] = url;
      }
    } else if (question.type === 'page-list') {
      value = await askPageList(question);
    } else if (question.type === 'endpoint-list') {
      value = await askEndpointList(question);
    } else if (question.type === 'datasource-list') {
      value = await askDataSourceList(question);
    } else if (question.type === 'comparison-list') {
      value = await askComparisonList(question);
    } else if (question.type === 'calculation-list') {
      value = await askCalculationList(question);
    } else if (question.type === 'object') {
      value = await askObjectFields(question);
    } else {
      value = await askText(question);
    }

    answers[question.id] = value;
    agent.setAnswers({ [question.id]: value });
  }

  console.log(`\n${BOLD}${GREEN}── Generating Project ────────────────────────${RESET}\n`);

  agent.setAnswers(answers);
  const { config: projectConfig, validation } = agent.generateProjectConfig();

  if (!validation.valid) {
    console.log(`${YELLOW}Warnings:${RESET}`);
    validation.errors.forEach((e) => console.log(`  ${YELLOW}! ${e}${RESET}`));
  }

  const outputDir = process.argv[2] || path.join(process.cwd(), 'projects', projectConfig.project.key);
  console.log(`Scaffolding into: ${BOLD}${outputDir}${RESET}\n`);

  await agent.scaffoldProject(outputDir, projectConfig);

  console.log(`
${BOLD}${GREEN}✔ Project "${projectConfig.project.name}" is ready!${RESET}

${BOLD}Next steps:${RESET}
  1. cd ${outputDir}
  2. npm install
  3. Copy .env.*.example files to .env.* and fill in credentials
  4. npx playwright install
  5. npm run test:${Object.keys(projectConfig.environments)[0]}
`);

  rl.close();
}

async function askText(q) {
  const defaultStr = q.default ? ` ${DIM}(default: ${q.default})${RESET}` : '';
  const exampleStr = q.example ? ` ${DIM}e.g. ${q.example}${RESET}` : '';
  const requiredStr = q.required ? ` ${RED}*${RESET}` : '';

  while (true) {
    const raw = await ask(`${q.question}${requiredStr}${defaultStr}${exampleStr}\n  > `);
    const value = raw.trim() || q.default || '';

    if (q.required && !value) {
      console.log(`  ${RED}This field is required${RESET}`);
      continue;
    }

    if (q.validate && value) {
      const result = q.validate(value);
      if (result !== true) {
        console.log(`  ${RED}${result}${RESET}`);
        continue;
      }
    }

    return value;
  }
}

async function askSelect(q) {
  console.log(`${q.question}`);
  q.choices.forEach((c, i) => {
    const desc = q.descriptions?.[c] ? ` - ${q.descriptions[c]}` : '';
    console.log(`  ${CYAN}${i + 1}${RESET}) ${c}${DIM}${desc}${RESET}`);
  });

  while (true) {
    const raw = await ask(`  > `);
    const idx = parseInt(raw) - 1;
    if (idx >= 0 && idx < q.choices.length) return q.choices[idx];
    if (q.choices.includes(raw.trim())) return raw.trim();
    console.log(`  ${RED}Pick a number 1-${q.choices.length} or type the value${RESET}`);
  }
}

async function askMultiSelect(q) {
  const defaultStr = q.default ? ` ${DIM}(default: ${q.default.join(', ')})${RESET}` : '';
  console.log(`${q.question}${defaultStr}`);
  q.choices.forEach((c, i) => console.log(`  ${CYAN}${i + 1}${RESET}) ${c}`));

  const raw = await ask(`  Enter numbers or names, comma-separated:\n  > `);
  if (!raw.trim()) return q.default || [];

  return raw.split(',').map((s) => {
    const trimmed = s.trim();
    const idx = parseInt(trimmed) - 1;
    return (idx >= 0 && idx < q.choices.length) ? q.choices[idx] : trimmed;
  }).filter((v) => q.choices.includes(v));
}

async function askEnvUrlMap(q, answers) {
  const envs = answers.environments || ['dev', 'uat', 'prod'];
  const urls = {};
  for (const envName of envs) {
    const url = await ask(`  ${envName} URL: `);
    if (url.trim()) urls[envName] = url.trim();
  }
  return urls;
}

async function askPageList(q) {
  console.log(`${q.question} ${DIM}(enter blank name to finish)${RESET}`);
  if (q.example) console.log(`  ${DIM}Example: ${JSON.stringify(q.example[0])}${RESET}`);
  const pages = [];

  while (true) {
    const name = await ask(`  Page name: `);
    if (!name.trim()) break;
    const pagePath = await ask(`  Page path: `);
    pages.push({ name: name.trim(), path: pagePath.trim() || '/' });
  }

  return pages;
}

async function askEndpointList(q) {
  console.log(`${q.question} ${DIM}(enter blank name to finish)${RESET}`);
  const endpoints = [];

  while (true) {
    const name = await ask(`  Endpoint name: `);
    if (!name.trim()) break;
    const method = await ask(`  HTTP method (GET/POST/PUT/DELETE): `);
    const epPath = await ask(`  Path: `);
    endpoints.push({ name: name.trim(), method: (method.trim() || 'GET').toUpperCase(), path: epPath.trim() });
  }

  return endpoints;
}

async function askDataSourceList(q) {
  console.log(`${q.question}`);
  q.choices.forEach((c, i) => console.log(`  ${CYAN}${i + 1}${RESET}) ${c}`));

  const raw = await ask(`  Enter numbers, comma-separated:\n  > `);
  if (!raw.trim()) return [];

  const selected = raw.split(',').map((s) => {
    const idx = parseInt(s.trim()) - 1;
    return (idx >= 0 && idx < q.choices.length) ? q.choices[idx] : s.trim();
  }).filter((v) => q.choices.includes(v));

  const sources = [];
  for (const type of selected) {
    const name = await ask(`  Display name for ${type} source: `);
    sources.push({ name: name.trim() || type, type });
  }
  return sources;
}

async function askComparisonList(q) {
  console.log(`${q.question} ${DIM}(enter blank name to finish)${RESET}`);
  const comparisons = [];

  while (true) {
    const name = await ask(`  Comparison name: `);
    if (!name.trim()) break;
    const sourceTable = await ask(`  Source table: `);
    const targetTable = await ask(`  Target table: `);
    const keyColumns = await ask(`  Key columns (comma-separated): `);
    comparisons.push({
      name: name.trim(),
      sourceType: 'snowflake',
      sourceTable: sourceTable.trim(),
      targetType: 'snowflake',
      targetTable: targetTable.trim(),
      keyColumns: keyColumns.split(',').map((s) => s.trim()).filter(Boolean),
    });
  }

  return comparisons;
}

async function askCalculationList(q) {
  console.log(`${q.question} ${DIM}(enter blank name to finish)${RESET}`);
  const calculations = [];

  while (true) {
    const name = await ask(`  Calculation name: `);
    if (!name.trim()) break;
    const table = await ask(`  Table: `);
    const resultColumn = await ask(`  Result column: `);
    const inputColumns = await ask(`  Input columns (comma-separated): `);
    const formula = await ask(`  Formula (JS arrow fn, e.g. "(a,b) => a * b"): `);
    calculations.push({
      name: name.trim(),
      table: table.trim(),
      resultColumn: resultColumn.trim(),
      inputColumns: inputColumns.split(',').map((s) => s.trim()).filter(Boolean),
      formula: formula.trim() || '(a) => a',
    });
  }

  return calculations;
}

async function askObjectFields(q) {
  console.log(`${q.question}`);
  const obj = {};
  for (const field of q.fields) {
    const val = await ask(`  ${field}: `);
    if (val.trim()) obj[field] = val.trim();
  }
  return Object.keys(obj).length > 0 ? obj : null;
}

main().catch((err) => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
