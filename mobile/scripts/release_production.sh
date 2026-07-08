#!/usr/bin/env bash
#
# Manual production release: build Android + iOS via EAS Build, then submit
# the latest finished build of each platform via EAS Submit.
#
# Usage:
#   npm run release:production            # interactive confirmation before each stage
#   npm run release:production -- --yes   # skip confirmation, fully non-interactive
#   DRY_RUN=1 npm run release:production   # print the eas commands instead of running them
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$MOBILE_DIR"

PROFILE="production"
SKIP_CONFIRM=false
DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      SKIP_CONFIRM=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

log() {
  local stage="$1"
  shift
  echo "[$stage] $*"
}

run() {
  local stage="$1"
  shift
  if [ "$DRY_RUN" = "1" ]; then
    log "$stage" "DRY RUN: $*"
  else
    log "$stage" "running: $*"
    "$@"
  fi
}

confirm() {
  local prompt="$1"
  if [ "$SKIP_CONFIRM" = true ] || [ "$DRY_RUN" = "1" ]; then
    return 0
  fi
  read -r -p "$prompt [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) echo "Aborted." && exit 1 ;;
  esac
}

log PREFLIGHT "checking EAS authentication"
run PREFLIGHT eas whoami

confirm "Build Android + iOS for profile '$PROFILE' and submit the latest builds?"

log BUILD "starting EAS Build for both platforms (profile: $PROFILE)"
run BUILD eas build --platform all --profile "$PROFILE" --non-interactive --wait

log SUBMIT:android "submitting latest Android build to Google Play"
run SUBMIT:android eas submit --platform android --latest --profile "$PROFILE" --non-interactive

log SUBMIT:ios "submitting latest iOS build to TestFlight"
run SUBMIT:ios eas submit --platform ios --latest --profile "$PROFILE" --non-interactive

log DONE "build + submit complete for profile '$PROFILE'"
