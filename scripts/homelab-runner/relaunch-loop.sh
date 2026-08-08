#!/usr/bin/env bash
set -euo pipefail

# Keeps a self-hosted GitHub Actions runner "warm" for the Supplier Onboarding
# Agent workflow (.github/workflows/supplier-onboarding-agent.yml) by
# continuously registering a fresh --ephemeral runner, letting it pick up at
# most one job, and re-registering right after that job (and the runner's own
# auto-deregistration) completes.
#
# Why this loop, instead of just running ./run.sh once?
# An --ephemeral runner deregisters itself after exactly one job. Without
# this loop, only the very first onboarding PR after a manual start would
# ever find a runner available.
#
# Usage (foreground, for the laptop-testing phase — see the plan's "VM
# migration" step for turning this into a systemd service later):
#   scripts/homelab-runner/relaunch-loop.sh
# Optionally wrap with `caffeinate -i` on macOS so the machine doesn't sleep:
#   caffeinate -i scripts/homelab-runner/relaunch-loop.sh
# Stop with Ctrl+C (this also deregisters the current runner registration).
#
# Requires: `gh` authenticated (`gh auth status`) against a GitHub account/PAT
# with admin rights on the repo (registration/remove tokens need repo-admin,
# not just Actions read/write).

REPO="${REPO:-BartJoris/live-babetteconcept}"
RUNNER_NAME="${RUNNER_NAME:-laptop-test}"
RUNNER_LABELS="${RUNNER_LABELS:-supplier-onboarding-homelab}"
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runners/live-babetteconcept}"

cd "$RUNNER_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

deregister_if_configured() {
  if [ -f .runner ]; then
    log "Found a leftover local runner registration — removing it first..."
    local remove_token
    remove_token="$(gh api -X POST "repos/$REPO/actions/runners/remove-token" --jq .token)"
    ./config.sh remove --token "$remove_token" || log "Warning: local removal failed (continuing anyway)."
  fi
}

cleanup() {
  echo
  log "Ctrl+C received — deregistering current runner before exiting..."
  deregister_if_configured
  exit 0
}
trap cleanup INT TERM

log "== Supplier onboarding runner relaunch-loop =="
log "Repo: $REPO | name: $RUNNER_NAME | labels: $RUNNER_LABELS | dir: $RUNNER_DIR"
log "Press Ctrl+C to stop."

while true; do
  deregister_if_configured

  log "Requesting a fresh registration token..."
  REG_TOKEN="$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)"

  log "Registering ephemeral runner (labels: self-hosted,$RUNNER_LABELS)..."
  ./config.sh --unattended \
    --url "https://github.com/$REPO" \
    --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --no-default-labels \
    --ephemeral \
    --replace

  log "Runner registered — waiting for a job (./run.sh)..."
  # An ephemeral runner's listener exits on its own (and unconfigures itself)
  # once it has run exactly one job, or if it times out waiting (GitHub's
  # default idle timeout is ~24h).
  ./run.sh || log "run.sh exited non-zero (continuing loop)."

  log "Job finished. Re-registering shortly..."
  sleep 2
done
