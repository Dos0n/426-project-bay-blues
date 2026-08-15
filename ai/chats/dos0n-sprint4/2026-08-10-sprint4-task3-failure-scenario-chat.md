# AI Session: Sprint 4 Task 3 — dispatch fault-injection failure scenario

- Date: 2026-08-10
- Course: COMPSCI 426 Scalable Web Systems
- Student folder: `ai/chats/dos0n-sprint4/`
- Tool: Claude Code (Anthropic), model `claude-opus-4-8`
- Disclosure status: added after review flagged that the Sprint 4 Task 3 files
  referenced `AI-DISCLOSURE.md` without a matching transcript in the repo. The
  verbatim key prompts and responses are also recorded in the matching
  `AI-DISCLOSURE.md` section ("Sprint 4 Task 3: Bruce Dispatch Fault Injection").

Condensed session log. Tool calls (file reads, `node`/`npm`/`docker`/`git`
commands) are summarized in place of raw tool output; user and assistant prose
are otherwise kept in substance.

---

## Turn 1 — User

Pasted the full Sprint 4 assignment (async processing path, health checks,
scripted failure scenario, updated `docs/SERVICES.md` diagram) and said: "I only
need to do tasks 3 and 4 (scripted failure and system diagram)."

## Turn 1 — Assistant

Explored the repo. Confirmed Task 1 (a RabbitMQ work queue: `incident-service`
producer → `incident-notification-jobs` → `emergency-notification-worker`
consumer) and Task 2 (health checks) were already merged by teammates, and that
the `docs/SERVICES.md` Mermaid diagram already contained the full async path and
every service. Confirmed Bruce owns `incident-ambassador` and
`responder-dispatch-service`. Checked tooling: the Docker daemon was reachable
but only internal-registry images were cached (public Docker Hub pulls blocked
by the sandbox), `npm` worked with an isolated cache, and `docker compose
config` validated YAML without pulling.

## Turn 2 — Assistant (plan) and User (decisions)

Recommended building the failure scenario into Bruce's own
`responder-dispatch-service` (clean ownership) and leaving the already-complete
diagram untouched, since Task 3 adds no service or connection. Asked the user to
choose the scenario and how to treat Task 4. User chose **"Fault-inject dispatch
svc"** and **"Leave diagram as-is."**

## Turn 3 — Assistant (implementation)

- `responder-dispatch-service/src/index.js`: added `DISPATCH_FAULT_MODE`
  (`off`/`error`/`slow`) parsed by a new `readEnumValue` helper, plus
  `DISPATCH_FAULT_LATENCY_MS`; a mutable `faultMode`; a `logEvent` helper;
  fault-aware `GET /health` (503 in `error`, fast 200 in `slow`, unchanged in
  `off`); `GET`/`POST /admin/fault` runtime toggle registered above the fault
  middleware so it stays reachable; a fault middleware over the business
  endpoints only (`error` → 503, `slow` → `setTimeout(next, faultLatencyMs)`);
  and the boot-time `faultMode` added to the startup log.
- `docker-compose.yml` and `.env.example`: wired `DISPATCH_FAULT_MODE` and
  `DISPATCH_FAULT_LATENCY_MS` with defaults `off`/`6000` so a normal
  `docker compose up` stays all-healthy.
- `scripts/sprint-4-failure.sh`: modeled on `scripts/verify-sprint-4-async.sh`;
  drives baseline → `error` → (confirms incident/async-notification/routing
  still work) → `slow` → restore, via the `POST /admin/fault` endpoint.
- `results/sprint-4-failure.md`: the four required sections (what the scenario
  is, how to trigger it, how the system responds, what production would do
  differently) plus a recorded-validation section.

## Turn 3 — Assistant (verification)

`node --check`, `bash -n`, and `docker compose config` all passed. Because
public image pulls were blocked, ran `responder-dispatch-service` standalone
under Node (installing `express` with an isolated npm cache; the committed
`package-lock.json` was left unchanged) and exercised every mode with `curl`:

- `off` → `/health` 200, `POST /dispatches` 201 (~0.21s)
- `error` → `/health` 503, `POST /dispatches` and `GET /teams` 503 (fail fast)
- `slow` → `/health` fast 200, `POST /dispatches` ~6.2s (healthy but slow)
- `off` → recovered (200 / 201); invalid mode → 400 `VALIDATION_ERROR`

Captured the structured `dispatch_fault_mode_changed` and
`dispatch_fault_injected` log events. The full-Compose fault-isolation checks
(Docker marking the container unhealthy; a real `/route` request succeeding
during the fault) were left as the runnable steps in `scripts/sprint-4-failure.sh`
and were exercised separately in the team's Compose environment.

## Turn 4 — User and Assistant (git)

User asked to open the PR, then to split the work into three Task-3 commits and
add `bdo-png` to the README roster. Split into: (1) the service fault-injection
code, (2) the Compose + `.env.example` wiring, (3) the failure script and
report, plus a fourth commit adding `bdo-png` to the roster. The sandbox blocked
git upload to GitHub (HTTP 403 on `git-receive-pack`), so the branch was
prepared locally and the push/PR had to be completed from outside the sandbox.

## Turn 5 — Assistant (this disclosure)

Review noted that the Sprint 4 Task 3 files referenced `AI-DISCLOSURE.md` but no
matching transcript existed in the repo. Added this condensed session log and
the corresponding `AI-DISCLOSURE.md` section, and updated the artifact `AI:`
comments to cite this transcript. The dispatch fault-event logging was later
refactored under Sprint 5 (structured JSON logging and Prometheus); those
changes are disclosed in the Sprint 5 sections and their own transcripts.
