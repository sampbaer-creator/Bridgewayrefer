#!/usr/bin/env bash
# Keep rollback images/revisions, but stop workers in revisions receiving no public traffic.
set -Eeuo pipefail
app="${1:?app name required}"
group="${2:?resource group required}"
keep="${3:?serving revision required}"
[[ "$keep" == "$app"--* ]] || { echo "Revision does not belong to $app" >&2; exit 1; }
weight=$(az containerapp revision show -n "$app" -g "$group" --revision "$keep" --query properties.trafficWeight -o tsv)
[[ "$weight" == "100" ]] || { echo "Refusing cleanup: $keep does not serve 100% of traffic" >&2; exit 1; }
retired=$(az containerapp revision list -n "$app" -g "$group" --query "[?properties.active && properties.trafficWeight==\`0\` && name!='$keep'].name" -o tsv)
while IFS= read -r revision; do
  [[ -z "$revision" ]] && continue
  [[ "$revision" == "$app"--* && "$revision" != "$keep" ]] || { echo "Unexpected revision: $revision" >&2; exit 1; }
  az containerapp revision deactivate -n "$app" -g "$group" --revision "$revision" -o none
  echo "Stopped non-serving revision $revision"
done <<< "$retired"
