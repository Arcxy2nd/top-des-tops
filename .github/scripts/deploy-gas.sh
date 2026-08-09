#!/usr/bin/env bash
set -uo pipefail

TARGETS_FILE="deploy-targets.json"
TARGET_COUNT=$(jq 'length' "$TARGETS_FILE")
FAILED_TARGETS=()

# COMMIT_MESSAGE comes from the workflow (github.event.head_commit.message),
# which is empty on a manual workflow_dispatch run. Fall back to git log.
SHORT_SHA="${GITHUB_SHA:0:7}"
COMMIT_SUBJECT=$(echo "${COMMIT_MESSAGE:-}" | head -n1)
if [ -z "$COMMIT_SUBJECT" ]; then
  COMMIT_SUBJECT=$(git log -1 --format=%s 2>/dev/null || echo "manual deploy")
fi
# Apps Script deployment descriptions are short-lived UI labels; keep it tight.
DEPLOY_DESCRIPTION=$(echo "${COMMIT_SUBJECT:0:60} ($SHORT_SHA)")

# Strip JS comments from the .gs/.html files in this CI checkout before pushing:
# Google's own comment-stripping, applied server-side on push, corrupted a working
# file's syntax in production (see CHANGELOG v3.5.5). Stripping them ourselves
# first makes that pass a no-op. The script re-parses every file it rewrites and
# exits non-zero if the result no longer parses, so a scanner bug fails the build
# instead of blanking the site.
echo "== 0/4: Stripping JS comments before push (see strip-comments.js) =="
node .github/scripts/strip-comments.js || exit 1

deploy_one_target() {
  local name="$1"
  local script_id="$2"
  local shortio_link_id="$3"

  echo "---- Target: $name ----"

  cat > .clasp.json <<EOF
{
  "scriptId": "$script_id",
  "rootDir": "."
}
EOF

  echo "== 1/4: Pushing source to Apps Script =="
  if ! clasp push --force; then
    echo "ERROR: clasp push failed for target '$name'." >&2
    return 1
  fi

  echo "== 2/4: Locating previous web app deployment =="
  local deployments_output
  deployments_output=$(clasp deployments)
  echo "$deployments_output"

  # Extract ALL old non-HEAD deployment IDs
  local old_deployment_ids
  old_deployment_ids=$(echo "$deployments_output" | grep '^- ' | grep -v '@HEAD' | awk '{print $2}')
  local last_deployment_id
  last_deployment_id=$(echo "$old_deployment_ids" | tail -n1)

  echo "== 3/4: Creating new deployment and archiving previous deployments =="
  local deploy_output=""
  local new_deployment_id=""

  # ALWAYS create a brand new deployment
  echo "Creating new deployment..."
  deploy_output=$(clasp deploy --description "$DEPLOY_DESCRIPTION" 2>&1) || true
  echo "$deploy_output"
  new_deployment_id=$(echo "$deploy_output" | grep -oE 'Deployed [A-Za-z0-9_-]+' | awk '{print $2}' | tail -n1)

  if [ -z "${new_deployment_id:-}" ]; then
    echo "ERROR: could not parse the deployment ID from clasp deploy output for '$name'." >&2
    echo "NOTE: Si le projet Google Apps Script a atteint la limite de 200 versions, supprimez les anciennes versions historiques dans script.google.com (Paramètres du projet → Historique)." >&2
    return 1
  fi

  # Archive/Undeploy ALL previous non-HEAD deployments
  if [ -n "${old_deployment_ids:-}" ]; then
    for old_id in $old_deployment_ids; do
      if [ "$old_id" != "$new_deployment_id" ]; then
        echo "Archiving/Undeploying previous deployment: $old_id"
        clasp undeploy "$old_id" || echo "WARNING: undeploy failed for '$old_id', continuing anyway."
      fi
    done
  fi

  local new_url="https://script.google.com/macros/s/${new_deployment_id}/exec"
  echo "New deployment URL for '$name': $new_url"

  echo "== 4/4: Updating short.io link =="
  local http_status
  http_status=$(curl -s -o /tmp/shortio_response.json -w "%{http_code}" -X POST \
    "https://api.short.io/links/${shortio_link_id}" \
    -H "Authorization: ${SHORTIO_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"originalURL\": \"${new_url}\"}")

  cat /tmp/shortio_response.json

  if [ "$http_status" -ge 400 ]; then
    echo "ERROR: short.io update failed for '$name' with HTTP $http_status." >&2
    echo "The new code IS live at $new_url but the short.io link was NOT updated. Fix it manually." >&2
    return 1
  fi

  echo "Done with '$name'. Short.io link now points to $new_url"
  return 0
}

for i in $(seq 0 $((TARGET_COUNT - 1))); do
  NAME=$(jq -r ".[$i].name" "$TARGETS_FILE")
  SCRIPT_ID=$(jq -r ".[$i].scriptId" "$TARGETS_FILE")
  SHORTIO_LINK_ID=$(jq -r ".[$i].shortioLinkId" "$TARGETS_FILE")

  if ! deploy_one_target "$NAME" "$SCRIPT_ID" "$SHORTIO_LINK_ID"; then
    FAILED_TARGETS+=("$NAME")
  fi
done

echo ""
echo "==== Summary ===="
echo "Targets processed: $TARGET_COUNT"
if [ ${#FAILED_TARGETS[@]} -eq 0 ]; then
  echo "All targets deployed successfully."
  exit 0
else
  echo "FAILED targets: ${FAILED_TARGETS[*]}" >&2
  exit 1
fi
