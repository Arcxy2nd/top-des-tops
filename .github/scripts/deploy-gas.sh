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

  # clasp deployments prints lines like:
  #   - AKfycbyyyy @HEAD (Development)
  #   - AKfycbzzzz @3 - auto: <sha>
  local target_deployment_id
  target_deployment_id=$(echo "$deployments_output" | grep '^- ' | grep -v '@HEAD' | awk '{print $2}' | tail -n1)

  echo "== 3/4: Updating deployment =="
  local deploy_output
  if [ -n "${target_deployment_id:-}" ]; then
    echo "Updating existing deployment: $target_deployment_id"
    deploy_output=$(clasp deploy -i "$target_deployment_id" -d "$DEPLOY_DESCRIPTION")
  else
    echo "Creating new deployment..."
    deploy_output=$(clasp deploy -d "$DEPLOY_DESCRIPTION")
    target_deployment_id=$(echo "$deploy_output" | grep -oE 'Deployed [A-Za-z0-9_-]+' | awk '{print $2}' | tail -n1)
  fi
  echo "$deploy_output"

  if [ -z "${target_deployment_id:-}" ]; then
    echo "ERROR: could not determine deployment ID for '$name'." >&2
    return 1
  fi

  local new_url="https://script.google.com/macros/s/${target_deployment_id}/exec"
  echo "Deployment URL for '$name': $new_url"

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
