# AI Session: Sprint 2 repo audit + incident-ambassador

- Date: 2026-07-27
- Course: COMPSCI 426 Scalable Web Systems
- Student folder: `ai/chats/dos0n-sprint2/`
- Tool: Claude Code (Anthropic), model `claude-sonnet-5`
- Disclosure status: review before submission

Condensed multi-turn session log. Tool calls (file reads, `docker compose` runs,
`git` commands) are summarized in place of the assistant's prose where they
did not produce user-facing text; user and assistant prose are otherwise kept
in substance.

---

## Turn 1 — User

Pasted the full Sprint 2 assignment text and asked the assistant to look at
the current repo and figure out what else needed to be done.

## Turn 1 — Assistant

Located the repo (`426-project-bay-blues`), inspected `docker-compose.yml`,
`docs/SERVICES.md`, git log/branches, and ran `docker compose up --build` to
verify the existing services. Found:

- `incident-service` and `regional-routing-service` + `regional-routing-ambassador`
  were implemented and worked correctly.
- A commit adding the required Mermaid diagram to `docs/SERVICES.md` had been
  merged, but onto the wrong branch (`sradhakrishnan/routing-services`)
  instead of `main` — so `main` still had no diagram.
- An orphaned `incident-ambassador/` folder existed with only a `Dockerfile`
  and `package-lock.json` (no source), abandoned in favor of
  `regional-routing-ambassador`.

Reported this as the one real blocker plus one minor cleanup item.

## Turns 2–7 — User / Assistant

Follow-up questions: what the PR template is for, who added it, service
authorship per directory (`git log --format` per service folder), and a
plain-language PR description. Assistant answered each from `git log`/`git
show` output, then cherry-picked the stuck diagram commit (`544fccc`) onto a
new branch off `main` (`add-sprint2-service-diagram`) and pushed it (later
PR #7).

## Turn 8 — User

Asked what service they should build, since they had no individually-owned
service yet.

## Turn 8 — Assistant

Identified the two remaining unowned services from `docs/SERVICES.md`
(`emergency-gateway`, `responder-dispatch-service`) and asked the user to
choose via a multiple-choice question. User picked `responder-dispatch-service`.

## Turns 9–10 — User / Assistant

User asked to scaffold the service. Assistant built
`responder-dispatch-service/` (Dockerfile, `package.json`, Express source,
`data/response-teams.json` fixture) following the same structure as
`incident-service`: `GET /health`, `GET /teams`, `POST /dispatches`,
`GET /dispatches/:dispatchId`, `PATCH /dispatches/:dispatchId/status`, with
`setTimeout`-based latency via `DISPATCH_LATENCY_MS`. Wired it into
`docker-compose.yml`, updated `docs/SERVICES.md`, verified with
`docker compose up --build` and `curl`, committed on
`add-responder-dispatch-service` (branched off `add-sprint2-service-diagram`),
and pushed it (later PR #8).

## Turn 11 — User

Asked whether the current state fulfilled the Sprint 2 rubric, point by
point.

## Turn 11 — Assistant

Walked the team and individual rubric line by line against what had actually
been verified (not assumed), flagging that neither PR was merged into `main`
yet, so none of the new work was visible to a grader reading `main`. Also
flagged, unprompted, that the team's own `AI-DISCLOSURE.md` convention
(inline `AI:` comments plus a per-student transcript under `ai/chats/`) had
not yet been applied to the new work.

## Turn 12 — User

"Scrap these changes actually, make a sidecar and ambassador, not a third
service."

## Turn 12 — Assistant

Asked a clarifying question (sidecar for `incident-service`, ambassador for
`incident-service`, or both) since the instruction was ambiguous and
materially changed scope. User chose: an ambassador for `incident-service`.

## Turns 13–14 — User / Assistant

Assistant created a new branch (`add-incident-ambassador`, off
`add-sprint2-service-diagram`) and completed the previously-orphaned
`incident-ambassador/` folder: reused the existing `Dockerfile` unchanged,
wrote `package.json`, `.dockerignore`, and `src/index.js` — a proxy in front
of `incident-service` modeled on `regional-routing-ambassador`'s structure,
but supporting `GET`/`HEAD`/`POST` (not just `GET`/`HEAD`), retrying only
idempotent methods to avoid duplicating incident creation on `POST /incidents`
retries. Wired it into `docker-compose.yml` on host port 3003, updated
`docs/SERVICES.md`'s owner list and Mermaid diagram, verified with
`docker compose up --build` (proxied `POST`/`GET` round-tripped correctly,
logs showed each proxied attempt), committed, and pushed (later PR #9).

Left the `add-responder-dispatch-service` branch/PR #8 untouched rather than
closing or deleting it unasked, since that is a visible action on shared
GitHub state; user later said to keep it open for a possible Sprint 4 reuse.

## Turn 15 — User

Asked for merge order, then whether PR #9 alone (since it was branched off
PR #7) already contained everything needed.

## Turn 15 — Assistant

Confirmed PR #9's diff against `main` already included PR #7's diagram
commit, so merging #9 alone would put both on `main`; PR #7 could then be
closed as superseded rather than merged separately.

## Turn 16 — User

Asked whether `incident-ambassador` fulfilled all rubric requirements.

## Turn 16 — Assistant

Re-checked against the individual 40-point criteria and flagged two real
risks instead of declaring success: (1) the ambassador's latency came from
waiting on the real upstream `fetch()`, not from an explicit `setTimeout` in
the ambassador's own code, so the letter of the "setTimeout-based latency"
criterion was not met; (2) the rubric's "primary service" language is
ambiguous as applied to an ambassador, which the assignment text otherwise
treats as accompanying a primary service rather than being one — flagged as
a question for the instructor/TA, not something fixable in code.

## Turn 17 — User

Asked to add the `setTimeout` latency, accepting the "primary service"
ambiguity as out of scope for now.

## Turn 17 — Assistant

Added `AMBASSADOR_PROCESSING_DELAY_MS` (default 50ms) and applied it via the
existing `sleep()` helper (itself `setTimeout`-backed) unconditionally on
every successful proxied response, independent of retry backoff. Wired the
env var into `docker-compose.yml`, updated the `docs/SERVICES.md` service
description, rebuilt and timed a proxied `POST /incidents` request (~340ms,
matching the expected 200ms upstream delay + 50ms ambassador delay),
committed, and pushed.

## Turn 18 — User

Asked to update the AI disclosure with this session.

## Turn 18 — Assistant

Added inline `AI:` disclosure comments to `incident-ambassador/src/index.js`
and `incident-ambassador/.dockerignore` (JSON files, per the team's own
"strict JSON disclosure" convention, are documented here instead of inline),
and wrote this transcript.

---

## AI-assisted files (this session, `add-incident-ambassador` branch)

- `incident-ambassador/src/index.js`
- `incident-ambassador/.dockerignore`
- `incident-ambassador/package.json` (strict JSON; see below)
- `incident-ambassador/package-lock.json` (strict JSON, npm-generated; see below)
- `docker-compose.yml` (the `incident-ambassador` service block and
  `AMBASSADOR_PROCESSING_DELAY_MS` variable)
- `docs/SERVICES.md` (the `incident-ambassador` owner line and diagram nodes)

`incident-ambassador/Dockerfile` was reused unmodified from the pre-existing
orphaned scaffold (originally authored with AI assistance by
`@ShriRadhakrishnan1`; see `ai/chats/sradhakrishnan/`).

## Strict JSON disclosure

`incident-ambassador/package.json` and the npm-generated
`incident-ambassador/package-lock.json` cannot contain inline comments, so
their AI assistance is documented here instead.

## Scope of student direction

The student directed which service to own, the pivot from a third primary
service to an ambassador in front of `incident-service`, the choice of which
HTTP methods the ambassador should proxy and retry, which merge order to use
across the resulting PRs, whether to close or keep open the abandoned
`responder-dispatch-service` PR, and which rubric gaps to close versus flag
for instructor clarification.

## Not yet disclosed

`responder-dispatch-service/` (on the still-open, unmerged
`add-responder-dispatch-service` branch / PR #8) was also built with AI
assistance in this session before being scrapped in favor of the ambassador
approach. It does not yet have inline `AI:` comments or its own disclosure
entry. If that branch is revived (e.g., for a Sprint 4 async-path service),
it should receive the same disclosure treatment before merging.
