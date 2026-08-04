<!-- AI: This disclosure document was generated with AI assistance from the matching Grok Build chat session. -->

# Sprint 3 Load Test (Deliverable 3) AI Disclosure

This document contains the complete relevant user prompts and assistant responses from this chat session verbatim. It is not a summary.

## Disclosure artifacts

- Session disclosure: `ai/chats/sradhakrishnan/AI-DISCLOSURE.md`
- Tool: Grok Build (xAI), model Grok 4.5
- Date: 2026-08-03
- Branch: `sradhakrishnan/sprint-3-load-test-script`

## Scope of AI assistance

AI assisted with filling in the Sprint 3 k6 load-test scaffolding (`load-tests/sprint-3-load.js`), adding regional-routing SLO thresholds and varied fixture inputs, bringing up Docker Compose, running the real k6 load test against the load-balanced `GET /route` path via the routing ambassador, writing `results/sprint-3-load-test.md` with measured numbers and SLO comparison, committing each deliverable step, adding inline AI disclosure tags, and producing this disclosure file. The student directed commit boundaries, target endpoint (routing ambassador on `:3002`), assignment minimums (≥10 VUs, ≥30s), not touching Redis or services, and not writing results until commit 3.

## AI-assisted files

The following files were generated or substantially modified with AI assistance and contain syntax-appropriate disclosure comments:

- `load-tests/sprint-3-load.js`
- `results/sprint-3-load-test.md`
- `ai/chats/sradhakrishnan/AI-DISCLOSURE.md`

## Complete relevant transcript

### 1. User prompt

````text
sprint 3 deliverable 3 — commit 1 only

there's already a stub at load-tests/sprint-3-load.js from the scaffolding pr. fill that in, don't start a new file from scratch.

caddy + routing replicas are on main. redis is my teammate's, leave it alone.

the script needs to hit the real load-balanced path:
GET /route via the routing ambassador on localhost:3002

right now the stub uses :8080, 1 vu / 1s, and /health — fix all of that.

assignment mins: >=10 vus, >=30s, check for a real successful route response.

look at docker-compose + the routing service if you need the query params.

no results markdown yet, no service changes. edit the script, commit, stop.
````

### 2. Assistant response

````text
I'll fill in the existing load-test stub so it hits the real load-balanced `/route` path. Checking the stub, docker-compose, and routing service for the correct params.
````

### 3. Assistant response

````text
I have the route contract and port. Next I'll update the stub and match this repo's commit style.
````

### 4. Assistant response

````text
Updating the stub to hit `GET /route` on the routing ambassador with assignment-minimum VUs and duration.
````

### 5. Assistant response

````text
**Commit 1 done** on branch `sradhakrishnan/sprint-3-load-test-script`:

`b6e3e2b` — Fill Sprint 3 k6 load test for load-balanced GET /route

### What changed in `load-tests/sprint-3-load.js`

| Before (stub) | After |
|---|---|
| `localhost:8080` | `localhost:3002` (routing ambassador) |
| `GET /health` | `GET /route?latitude=42.3868&longitude=-72.5301&emergencyType=medical` |
| 1 VU / 1s | **10 VUs / 30s** |
| status 200 only | status 200 + `regionId` + `responseGroup.id` |

Query params match the smoke checks in `docs/SERVICES.md` and the routing service contract (`latitude`, `longitude`, optional `emergencyType`).

No results markdown, no service/Redis changes. Stopped after the commit.
````

### 6. User prompt

````text
commit 2 only

script already hits /route with 10 vus / 30s. tighten it up a bit:

- add k6 thresholds from docs/SLO.md for regional-routing-service (p95 latency + error rate)
- don't hit the same lat/lon every time — rotate a few campus coords and emergency types from our fixtures
- keep the run at least 10 vus and 30s

don't run the full load test for a report yet, don't write results/sprint-3-load-test.md, don't touch services/redis.

edit load-tests/sprint-3-load.js, commit, stop.
````

### 7. Assistant response

````text
I'll pull the routing SLO numbers and fixture coords/types, then tighten the script for commit 2.
````

### 8. Assistant response

````text
Updating the script with SLO thresholds and rotating fixture-based requests.
````

### 9. Assistant response

````text
**Commit 2 done** on `sradhakrishnan/sprint-3-load-test-script`:

`a49c535` — Add routing SLO thresholds and varied route inputs to k6 load test

### Updates in `load-tests/sprint-3-load.js`

**SLO thresholds** (from `docs/SLO.md` regional-routing-service):
- `http_req_duration: ['p(95)<400']` — p95 ≤ 400 ms
- `http_req_failed: ['rate<0.01']` — error rate < 1% (≥ 99% success)

**Varied inputs** (from `regions.json` fixtures):
- Rotates all 5 campus region centers
- Rotates all 6 emergency types: `medical`, `fire`, `criminal`, `mental_health`, `other`, `unknown`

**Unchanged:** 10 VUs / 30s, `localhost:3002`, success body checks.

No full run, no results markdown, no service/Redis changes. Stopped after the commit.
````

### 10. User prompt

````text
commit 3 — last one for deliverable 3

bring the stack up if it isn't already, run the k6 script for real, and write results/sprint-3-load-test.md with the actual numbers.

need in the report:
- p50, p95, p99 latency from k6
- request rate and error rate
- comparison to docs/SLO.md for regional-routing-service (my service) — which SLOs we hit / miss
- short interpretation: what the numbers mean, bottleneck, what we'd change later

don't change the load script or services unless something is broken and you can't run. commit only the results file when done.
````

### 11. Assistant response

````text
I'll bring the stack up if needed, run the k6 load test, write the results report from real numbers, and commit only that file.
````

### 12. Assistant response

````text
Docker Desktop failed to start and k6 isn't installed — fixing both.
````

### 13. Assistant response

````text
Docker died mid-build — restarting it and bringing the stack up again.
````

### 14. Assistant response

````text
Docker is up. Building and starting the compose stack.
````

### 15. Assistant response

````text
Caddy load balancer isn't up — checking why.
````

### 16. Assistant response

````text
Stack is healthy. Running the full k6 load test and capturing metrics.
````

### 17. Assistant response

````text
Writing the results report from the measured numbers, then committing only that file.
````

### 18. Assistant response

````text
**Commit 3 done** on `sradhakrishnan/sprint-3-load-test-script`:

`75a07ba` — Record Sprint 3 k6 load test results for regional routing

### Run summary

Stack was brought up (`docker compose up -d --build`). Caddy briefly failed on first boot (`resource deadlock avoided` reading the Caddyfile); a restart fixed it — no service/script changes.

| Metric | Value | vs SLO |
|--------|--------|--------|
| p50 | **210.44 ms** | — |
| p95 | **217.84 ms** | ≤ 400 ms → **hit** |
| p99 | **220.57 ms** | — |
| Request rate | **8.25 req/s** (250 reqs / 30s) | — |
| Error rate | **0.00%** | < 1% → **hit** |

Report: `results/sprint-3-load-test.md`
Only that file was committed (local k6 log/summary left untracked).

### Deliverable 3 commits

1. `b6e3e2b` — fill script for `/route` @ :3002, 10 VUs / 30s
2. `a49c535` — SLO thresholds + varied fixture inputs
3. `75a07ba` — real results + SLO comparison

Stopped after the commit.
````

### 19. User prompt

````text
All the files that you generated should habe the AI generated tag on them, and then create an AI-disclosure.md file that has the EXACT prompt and response in this chat history
````

### 20. Assistant response

````text
I'll match this repo's AI-tag and disclosure conventions, then tag every file I touched and write the disclosure with the exact chat prompts and responses.
````

### 21. Assistant response (this turn — file changes)

````text
Added AI disclosure tags to:

- `load-tests/sprint-3-load.js` (start/end `// AI:` comments pointing at `AI-DISCLOSURE.md` and `ai/chats/sradhakrishnan/`)
- `results/sprint-3-load-test.md` (start/end `<!-- AI: ... -->` comments)

Created:

- `ai/chats/sradhakrishnan/AI-DISCLOSURE.md` with the exact user prompts and assistant responses from this Sprint 3 deliverable 3 chat session (this document).

Note: the repository root already contains Austin’s Sprint 2 `AI-DISCLOSURE.md`; this Sprint 3 load-test disclosure lives under `ai/chats/sradhakrishnan/` so it does not overwrite a teammate’s disclosure.
````
