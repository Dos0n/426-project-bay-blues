#!/usr/bin/env bash
# AI: This file was generated with AI assistance for Sprint 5 structured logging verification. See AI-DISCLOSURE.md.
set -euo pipefail

readonly health_wait_attempts="${HEALTH_WAIT_ATTEMPTS:-90}"
readonly -a compose=(docker compose)
readonly -a custom_services=(
  incident-service
  incident-ambassador
  regional-routing-service-a
  regional-routing-service-b
  regional-routing-service-c
  regional-routing-ambassador
  responder-dispatch-service
  emergency-notification-worker
)

fail() {
  printf 'FAIL %s\n' "$1" >&2
  exit 1
}

phase() {
  printf '\n==> %s\n' "$1"
}

logical_service_name() {
  case "$1" in
    regional-routing-service-a|regional-routing-service-b|regional-routing-service-c)
      printf 'regional-routing-service\n'
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

wait_for_health() {
  local service="$1"
  local container_id
  local health_status

  for ((_attempt = 1; _attempt <= health_wait_attempts; _attempt += 1)); do
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

request_from_service() {
  local service="$1"
  local request_path="$2"
  local expected_status="$3"

  "${compose[@]}" exec -T \
    -e VERIFY_REQUEST_PATH="$request_path" \
    -e VERIFY_EXPECTED_STATUS="$expected_status" \
    "$service" \
    node --input-type=module -e '
      const response = await fetch(
        `http://127.0.0.1:3000${process.env.VERIFY_REQUEST_PATH}`,
      );
      const expectedStatus = Number(process.env.VERIFY_EXPECTED_STATUS);

      if (response.status !== expectedStatus) {
        console.error(
          `Expected HTTP ${expectedStatus}, received ${response.status}`,
        );
        process.exit(1);
      }
    '
}

create_incident() {
  "${compose[@]}" exec -T incident-ambassador \
    node --input-type=module -e '
      const response = await fetch("http://127.0.0.1:3000/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emergencyType: "medical",
          severity: "critical",
          location: {
            latitude: 42.3868,
            longitude: -72.5301,
            venue: "Sprint 5 structured logging verification",
          },
        }),
      });

      if (response.status !== 201) {
        console.error(`Expected HTTP 201, received ${response.status}`);
        process.exit(1);
      }

      process.stdout.write(await response.text());
    '
}

wait_for_incident_event() {
  local service="$1"
  local event="$2"
  local incident_id="$3"
  local logs

  for _attempt in {1..45}; do
    logs="$(
      "${compose[@]}" logs --no-color --no-log-prefix "$service" \
        2>/dev/null || true
    )"

    if printf '%s\n' "$logs" | jq -e -s \
      --arg event "$event" \
      --arg incident_id "$incident_id" \
      'any(.[]; .event == $event and .incidentId == $incident_id)' \
      >/dev/null 2>&1; then
      return
    fi

    sleep 1
  done

  "${compose[@]}" logs --no-color "$service" >&2 || true
  fail "$service did not emit $event for incident $incident_id"
}

validate_service_logs() {
  local service="$1"
  local logical_service
  local logs

  logical_service="$(logical_service_name "$service")"
  logs="$("${compose[@]}" logs --no-color --no-log-prefix "$service")"

  [[ -n "$logs" ]] || fail "$service emitted no logs"

  if ! printf '%s\n' "$logs" | jq -e -s \
    --arg service "$logical_service" '
      length > 0 and
      all(.[];
        type == "object" and
        (.timestamp | type == "string" and test(
          "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"
        )) and
        (.level == "info" or .level == "warn" or .level == "error") and
        (.message | type == "string" and length > 0) and
        .service == $service
      ) and
      all(.[] | select(.message == "HTTP request completed");
        (.method | type == "string" and length > 0) and
        (.path | type == "string" and startswith("/")) and
        (.statusCode | type == "number") and
        (.statusCode % 1 == 0) and
        .statusCode >= 100 and
        .statusCode <= 599 and
        (.responseTimeMs | type == "number") and
        .responseTimeMs >= 0 and
        (if .statusCode >= 500 then
          .level == "error"
        elif .statusCode >= 400 then
          .level == "warn"
        else
          .level == "info"
        end)
      ) and
      any(.[];
        .message == "HTTP request completed" and
        .method == "GET" and
        .path == "/health" and
        .statusCode == 200 and
        .level == "info"
      ) and
      any(.[];
        .message == "HTTP request completed" and
        .method == "GET" and
        .path == "/gate-3-not-found" and
        .statusCode == 404 and
        .level == "warn"
      )
    ' >/dev/null; then
    "${compose[@]}" logs --no-color "$service" >&2 || true
    fail "$service logs did not satisfy the structured logging contract"
  fi

  printf 'PASS %s structured event and request logs\n' "$service"
}

wait_for_prometheus() {
  local targets
  local query_result
  local up_count

  for _attempt in {1..45}; do
    targets="$(
      "${compose[@]}" exec -T prometheus \
        wget -qO- http://127.0.0.1:9090/api/v1/targets \
        2>/dev/null || true
    )"
    query_result="$(
      "${compose[@]}" exec -T prometheus \
        wget -qO- \
        'http://127.0.0.1:9090/api/v1/query?query=count(http_requests_total)' \
        2>/dev/null || true
    )"

    up_count="$(
      printf '%s\n' "$targets" | \
        jq -r '[.data.activeTargets[] | select(.health == "up")] | length' \
        2>/dev/null || true
    )"

    if [[ "$up_count" == "8" ]] && \
      printf '%s\n' "$query_result" | \
        jq -e '.data.result[0].value[1] | tonumber > 0' \
        >/dev/null 2>&1; then
      printf 'PASS Prometheus targets 8/8 UP with request-counter data\n'
      return
    fi

    sleep 2
  done

  fail "Prometheus did not report eight healthy targets with request-counter data"
}

phase "Build and recreate the complete instrumented system"
"${compose[@]}" up -d --build --force-recreate

phase "Wait for every custom-service container"
for service in "${custom_services[@]}"; do
  wait_for_health "$service"
done

phase "Exercise successful and unmatched requests on every custom container"
for service in "${custom_services[@]}"; do
  request_from_service "$service" "/health" 200
  request_from_service "$service" "/gate-3-not-found" 404
done

phase "Exercise asynchronous incident logging"
incident_response="$(create_incident)"
incident_id="$(printf '%s\n' "$incident_response" | jq -er '.incidentId')"
wait_for_incident_event \
  incident-service \
  incident_notification_enqueued \
  "$incident_id"
wait_for_incident_event \
  emergency-notification-worker \
  incident_notification_completed \
  "$incident_id"
printf 'PASS asynchronous incident events for %s\n' "$incident_id"

phase "Validate every custom-service log line"
for service in "${custom_services[@]}"; do
  validate_service_logs "$service"
done

phase "Verify Prometheus regression"
wait_for_prometheus

printf '\nPASS Sprint 5 structured logging verification complete\n'
# AI: End AI-assisted file. See AI-DISCLOSURE.md.
