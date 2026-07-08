#!/usr/bin/env bash
set -euo pipefail

echo "== 1/4: Pushing source to Apps Script =="
clasp push --force

echo "== 2/4: Locating previous web app deployment =="
DEPLOYMENTS_OUTPUT=$(clasp deployments)
echo "$DEPLOYMENTS_OUTPUT"

# clasp deployments prints lines like:
#   - AKfycbyyyy @HEAD (Development)
#   - AKfycbzzzz @3 - auto: <sha>
# We want the deployment ID that is NOT the @HEAD dev deployment.
OLD_DEPLOYMENT_ID=$(echo "$DEPLOYMENTS_OUTPUT" | grep '^- ' | grep -v '@HEAD' | awk '{print $2}' | tail -n1)

if [ -z "${OLD_DEPLOYMENT_ID:-}" ]; then
  echo "No previous non-HEAD deployment found. Skipping undeploy."
else
  echo "Undeploying previous deployment: $OLD_DEPLOYMENT_ID"
  clasp undeploy "$OLD_DEPLOYMENT_ID"
fi

echo "== 3/4: Creating new deployment =="
DEPLOY_OUTPUT=$(clasp deploy --description "auto: ${GITHUB_SHA}")
echo "$DEPLOY_OUTPUT"

# clasp deploy prints a line like: "- AKfycbwwww @4."
NEW_DEPLOYMENT_ID=$(echo "$DEPLOY_OUTPUT" | grep '^- ' | awk '{print $2}' | tail -n1 | sed 's/\.$//')

if [ -z "${NEW_DEPLOYMENT_ID:-}" ]; then
  echo "ERROR: could not parse the new deployment ID from clasp deploy output." >&2
  exit 1
fi

NEW_URL="https://script.google.com/macros/s/${NEW_DEPLOYMENT_ID}/exec"
echo "New deployment URL: $NEW_URL"

echo "== 4/4: Updating short.io link =="
HTTP_STATUS=$(curl -s -o /tmp/shortio_response.json -w "%{http_code}" -X POST \
  "https://api.short.io/links/${SHORTIO_LINK_ID}" \
  -H "Authorization: ${SHORTIO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"originalURL\": \"${NEW_URL}\"}")

cat /tmp/shortio_response.json

if [ "$HTTP_STATUS" -ge 400 ]; then
  echo "ERROR: short.io update failed with HTTP $HTTP_STATUS." >&2
  echo "The new code IS live at $NEW_URL but the short.io link was NOT updated. Fix it manually in the short.io dashboard." >&2
  exit 1
fi

echo "Done. Short.io link now points to $NEW_URL"
