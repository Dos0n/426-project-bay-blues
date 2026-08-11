#!/usr/bin/env bash
# AI: This file was generated with AI assistance for Sprint 4 Task 3 (scripted failure
# scenario). See AI-DISCLOSURE.md and results/sprint-4-failure.md.
#
# Drives the responder-dispatch-service fault-injection scenario against a running
# stack (start it first with: docker compose up --build -d). It toggles the fault
# through the runtime POST /admin/fault endpoint, so no container rebuild is needed.
set -euo pipefail

readonly -a compose=(docker compose)
readonly dispatch_service="responder-dispatch-service"
readonly worker_service="emergency-notification-worker"
# A valid v4 UUID (matches the dispatch incidentId pattern) plus a real fixture team.
readonly demo_incident_id="f4957ac8-c9aa-47b0-b60d-e04ec9c25af2"
readonly demo_team_id="umpd-ems-north"

dispatch_base_url=""
restore_needed=0

fail() {
  printf 'FAIL %s\n' "$1" >&2
  exit 1
}

phase() {
  printf '\n==> %s\n' "$1"
}

restore_fault() {
  if [[ "$restore_needed" == "1" && -n "$dispatch_base_url" ]]; then
    printf '\nRestoring %s fault mode to off...\n' "$dispatch_service" >&2
    curl -fsS -X POST "$dispatch_base_url/admin/fault" \
      -H 'Content-Type: application/json' --data '{"mode":"off"}' \
      >/dev/null 2>&1 || true
  fi
}

trap restore_fault EXIT

published_port() {
  local service="$1"
  local container_port="$2"
  local mapping
  local port

  mapping="$("${compose[@]}" port "$service" "$container_port" | tail -n 1)"
  port="${mapping##*:}"

  [[ "$port" =~ ^[0-9]+$ ]] ||
    fail "could not resolve host port for $service (is the stack running?)"
  printf '%s\n' "$port"
}

set_fault() {
  curl -fsS -X POST "$dispatch_base_url/admin/fault" \
    -H 'Content-Type: application/json' --data "{\"mode\":\"$1\"}"
}

health_status() {
  curl -sS -o /dev/null -w '%{http_code}' "$dispatch_base_url/health"
}

dispatch_status() {
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$dispatch_base_url/dispatches" \
    -H 'Content-Type: application/json' \
    --data "{\"incidentId\":\"$demo_incident_id\",\"teamId\":\"$demo_team_id\"}"
}

dispatch_seconds() {
  curl -sS -o /dev/null -w '%{time_total}' -X POST "$dispatch_base_url/dispatches" \
    -H 'Content-Type: application/json' \
    --data "{\"incidentId\":\"$demo_incident_id\",\"teamId\":\"$demo_team_id\"}"
}

wait_for_log() {
  local service="$1"
  local pattern="$2"
  local logs

  for _attempt in {1..45}; do
    logs="$("${compose[@]}" logs --no-color --no-log-prefix "$service" 2>/dev/null || true)"

    if printf '%s\n' "$logs" | rg -q "$pattern"; then
      return
    fi

    sleep 1
  done

  fail "$service logs did not match: $pattern"
}

phase "Resolve host ports (stack must already be running: docker compose up --build -d)"
dispatch_base_url="http://127.0.0.1:$(published_port "$dispatch_service" 3000)"
incident_base_url="http://127.0.0.1:$(published_port incident-ambassador 3000)"
routing_base_url="http://127.0.0.1:$(published_port regional-routing-ambassador 3000)"

phase "Baseline: dispatch healthy and accepting work"
[[ "$(health_status)" == "200" ]] || fail "baseline /health was not 200"
[[ "$(dispatch_status)" == "201" ]] || fail "baseline POST /dispatches was not 201"
printf 'PASS baseline dispatch is healthy and returns 201\n'

phase 'Inject error fault: POST /admin/fault {"mode":"error"}'
restore_needed=1
set_fault error >/dev/null
error_dispatch="$(dispatch_status)"
error_health="$(health_status)"
[[ "$error_dispatch" == "503" ]] ||
  fail "faulted POST /dispatches returned $error_dispatch instead of 503"
[[ "$error_health" == "503" ]] ||
  fail "faulted /health returned $error_health instead of 503"
printf 'PASS dispatch returns 503 and /health reports 503 (Docker marks it unhealthy)\n'

phase "Confirm the rest of the system keeps working during the dispatch fault"
incident_response="$(curl -fsS -X POST "$incident_base_url/incidents" \
  -H 'Content-Type: application/json' \
  --data '{"emergencyType":"medical","severity":"critical","location":{"latitude":42.3868,"longitude":-72.5301,"venue":"Failure demo"}}')"
incident_id="$(jq -er '.incidentId' <<<"$incident_response")"
wait_for_log "$worker_service" \
  "\"event\":\"incident_notification_completed\".*\"incidentId\":\"$incident_id\""
routing_health="$(curl -sS -o /dev/null -w '%{http_code}' "$routing_base_url/health")"
[[ "$routing_health" == "200" ]] ||
  fail "routing ambassador /health was $routing_health during the dispatch fault"
printf 'PASS incident creation, async notification, and routing all still work\n'

phase "Switch to slow fault: latency spikes but /health stays a fast 200"
set_fault slow >/dev/null
slow_seconds="$(dispatch_seconds)"
[[ "$(health_status)" == "200" ]] || fail "slow-mode /health was not 200"
awk "BEGIN { exit !($slow_seconds > 3) }" ||
  fail "slow-mode POST /dispatches was only ${slow_seconds}s (expected > 3s)"
printf 'PASS slow mode: POST /dispatches took %ss behind a still-green health check\n' \
  "$slow_seconds"

phase "Restore: turn the fault off and confirm recovery"
set_fault off >/dev/null
restore_needed=0
[[ "$(health_status)" == "200" ]] || fail "post-restore /health was not 200"
[[ "$(dispatch_status)" == "201" ]] || fail "post-restore POST /dispatches was not 201"
printf 'PASS dispatch recovered: /health 200 and POST /dispatches 201\n'

phase "Sprint 4 scripted failure scenario complete"
printf 'PASS responder-dispatch-service fault injection verified end to end\n'
# AI: End AI-assisted file. See AI-DISCLOSURE.md and results/sprint-4-failure.md.
