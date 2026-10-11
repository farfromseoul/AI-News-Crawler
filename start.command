#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ -x ".tools/node-v22.23.3-darwin-arm64/bin/node" ]; then
  export PATH="$PWD/.tools/node-v22.23.3-darwin-arm64/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22.12 이상을 설치한 후 다시 실행해 주세요.'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci
fi
npm run db:migrate
exec npm run dev
