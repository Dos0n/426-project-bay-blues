#!/usr/bin/env bash
# AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-11-203027-video-demo-runbook.jsonl.
set -euo pipefail

readonly -a compose=(docker compose)
readonly demo_latitude="42.3912"
readonly demo_longitude="-72.5267"
readonly demo_emergency_type="medical"
readonly temporary_directory="$(mktemp -d)"

trap 'rm -r -- "$temporary_directory"' EXIT

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  exit 1
}

published_port() {
  local service="$1"
  local container_port="$2"
  local mapping
  local port

  mapping="$("${compose[@]}" port "$service" "$container_port" | tail -n 1)"
  port="${mapping##*:}"
  [[ "$port" =~ ^[0-9]+$ ]] || fail "could not resolve host port for $service"
  printf '%s\n' "$port"
}

# AI: Capture and validate each HTTP response before passing its fields to the next service.
request_json() {
  local label="$1"
  local method="$2"
  local url="$3"
  local expected_status="$4"
  local output_file="$5"
  local request_body="${6:-}"
  local actual_status

  if [[ -n "$request_body" ]]; then
    actual_status="$(
      curl -sS -o "$output_file" -w '%{http_code}' \
        -X "$method" \
        -H 'Content-Type: application/json' \
        --data "$request_body" \
        "$url"
    )"
  else
    actual_status="$(
      curl -sS -o "$output_file" -w '%{http_code}' \
        -X "$method" \
        "$url"
    )"
  fi

  if [[ "$actual_status" != "$expected_status" ]]; then
    printf '%s returned HTTP %s instead of %s:\n' \
      "$label" "$actual_status" "$expected_status" >&2
    jq . "$output_file" >&2 2>/dev/null || sed -n '1,80p' "$output_file" >&2
    exit 1
  fi

  jq -e . "$output_file" >/dev/null || fail "$label did not return valid JSON"
}

readonly incident_port="$(published_port incident-ambassador 3000)"
readonly routing_port="$(published_port regional-routing-ambassador 3000)"
readonly dispatch_port="$(published_port responder-dispatch-service 3000)"
readonly incident_base_url="http://127.0.0.1:${incident_port}"
readonly routing_base_url="http://127.0.0.1:${routing_port}"
readonly dispatch_base_url="http://127.0.0.1:${dispatch_port}"

readonly incident_file="${temporary_directory}/incident.json"
readonly route_file="${temporary_directory}/route.json"
readonly dispatch_file="${temporary_directory}/dispatch.json"
readonly verified_dispatch_file="${temporary_directory}/verified-dispatch.json"

printf '1/4  Reporting a medical incident through the incident ambassador...\n'
incident_payload="$(
  jq -cn \
    --arg emergency_type "$demo_emergency_type" \
    --argjson latitude "$demo_latitude" \
    --argjson longitude "$demo_longitude" \
    '{
      emergencyType: $emergency_type,
      severity: "high",
      location: {
        latitude: $latitude,
        longitude: $longitude,
        venue: "UMass North Campus"
      },
      description: "Synthetic Blue Light video demonstration"
    }'
)"
request_json \
  "incident creation" \
  POST \
  "${incident_base_url}/incidents" \
  201 \
  "$incident_file" \
  "$incident_payload"

incident_id="$(jq -er '.incidentId | select(type == "string" and length > 0)' "$incident_file")"
emergency_type="$(jq -er '.emergencyType' "$incident_file")"
latitude="$(jq -er '.location.latitude' "$incident_file")"
longitude="$(jq -er '.location.longitude' "$incident_file")"

printf '2/4  Routing the incident location through the routing ambassador...\n'
route_url="${routing_base_url}/route?latitude=${latitude}&longitude=${longitude}&emergencyType=${emergency_type}"
request_json "regional routing" GET "$route_url" 200 "$route_file"

team_id="$(jq -er '.responseGroup.id | select(type == "string" and length > 0)' "$route_file")"

printf '3/4  Dispatching the response group selected by the routing service...\n'
dispatch_payload="$(
  jq -cn \
    --arg incident_id "$incident_id" \
    --arg team_id "$team_id" \
    '{incidentId: $incident_id, teamId: $team_id}'
)"
request_json \
  "responder dispatch" \
  POST \
  "${dispatch_base_url}/dispatches" \
  201 \
  "$dispatch_file" \
  "$dispatch_payload"

dispatch_id="$(jq -er '.dispatchId | select(type == "string" and length > 0)' "$dispatch_file")"

printf '4/4  Reading the saved dispatch back from the dispatch service...\n'
request_json \
  "dispatch verification" \
  GET \
  "${dispatch_base_url}/dispatches/${dispatch_id}" \
  200 \
  "$verified_dispatch_file"

# AI: The final assertion proves that the retrieved dispatch connects the real incident and routed team.
jq -e \
  --arg incident_id "$incident_id" \
  --arg dispatch_id "$dispatch_id" \
  --arg team_id "$team_id" \
  '.incidentId == $incident_id and
   .dispatchId == $dispatch_id and
   .team.teamId == $team_id and
   .status == "assigned"' \
  "$verified_dispatch_file" >/dev/null || fail "saved dispatch did not match the routed incident"

printf '\nBLUE LIGHT REQUEST COMPLETED\n\n'
printf 'Incident:  %s — %s emergency\n' "$incident_id" "$emergency_type"
printf 'Region:    %s\n' "$(jq -r '.regionName' "$route_file")"
printf 'Routed by: %s (%s)\n' \
  "$(jq -r '.servedBy' "$route_file")" \
  "$(jq -r '.cache' "$route_file")"
printf 'Team:      %s\n' "$(jq -r '.team.name' "$verified_dispatch_file")"
printf 'Dispatch:  %s — ETA %s minutes\n' \
  "$(jq -r '.status' "$verified_dispatch_file")" \
  "$(jq -r '.etaMinutes' "$verified_dispatch_file")"
printf '\nPASS  incident -> routing -> dispatch\n'
# AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-11-203027-video-demo-runbook.jsonl.
