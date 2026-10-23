#!/usr/bin/env bash
# Loads deploy/api-production.env into the merlink-api Vercel project (production)
# and redeploys the API. Run from the repo root:  bash deploy/set-vercel-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="deploy/api-production.env"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }

echo "→ linking repo root to project merlink-api"
mkdir -p .vercel
printf '{"projectId":"prj_kA2PY68aMkVe0q3PrEuYuDDCTrHo","orgId":"team_DZFxBztLmOomeORlePPnotLM","projectName":"merlink-api"}\n' > .vercel/project.json

echo "→ setting production environment variables"
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  key="${line%%=*}"; value="${line#*=}"
  printf '%s' "$value" | vercel env add "$key" production --force >/dev/null 2>&1 \
    && echo "   set $key" || echo "   FAILED $key"
done < "$ENV_FILE"

echo "→ deploying API to production"
vercel --prod --yes
echo "done. API health: https://merlink-api.vercel.app/health"
