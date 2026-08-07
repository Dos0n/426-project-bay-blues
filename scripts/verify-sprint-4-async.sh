#!/usr/bin/env bash
# AI: This Sprint 4 async-path verification script was generated with AI assistance.
set -euo pipefail

readonly queue_name="${NOTIFICATION_QUEUE:-incident-notification-jobs}"
readonly normal_processing_ms="${NOTIFICATION_PROCESSING_MS:-500}"
readonly worker_service="emergency-notification-worker"
readonly -a compose=(docker compose)

restore_mode="none"

fail() {
  printf 'FAIL %s\n' "$1" >&2
  exit 1
}

phase() {
  printf '\n==> %s\n' "$1"
}

restore_normal_worker() {
  case "$restore_mode" in
    start)
      printf '\nRestarting previously running %s...\n' "$worker_service" >&2
      "${compose[@]}" start "$worker_service" >/dev/null 2>&1 || true
      ;;
    recreate)
      printf '\nRestoring %s with %s ms processing delay...\n' \
        "$worker_service" "$normal_processing_ms" >&2
      NOTIFICATION_PROCESSING_MS="$normal_processing_ms" \
        "${compose[@]}" up -d --force-recreate "$worker_service" \
        >/dev/null 2>&1 || true
      ;;
  esac
}

trap restore_normal_worker EXIT

wait_for_health() {
  local service="$1"
  local container_id
  local health_status

  for _attempt in {1..45}; do
    container_id="$("${compose[@]}" ps -q "$service")"

    if [[ -n "$container_id" ]]; then
      health_status="$(
        docker inspect \
          --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' \
          "$container_id" 2>/dev/null || true
      )"

      if [[ "$health_status" == "healthy" ]]; then
        return
      fi
    fi

    sleep 2
  done

  "${compose[@]}" ps "$service" >&2 || true
  "${compose[@]}" logs --no-color "$service" >&2 || true
  fail "$service did not become healthy"
}

queue_counts() {
  local counts

  counts="$(
    "${compose[@]}" exec -T rabbitmq \
      rabbitmqctl -q list_queues \
      name messages_ready messages_unacknowledged \
      | awk -v queue="$queue_name" '$1 == queue { print $2, $3 }'
  )"

  [[ -n "$counts" ]] || fail "queue $queue_name was not found"
  printf '%s\n' "$counts"
}

assert_queue_empty_or_missing() {
  local counts
  local ready
  local unacknowledged

  counts="$(
    "${compose[@]}" exec -T rabbitmq \
      rabbitmqctl -q list_queues \
      name messages_ready messages_unacknowledged \
      | awk -v queue="$queue_name" '$1 == queue { print $2, $3 }'
  )"

  if [[ -z "$counts" ]]; then
    return
  fi

  read -r ready unacknowledged <<<"$counts"

  if [[ "$ready" != "0" || "$unacknowledged" != "0" ]]; then
    fail "queue $queue_name already contains ready=$ready unacknowledged=$unacknowledged"
  fi
}

wait_for_queue_counts() {
  local expected_ready="$1"
  local expected_unacknowledged="$2"
  local counts
  local ready
  local unacknowledged

  for _attempt in {1..45}; do
    counts="$(queue_counts)"
    read -r ready unacknowledged <<<"$counts"

    if [[ "$ready" == "$expected_ready" && \
      "$unacknowledged" == "$expected_unacknowledged" ]]; then
      return
    fi

    sleep 1
  done

  fail "queue counts did not reach ready=$expected_ready unacknowledged=$expected_unacknowledged"
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

  "${compose[@]}" logs --no-color "$service" >&2 || true
  fail "$service logs did not match: $pattern"
}

enqueue_log_count() {
  local logs
  local count

  logs="$("${compose[@]}" logs --no-color --no-log-prefix incident-service 2>/dev/null || true)"
  count="$(printf '%s\n' "$logs" | rg -c '"event":"incident_notification_enqueued"' || true)"
  printf '%s\n' "${count:-0}"
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

create_incident() {
  local incident_base_url="$1"
  local venue="$2"

  curl -fsS -X POST "$incident_base_url/incidents" \
    -H 'Content-Type: application/json' \
    --data "{\"emergencyType\":\"medical\",\"severity\":\"critical\",\"location\":{\"latitude\":42.3868,\"longitude\":-72.5301,\"venue\":\"$venue\"}}"
}

phase "Start the Sprint 4 asynchronous subsystem"
existing_worker_id="$("${compose[@]}" ps -q "$worker_service")"

if [[ -n "$existing_worker_id" ]]; then
  restore_mode="start"
  "${compose[@]}" stop "$worker_service"
fi

"${compose[@]}" up -d rabbitmq
wait_for_health rabbitmq
assert_queue_empty_or_missing

"${compose[@]}" up --build -d \
  "$worker_service" \
  incident-service \
  incident-ambassador

wait_for_health "$worker_service"
restore_mode="none"
wait_for_health incident-service
wait_for_health incident-ambassador

readonly incident_port="$(published_port incident-ambassador 3000)"
readonly incident_base_url="http://127.0.0.1:$incident_port"

wait_for_queue_counts 0 0

phase "Verify normal enqueue, delivery, processing, and acknowledgment"
normal_response="$(create_incident "$incident_base_url" "Gate 4 normal flow")"
normal_incident_id="$(jq -er '.incidentId' <<<"$normal_response")"

wait_for_log incident-service \
  "\"event\":\"incident_notification_enqueued\".*\"incidentId\":\"$normal_incident_id\""
wait_for_log "$worker_service" \
  "\"event\":\"incident_notification_received\".*\"incidentId\":\"$normal_incident_id\""
wait_for_log "$worker_service" \
  "\"event\":\"incident_notification_completed\".*\"incidentId\":\"$normal_incident_id\""
wait_for_queue_counts 0 0
printf 'PASS normal enqueue and consume\n'

phase "Verify invalid and read-only requests do not enqueue"
enqueue_count_before="$(enqueue_log_count)"
invalid_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$incident_base_url/incidents" \
    -H 'Content-Type: application/json' \
    --data '{}'
)"

[[ "$invalid_status" == "400" ]] || fail "invalid incident returned HTTP $invalid_status instead of 400"
curl -fsS "$incident_base_url/health" >/dev/null
curl -fsS "$incident_base_url/incidents/$normal_incident_id" >/dev/null

enqueue_count_after="$(enqueue_log_count)"
[[ "$enqueue_count_after" == "$enqueue_count_before" ]] || \
  fail "invalid or read-only request unexpectedly enqueued work"
wait_for_queue_counts 0 0
printf 'PASS invalid and read-only requests do not enqueue\n'

phase "Verify RabbitMQ retains work while the worker is stopped"
restore_mode="start"
"${compose[@]}" stop "$worker_service"

queued_response="$(create_incident "$incident_base_url" "Gate 4 queued flow")"
queued_incident_id="$(jq -er '.incidentId' <<<"$queued_response")"
wait_for_log incident-service \
  "\"event\":\"incident_notification_enqueued\".*\"incidentId\":\"$queued_incident_id\""
wait_for_queue_counts 1 0

"${compose[@]}" start "$worker_service"
wait_for_health "$worker_service"
wait_for_log "$worker_service" \
  "\"event\":\"incident_notification_completed\".*\"incidentId\":\"$queued_incident_id\""
wait_for_queue_counts 0 0
restore_mode="none"
printf 'PASS work remains queued while worker is stopped\n'

phase "Verify unacknowledged work is redelivered after worker failure"
restore_mode="recreate"
NOTIFICATION_PROCESSING_MS=10000 \
  "${compose[@]}" up -d --force-recreate "$worker_service"
wait_for_health "$worker_service"

redelivery_response="$(create_incident "$incident_base_url" "Gate 4 redelivery flow")"
redelivery_incident_id="$(jq -er '.incidentId' <<<"$redelivery_response")"
wait_for_queue_counts 0 1

"${compose[@]}" kill -s SIGKILL "$worker_service"
wait_for_queue_counts 1 0

NOTIFICATION_PROCESSING_MS="$normal_processing_ms" \
  "${compose[@]}" up -d --force-recreate "$worker_service"
wait_for_health "$worker_service"
wait_for_log "$worker_service" \
  "\"event\":\"incident_notification_received\".*\"incidentId\":\"$redelivery_incident_id\".*\"redelivered\":true"
wait_for_log "$worker_service" \
  "\"event\":\"incident_notification_completed\".*\"incidentId\":\"$redelivery_incident_id\""
wait_for_queue_counts 0 0
restore_mode="none"
printf 'PASS unacknowledged work is redelivered after worker failure\n'

phase "Sprint 4 asynchronous path verification complete"
printf 'PASS notification queue drained successfully\n'

# AI: End AI-assisted Sprint 4 async-path verification script.
