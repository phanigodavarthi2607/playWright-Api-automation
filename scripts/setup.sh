#!/usr/bin/env bash
# Onboarding helper. Run from the repo root: `bash scripts/setup.sh`
# Idempotent — safe to re-run.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Checking prerequisites"
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is not installed."; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ERROR: npm is not installed."; exit 1; }

node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 18 ]; then
  echo "ERROR: Node.js >= 18 required, got $(node --version)."
  exit 1
fi

echo "    Node $(node --version), npm $(npm --version) OK"

echo "==> Installing npm dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Creating .env.<env> files from .env.example (if missing)"
for env in dev uat buat; do
  target=".env.$env"
  if [ -f "$target" ]; then
    echo "    $target already exists — leaving as-is."
  else
    cp .env.example "$target"
    echo "    Created $target — please edit with real values."
  fi
done

echo "==> Cucumber dry-run (validates step bindings)"
npx cucumber-js --dry-run

echo "==> Offline framework unit tests"
TEST_ENV=dev API_BASE_URL=http://example.invalid SM_SESSION=dummy \
  npx playwright test tests/unit

cat <<'EOF'

----------------------------------------------------------------------
Setup complete!

Next steps:
  1. Edit .env.dev / .env.uat / .env.buat with your real values.
  2. Run a single feature against DEV:
       npm run test:dev -- features/api/users-baseline.feature
  3. Open cucumber-report/cucumber-report.html in your browser.

See docs/SETUP_GUIDE.md for the full walkthrough.
----------------------------------------------------------------------
EOF
