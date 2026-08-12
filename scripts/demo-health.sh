#!/usr/bin/env bash
# AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-11-203027-video-demo-runbook.jsonl.
set -euo pipefail

readonly health_wait_attempts="${HEALTH_WAIT_ATTEMPTS:-120}"
readonly -a compose=(docker compose)
readonly -a services=(
  incident-service
  rabbitmq
  emergency-notification-worker
  redis
  regional-routing-service-a
  regional-routing-service-b
  regional-routing-service-c
  regional-routing-load-balancer
  regional-routing-ambassador
  incident-ambassador
  responder-dispatch-service
  prometheus
  grafana
)

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'PASS  %s\n' "$1"
}

# AI: Wait for the clean Compose start without filling the recording with polling output.
wait_for_healthy_container() {
  local service="$1"
  local container_id
  local health_status

  for ((_attempt = 1; _attempt <= health_wait_attempts; _attempt += 1)); do
    container_id="$("${compose[@]}" ps -q "$service")"

    if [[ -n "$container_id" ]]; then
      health_status="$(
        docker inspect \
          --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
          "$container_id" 2>/dev/null || true
      )"

      if [[ "$health_status" == "healthy" ]]; then
        return
      fi
    fi

    sleep 2
  done

  "${compose[@]}" ps "$service" >&2 || true
  "${compose[@]}" logs --no-color --tail 40 "$service" >&2 || true
  fail "$service did not become healthy"
}

run_check() {
  local label="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    pass "$label"
    return
  fi

  fail "$label"
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

check_public_http() {
  local label="$1"
  local service="$2"
  local container_port="$3"
  local path="$4"
  local port

  port="$(published_port "$service" "$container_port")"
  run_check "$label" curl -fsS "http://127.0.0.1:${port}${path}"
}

check_node_health() {
  local label="$1"
  local service="$2"

  run_check "$label" "${compose[@]}" exec -T "$service" node -e \
    "fetch('http://127.0.0.1:3000/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"
}

printf 'Waiting for the clean Compose stack to become healthy...\n'
for service in "${services[@]}"; do
  wait_for_healthy_container "$service"
done

printf '\nBlue Light service checks\n'

# AI: Each Compose service receives an explicit protocol-level check rather than relying only on container state.
check_node_health "incident service" incident-service
run_check "RabbitMQ broker" "${compose[@]}" exec -T rabbitmq \
  rabbitmq-diagnostics -q check_running
check_public_http "notification worker" emergency-notification-worker 3000 /health
run_check "Redis cache" "${compose[@]}" exec -T redis redis-cli ping
check_node_health "routing replica A" regional-routing-service-a
check_node_health "routing replica B" regional-routing-service-b
check_node_health "routing replica C" regional-routing-service-c
run_check "Caddy load balancer" "${compose[@]}" exec -T \
  regional-routing-load-balancer curl -fsS http://127.0.0.1:3000/health
check_public_http "routing ambassador" regional-routing-ambassador 3000 /health
check_public_http "incident ambassador" incident-ambassador 3000 /health
check_public_http "responder dispatch" responder-dispatch-service 3000 /health
check_public_http "Prometheus" prometheus 9090 /-/healthy
check_public_http "Grafana" grafana 3000 /api/health

printf '\nPASS  all %d Compose services are healthy and reachable\n' "${#services[@]}"
# AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-11-203027-video-demo-runbook.jsonl.
