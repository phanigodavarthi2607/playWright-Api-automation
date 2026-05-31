# CI Integration

Three ready-to-adapt pipelines: **Jenkins**, **GitLab CI**, and **GitHub
Actions**. They all do the same five things — install, lint, dry-run,
execute against a target env, archive reports.

> **Secrets:** never store `AUTH_USERNAME`, `AUTH_PASSWORD`,
> `DATABRICKS_TOKEN`, `SNOWFLAKE_PASSWORD`, or a pre-issued `SM_SESSION`
> in the repo. Inject them at job runtime from the platform's secret store.

---

## 1. Jenkins (declarative pipeline)

`Jenkinsfile`:

```groovy
pipeline {
  agent { label 'linux && nodejs20' }

  parameters {
    choice(name: 'TARGET_ENV', choices: ['uat', 'buat', 'dev'], description: 'Which environment to test')
    string(name: 'TAGS', defaultValue: '', description: 'Cucumber tag expression (optional)')
  }

  environment {
    TEST_ENV       = "${params.TARGET_ENV}"
    API_BASE_URL   = credentials("api-base-url-${params.TARGET_ENV}")
    AUTH_BASE_URL  = credentials("auth-base-url-${params.TARGET_ENV}")
    AUTH_USERNAME  = credentials("svc-qa-username")
    AUTH_PASSWORD  = credentials("svc-qa-password-${params.TARGET_ENV}")
    DATABRICKS_HOST       = credentials("databricks-host-${params.TARGET_ENV}")
    DATABRICKS_HTTP_PATH  = credentials("databricks-http-path-${params.TARGET_ENV}")
    DATABRICKS_TOKEN      = credentials("databricks-token-${params.TARGET_ENV}")
  }

  options {
    timeout(time: 30, unit: 'MINUTES')
    ansiColor('xterm')
  }

  stages {
    stage('Install') {
      steps { sh 'npm ci' }
    }
    stage('Lint') {
      steps { sh 'npm run lint' }
    }
    stage('Dry-run') {
      steps { sh 'npx cucumber-js --dry-run' }
    }
    stage('Test') {
      steps {
        script {
          def tagArgs = params.TAGS?.trim() ? "--tags '${params.TAGS}'" : ''
          sh "npm run test:ci -- ${tagArgs}"
        }
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'cucumber-report/cucumber-report.xml'
      publishHTML target: [
        reportDir: 'cucumber-report',
        reportFiles: 'cucumber-report.html',
        reportName: "Cucumber Report (${params.TARGET_ENV})",
        keepAll: true
      ]
      archiveArtifacts artifacts: 'cucumber-report/**', allowEmptyArchive: true
    }
  }
}
```

Notes:

- `credentials(...)` pulls from Jenkins **Credentials → Global → Secret text**.
- Naming convention `api-base-url-uat` lets you add new envs without
  changing the pipeline.
- `npm ci` (not `npm install`) — deterministic install from `package-lock.json`.

---

## 2. GitLab CI

`.gitlab-ci.yml`:

```yaml
image: node:20

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .npm/
    - node_modules/

stages: [install, verify, test]

install:
  stage: install
  script:
    - npm ci

lint:
  stage: verify
  script:
    - npm run lint

dry-run:
  stage: verify
  script:
    - npx cucumber-js --dry-run

.test_template: &test_template
  stage: test
  artifacts:
    when: always
    paths:
      - cucumber-report/
    reports:
      junit: cucumber-report/cucumber-report.xml
    expire_in: 1 week

test:dev:
  <<: *test_template
  variables:
    TEST_ENV: dev
    # AUTH_USERNAME/PASSWORD/DATABRICKS_TOKEN come from CI/CD Variables (masked, protected)
  script:
    - npm run test:ci
  rules:
    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'

test:uat:
  <<: *test_template
  variables:
    TEST_ENV: uat
  script:
    - npm run test:ci
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

test:buat:
  <<: *test_template
  variables:
    TEST_ENV: buat
  script:
    - npm run test:ci
  when: manual
```

How to inject secrets:

1. Project → Settings → CI/CD → Variables.
2. Add `AUTH_USERNAME`, `AUTH_PASSWORD_UAT`, etc. as **Masked** and
   **Protected**.
3. In the per-env job, map them: e.g. add `AUTH_PASSWORD: $AUTH_PASSWORD_UAT`
   under `test:uat.variables`.

---

## 3. GitHub Actions

`.github/workflows/api-tests.yml`:

```yaml
name: API Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      env:
        description: "Environment to test"
        type: choice
        options: [dev, uat, buat]
        default: dev
      tags:
        description: "Cucumber tag expression"
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      TEST_ENV: ${{ github.event.inputs.env || (github.ref == 'refs/heads/main' && 'uat') || 'dev' }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run lint
      - run: npx cucumber-js --dry-run

      - name: Run Cucumber
        env:
          API_BASE_URL:   ${{ secrets[format('API_BASE_URL_{0}', env.TEST_ENV)] }}
          AUTH_BASE_URL:  ${{ secrets[format('AUTH_BASE_URL_{0}', env.TEST_ENV)] }}
          AUTH_USERNAME:  ${{ secrets.AUTH_USERNAME }}
          AUTH_PASSWORD:  ${{ secrets[format('AUTH_PASSWORD_{0}', env.TEST_ENV)] }}
          DATABRICKS_HOST:      ${{ secrets[format('DATABRICKS_HOST_{0}', env.TEST_ENV)] }}
          DATABRICKS_HTTP_PATH: ${{ secrets[format('DATABRICKS_HTTP_PATH_{0}', env.TEST_ENV)] }}
          DATABRICKS_TOKEN:     ${{ secrets[format('DATABRICKS_TOKEN_{0}', env.TEST_ENV)] }}
        run: |
          if [ -n "${{ github.event.inputs.tags }}" ]; then
            npm run test:ci -- --tags "${{ github.event.inputs.tags }}"
          else
            npm run test:ci
          fi

      - name: Upload Cucumber report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: cucumber-report-${{ env.TEST_ENV }}
          path: cucumber-report/
          retention-days: 14

      - name: Publish test summary
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: Cucumber (${{ env.TEST_ENV }})
          path: cucumber-report/cucumber-report.xml
          reporter: java-junit
```

How to inject secrets:

1. Repo → Settings → Secrets and variables → Actions → New repository secret.
2. Add `AUTH_USERNAME`, `AUTH_PASSWORD_DEV`, `AUTH_PASSWORD_UAT`,
   `API_BASE_URL_DEV`, etc.
3. The pipeline picks the right one based on `TEST_ENV` via `format(...)`.

---

## 4. Recommended pipeline policies

| Policy | Why |
| --- | --- |
| PR pipelines run **DEV only** with all tags except `@db` | Keeps PRs fast, avoids warehouse cost. |
| Main-branch pipelines run **UAT** with full suite (`@baseline @db`) | The merged-code source-of-truth check. |
| BUAT runs **on demand** (manual trigger) | Pre-release sign-off. |
| Baseline-update PRs require a second reviewer | The whole point of baselines is human review of diffs. |
| Use `--retry 1` (already in `ci` profile) | Smooths over rare network blips, not over real bugs. |
| Archive `cucumber-report/` for at least 14 days | History for post-mortems. |

---

## 5. Reading reports

- `cucumber-report/cucumber-report.html` — interactive; collapse/expand each
  scenario; failed steps show the response body attachment.
- `cucumber-report/cucumber-report.json` — feed it into custom dashboards
  (e.g. Allure via `cucumber-html-reporter`, or a Grafana flow).
- `cucumber-report/cucumber-report.xml` — JUnit XML; native support in
  Jenkins, GitLab, GitHub.
