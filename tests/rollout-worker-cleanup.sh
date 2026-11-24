#!/usr/bin/env bash
set -Eeuo pipefail
work=$(mktemp -d "${TMPDIR:-/tmp}/bridgeway-rollout.XXXXXX")
trap 'rm -f -- "$work/az" "$work/calls"; rmdir -- "$work"' EXIT
cat > "$work/az" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  *"revision show"*) printf '%s\n' "$TEST_KEEP_WEIGHT" ;;
  *"revision list"*) printf '%s\n' "$TEST_REVISIONS" ;;
  *"revision deactivate"*) printf '%s\n' "$*" >> "$TEST_AZ_CALLS" ;;
  *) echo "Unexpected command" >&2; exit 1 ;;
esac
MOCK
chmod +x "$work/az"
export PATH="$work:$PATH" TEST_AZ_CALLS="$work/calls" TEST_KEEP_WEIGHT=100
export TEST_REVISIONS=$'api--old-one\napi--old-two'
bash scripts/retire-nonserving-revisions.sh api group api--current
[[ $(wc -l < "$work/calls") -eq 2 ]]
! grep -q -- '--revision api--current' "$work/calls"
: > "$work/calls"
export TEST_KEEP_WEIGHT=50
if bash scripts/retire-nonserving-revisions.sh api group api--current; then echo "Cleanup accepted split traffic" >&2; exit 1; fi
[[ ! -s "$work/calls" ]]
export TEST_KEEP_WEIGHT=100 TEST_REVISIONS=api--current
if bash scripts/retire-nonserving-revisions.sh api group api--current; then echo "Cleanup accepted the serving revision" >&2; exit 1; fi
[[ ! -s "$work/calls" ]]
export TEST_REVISIONS=""
bash scripts/retire-nonserving-revisions.sh api group api--current
[[ ! -s "$work/calls" ]]
echo "Rollout worker cleanup checks passed"
