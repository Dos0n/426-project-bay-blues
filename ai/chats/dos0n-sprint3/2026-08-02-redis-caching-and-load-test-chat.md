# AI Session: Sprint 3 Redis caching + k6 load test

- Date: 2026-08-02
- Course: COMPSCI 426 Scalable Web Systems
- Student folder: `ai/chats/dos0n-sprint3/`
- Tool: Claude Code (Anthropic), model `claude-sonnet-5`
- Disclosure status: review before submission

Condensed session log. Tool calls (file reads, `docker compose`/`docker run`
commands, `git`/`npm` commands) are summarized in place of raw tool output;
user and assistant prose are otherwise kept in substance.

---

## Turn 1 — User

Pasted the full Sprint 3 assignment text, including the two remaining
deliverables not yet covered by the existing `sprint-3-task-1-routing-replication`
work already on `main` (Caddy + replicas): Redis caching on a service path,
and a k6 load test with a written summary and updated `docs/SERVICES.md`
diagram. Also referenced PR #10's k6 scaffolding branch.

## Turn 1 — Assistant

Inspected the current repo state: confirmed the routing-replica + Caddy work
was already merged to `main`, found an unmerged scaffolding branch
(`sradhakrishnan/sprint-3-load-test-scaffolding`) with a minimal
`load-tests/sprint-3-load.js` and `results/README.md`, and read
`regional-routing-service/src/index.js`, `docs/SLO.md`, and `docs/SERVICES.md`
to plan the remaining work. Created a new branch
`sprint-3-task-2-redis-caching-and-load-test` and a task list covering: Redis
caching, the k6 script, running the load test, the results write-up, and the
`docs/SERVICES.md` diagram update.

## Turns 2–3 — Assistant (implementation, no intervening user prompt)

Added a `redis` npm dependency to `regional-routing-service`, then modified
`GET /route` in `regional-routing-service/src/index.js` to:

- Build a cache key from `latitude`/`longitude` rounded to two decimal places
  plus `emergencyType`.
- On a cache hit, return the cached body immediately (skipping the simulated
  `ROUTING_LATENCY_MS` delay) with a `cache: "HIT"` field.
- On a cache miss, run the existing lookup after the simulated latency, store
  the result in Redis with a TTL (`ROUTE_CACHE_TTL_SECONDS`, default 30s), and
  respond with `cache: "MISS"`.
- Log the cache key and hit/miss outcome for every request.

Updated `docker-compose.yml` to add a `redis:7-alpine` service with a health
check, and wired `REDIS_URL` / `ROUTE_CACHE_TTL_SECONDS` plus a
`depends_on: redis (healthy)` into all three `regional-routing-service-*`
replicas.

Brought the stack up with `docker compose up --build -d`, verified all
services reported healthy, and manually confirmed caching behavior with
`curl`: a first request to a new coordinate pair returned `cache: "MISS"` in
~297ms, a second request to the same coordinates returned `cache: "HIT"` in
~63ms and was served by a different replica than the miss (confirming the
cache is shared through Redis, not per-replica), and replica logs recorded
matching `cacheStatus` values.

## Turn 4 — Assistant (k6 script + load test)

Rewrote `load-tests/sprint-3-load.js` (building on the scaffold's `BASE_URL`
pattern) to run 15 VUs for 30 seconds against `regional-routing-ambassador`,
with request coordinates drawn 80% of the time from a small pool of "hot
spot" locations (modeling a Mullins Center-style event, to produce cache
hits) and 20% of the time from dispersed, jittered coordinates (to produce
cache misses), avoiding both a 0% and 100% cache hit rate. Added
`summaryTrendStats` so k6's summary reports p50/p95/p99, not just p90/p95.

Ran the test via `docker run --rm --network <compose network> grafana/k6 run
...` (host networking isn't usable the same way on Windows Docker Desktop, so
the k6 container was attached to the compose network directly instead).
Confirmed results were stable across repeated runs: p50 ≈ 5–6ms, p95 ≈
20–22ms, p99 ≈ 218–223ms, ~14.7 req/s, 0% error rate. Cross-checked replica
logs during the run window and found roughly a 90%+ cache hit rate.

## Turn 5 — Assistant (write-up)

Wrote `results/sprint-3-load-test.md`: reported the percentiles, request
rate, and error rate; compared them against `docs/SLO.md`'s
`regional-routing-service` targets (400ms p95 latency, 99% success), noting
both are met with margin and that the p95/p99 gap reflects the cache
boundary; and gave an interpretation naming the simulated 200ms compute delay
on a cache miss as the real bottleneck (not the ambassador/Caddy hops), with
a note that a higher-VU and colder-cache run would be needed in Sprint 5 to
see the worst-case miss-dominated profile the SLO is meant to guard against.

Updated `docs/SERVICES.md`: added `redis` to the service list and Mermaid
diagram (as a shared cache node connected to all three routing replicas),
and added a "Sprint 3 Redis Caching Verification" section with a recorded
validation entry describing the manual `curl` test above.

## Turn 6 — User

Asked how to handle this repo's AI-disclosure convention (a canonical
`AI-DISCLOSURE.md` entry plus a raw session transcript per contribution),
since this session can't be auto-exported in the Codex JSONL format used by
some existing entries. Offered three options: a summary-only disclosure, no
disclosure yet, or the student exporting the transcript separately.

## Turn 6 — Assistant

User chose a summary-only disclosure. Found that the student's own prior
Sprint 2 session (`ai/chats/dos0n-sprint2/`) already established a condensed
markdown session-log pattern, used directly in `ai/chats/<name>/` without a
corresponding section in the canonical root `AI-DISCLOSURE.md` (unlike the
other two teammates' sessions). Followed that existing personal convention:
wrote this file, and did not add a new section to the canonical
`AI-DISCLOSURE.md`.

## Turn 7 — User

Asked whether to merge the teammate's scaffolding PR (#10) first before
implementing changes, to preserve their authored commit in the individual
grading history rather than overwriting it.

## Turn 7 — Assistant

Recommended merging PR #10 first, then rebasing this branch on top so the
teammate's commit stays in history underneath the rewritten load test file.
User merged PR #10; the assistant fetched `origin/main`, rebased
`sprint-3-task-2-redis-caching-and-load-test` onto it, resolved the one
add/add conflict in `load-tests/sprint-3-load.js` by keeping the full
rewritten script over the 1-VU/1s scaffold, and force-pushed the rebased
branch.

## Turn 8 — User

Asked the assistant to open a PR.

## Turn 8 — Assistant

`gh` was not available in this environment, so the assistant pushed the
branch and gave the student the GitHub compare-branch URL plus a suggested
PR title/description, rather than fabricating a PR-open action it couldn't
perform.

## Turn 9 — User

Asked whether the work as it stood actually satisfied the full Sprint 3
rubric, pasting the point breakdown.

## Turn 9 — Assistant

Checked `docs/SERVICES.md` for service ownership and found the student is
listed as owner of `incident-ambassador` and `responder-dispatch-service`,
not `regional-routing-service` (owned by a teammate). Flagged that two
individual-rubric criteria were not yet satisfied: the results report's SLO
comparison only covered `regional-routing-service`'s SLO (not one of the
student's own services), and the k6 script never exercised the student's own
service, so there was no evidence it "functions correctly ... when exercised
by the k6 load test." Reported team criteria as fully satisfied but
individual criteria at ~20/40 (only the authored-commits criterion clearly
met), and offered to fix both gaps.

## Turn 10 — User

Confirmed: fix the gaps.

## Turn 10 — Assistant

Read `responder-dispatch-service/src/index.js` and its `response-teams.json`
fixture to find a safe way to exercise it under load (`POST /dispatches`
with a random UUID `incidentId` and a real `teamId` from the roster — the
service validates `teamId` against its known roster but does not require
`incidentId` to reference a real incident). Updated
`load-tests/sprint-3-load.js` to send a `POST /dispatches` request directly
to `responder-dispatch-service` (it has no ambassador) alongside the existing
routing request each iteration, using separate k6 `Trend` metrics
(`routing_route_duration`, `dispatch_create_duration`) so each service's
latency could be read out independently rather than blended into one
`http_req_duration`. Re-ran the full stack and the load test twice via
Docker to confirm stable numbers, then rewrote `results/sprint-3-load-test.md`
to report both endpoints' p50/p95/p99/request-rate/error-rate and add a
`responder-dispatch-service` SLO comparison section (500 ms p95 latency /
99% success / exactly-once dispatch), noting the exactly-once invariant
itself is not exercised by this load test and would need a dedicated
duplicate-request test in Sprint 5.

---

## AI-assisted files (this session, `sprint-3-task-2-redis-caching-and-load-test` branch)

- `regional-routing-service/src/index.js` (Redis caching added to `GET /route`)
- `regional-routing-service/package.json` / `package-lock.json` (added the
  `redis` dependency; strict JSON, see below)
- `docker-compose.yml` (the `redis` service block and routing-replica
  `REDIS_URL`/`ROUTE_CACHE_TTL_SECONDS`/`depends_on` wiring)
- `load-tests/sprint-3-load.js` (rewritten from the existing scaffold)
- `results/sprint-3-load-test.md` (new)
- `docs/SERVICES.md` (Redis node in the diagram, service list entry, and the
  caching verification section)

## Strict JSON disclosure

`regional-routing-service/package.json` and the npm-generated
`regional-routing-service/package-lock.json` cannot contain inline comments,
so the added `redis` dependency's AI assistance is documented here instead.

## Scope of student direction

The student directed which endpoint to cache (implicitly, by pointing at the
remaining Sprint 3 deliverables and the existing routing-replica work), which
scaffolding branch to build on, and how to resolve the AI-disclosure question
for this session. The assistant chose the caching key granularity, the hot
spot/dispersed-location load test design, the TTL default, and the report's
interpretation and recommendations, subject to the student's review before
merge.
