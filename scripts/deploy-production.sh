#!/usr/bin/env bash
# Staged production rollout for bridgeway-api and bridgeway-web (Azure Container Apps).
#
# Order: stage API candidate -> stage web candidate (pointed at the candidate API) ->
# smoke the pair through labelled URLs -> promote both -> public smoke.
# Any failure after staging restores the previous traffic weights and deactivates the candidates.
#
# Required env: SHA, ACR_LOGIN_SERVER, ACR_NAME, RESOURCE_GROUP, API_APP, WEB_APP, PUBLIC_ORIGIN
# Prerequisite: both apps must run in "multiple" revision mode so candidates can be labelled.
set -Eeuo pipefail

: "${SHA:?}" "${ACR_LOGIN_SERVER:?}" "${ACR_NAME:?}" "${RESOURCE_GROUP:?}" "${API_APP:?}" "${WEB_APP:?}" "${PUBLIC_ORIGIN:?}"
SHORT="${SHA:0:8}"
REV_SUFFIX="s${SHORT}a${DEPLOYMENT_ID:-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}}"
CAND_LABEL="candidate"
# Azure Container Apps revision names separate the app name and suffix with "--".
API_CAND="${API_APP}--${REV_SUFFIX}"
WEB_CAND="${WEB_APP}--${REV_SUFFIX}"
WORK="$(mktemp -d)"
PREV_API="$WORK/prev-api.tsv"
PREV_WEB="$WORK/prev-web.tsv"
PROMOTED=0

log() { echo "[rollout] $*"; }

# Snapshot "<revision> <weight>" for every serving revision.
snapshot() {
  az containerapp revision list -n "$1" -g "$RESOURCE_GROUP" \
    --query "[?properties.trafficWeight>\`0\`].[name,properties.trafficWeight]" -o tsv > "$2"
  [ -s "$2" ] || { log "No serving revisions found for $1"; exit 1; }
}

restore_previous() {
  log "Restoring previous traffic weights"
  for pair in "$API_APP:$PREV_API" "$WEB_APP:$PREV_WEB"; do
    app="${pair%%:*}"; file="${pair#*:}"
    args=(); while read -r rev weight; do args+=(--revision-weight "$rev=$weight"); done < "$file"
    az containerapp ingress traffic set -n "$app" -g "$RESOURCE_GROUP" "${args[@]}" || log "Could not restore $app traffic; restore manually from $file"
  done
  for cand in "$API_CAND:$API_APP" "$WEB_CAND:$WEB_APP"; do
    rev="${cand%%:*}"; app="${cand#*:}"
    if ! grep -q "^$rev"$'\t' "$( [ "$app" = "$API_APP" ] && echo "$PREV_API" || echo "$PREV_WEB")" 2>/dev/null; then
      az containerapp revision deactivate -n "$app" -g "$RESOURCE_GROUP" --revision "$rev" || true
    fi
  done
}

on_exit() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$PROMOTED" -eq 1 ]; then restore_previous; fi
  if [ "$status" -ne 0 ] && [ "$PROMOTED" -eq 0 ]; then
    log "Failed before promotion; previous traffic was never changed. Deactivating candidates."
    az containerapp revision deactivate -n "$API_APP" -g "$RESOURCE_GROUP" --revision "$API_CAND" 2>/dev/null || true
    az containerapp revision deactivate -n "$WEB_APP" -g "$RESOURCE_GROUP" --revision "$WEB_CAND" 2>/dev/null || true
  fi
  rm -rf "$WORK"
  exit "$status"
}
trap on_exit EXIT
trap 'log "Deployment command failed at line ${LINENO} (exit $?)"' ERR

smoke_check() {
  local url="$1" expected="${2:-}"
  local response="$WORK/smoke-response"
  log "Checking $url"
  curl --fail --silent --show-error --max-time 30 --output "$response" "$url" || return 1
  if [[ -n "$expected" ]] && ! grep -Fq -- "$expected" "$response"; then
    log "Unexpected response from $url (missing $expected)"
    return 1
  fi
  log "Passed $url"
}

wait_healthy() {
  for _ in $(seq 1 60); do
    state=$(az containerapp revision show -n "$1" -g "$RESOURCE_GROUP" --revision "$2" --query properties.healthState -o tsv 2>/dev/null || echo "")
    [ "$state" = "Healthy" ] && return 0
    sleep 10
  done
  log "Revision $2 never became Healthy (last state: ${state:-unknown})"; return 1
}

# Precondition: multiple revision mode on both apps.
for app in "$API_APP" "$WEB_APP"; do
  mode=$(az containerapp show -n "$app" -g "$RESOURCE_GROUP" --query properties.configuration.activeRevisionsMode -o tsv)
  [ "$mode" = "Multiple" ] || { log "$app is in $mode mode; switch it to multiple before using this workflow."; exit 1; }
done

# Precondition: both images exist for this commit.
for repo in bridgeway-api bridgeway-web; do
  az acr repository show-tags -n "$ACR_NAME" --repository "$repo" -o tsv | grep -qx "$SHA" \
    || { log "Image $repo:$SHA is missing from ACR"; exit 1; }
done

snapshot "$API_APP" "$PREV_API"
snapshot "$WEB_APP" "$PREV_WEB"
log "Previous API traffic: $(tr '\n' ' ' < "$PREV_API")"
log "Previous web traffic: $(tr '\n' ' ' < "$PREV_WEB")"

# 1. Stage the API using the existing replica settings.
log "Staging API candidate $API_CAND"
az containerapp update -n "$API_APP" -g "$RESOURCE_GROUP" \
  --image "$ACR_LOGIN_SERVER/bridgeway-api:$SHA" --revision-suffix "$REV_SUFFIX" \
  -o none
wait_healthy "$API_APP" "$API_CAND"
az containerapp revision label add -n "$API_APP" -g "$RESOURCE_GROUP" --revision "$API_CAND" --label "$CAND_LABEL" -o none --yes
API_CAND_ORIGIN="$(az containerapp revision show -n "$API_APP" -g "$RESOURCE_GROUP" --revision "$API_CAND" --query properties.fqdn -o tsv)"
log "Candidate API origin: $API_CAND_ORIGIN"

# 2. Web candidate: points at the candidate API, so the pair is tested together.
log "Staging web candidate $WEB_CAND against the candidate API"
az containerapp update -n "$WEB_APP" -g "$RESOURCE_GROUP" \
  --image "$ACR_LOGIN_SERVER/bridgeway-web:$SHA" --revision-suffix "$REV_SUFFIX" \
  --set-env-vars "BRIDGEWAY_API_ORIGIN=https://$API_CAND_ORIGIN" -o none
wait_healthy "$WEB_APP" "$WEB_CAND"
az containerapp revision label add -n "$WEB_APP" -g "$RESOURCE_GROUP" --revision "$WEB_CAND" --label "$CAND_LABEL" -o none --yes
WEB_APP_FQDN="$(az containerapp show -n "$WEB_APP" -g "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
WEB_ENV_DOMAIN="${WEB_APP_FQDN#*.}"
WEB_CAND_HOST="${WEB_APP}---${CAND_LABEL}.${WEB_ENV_DOMAIN}"

# 3. Smoke the candidate pair through the labelled web URL, before any public traffic moves.
log "Smoke testing candidate pair at https://$WEB_CAND_HOST"
smoke_check "https://$WEB_CAND_HOST/"
smoke_check "https://$WEB_CAND_HOST/health/cosmos" '"connected"'
smoke_check "https://$WEB_CAND_HOST/robots.txt" "sitemap"

# 4. Promote both apps together.
log "Promoting $API_CAND and $WEB_CAND to 100%"
az containerapp ingress traffic set -n "$API_APP" -g "$RESOURCE_GROUP" --revision-weight "$API_CAND=100" -o none
PROMOTED=1
az containerapp ingress traffic set -n "$WEB_APP" -g "$RESOURCE_GROUP" --revision-weight "$WEB_CAND=100" -o none

# 5. Public smoke. Failure here triggers restore_previous through the EXIT trap.
log "Public smoke checks on $PUBLIC_ORIGIN"
sleep 20
smoke_check "$PUBLIC_ORIGIN/"
smoke_check "$PUBLIC_ORIGIN/health/cosmos" '"connected"'
smoke_check "$PUBLIC_ORIGIN/robots.txt" "sitemap"
smoke_check "$PUBLIC_ORIGIN/signup"
log "Rollout complete. Previous revisions kept inactive-but-present for rollback."
