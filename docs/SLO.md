# Service Level Objectives

These SLOs describe what "good enough" means for the Blue Light emergency response network. They are commitments we intend to hold the system to, measured against in Sprint 3 and Sprint 5.

## emergency-gateway

- **Latency SLO:** The `POST /requests` intake endpoint must respond within 300 ms at the 95th percentile. A student in an active emergency is waiting on this acknowledgment before they know help is on the way; delay here reads as the app failing them at the worst possible moment.
- **Reliability SLO:** The intake endpoint must succeed at least 99% of the time. Separately, as a correctness invariant (not a percentage target): duplicate submissions of the same request (retries from a flaky mobile connection) must be deduplicated via idempotency key so no incident is ever created twice. A failed intake means a call for help was silently dropped, which is unacceptable; a duplicated incident wastes responder capacity and can misdirect resources during a real crisis, so intake favors at-most-once incident creation over at-least-once.

## incident-service

- **Latency SLO:** The `POST /incidents` creation endpoint must respond within 250 ms at the 95th percentile, since regional-routing-service and responder-dispatch-service both block on incident state before they can act.
- **Reliability SLO:** Incident state writes must succeed at least 99% of the time. A failed or lost incident record is a correctness failure, not just a slow one: it means a real emergency has no authoritative record and may never be routed or dispatched, so this endpoint requires at-least-once delivery with idempotent writes rather than tolerating silent drops.

## regional-routing-service

- **Latency SLO:** The `GET /route` lookup, which maps an incident to its campus/venue region and eligible responder group, must respond within 400 ms at the 95th percentile even during a demand spike (e.g., a Mullins Center event generating thousands of concurrent requests).
- **Reliability SLO:** Routing lookups must succeed at least 99% of the time. A failed lookup is recoverable by retry (annoying, but the incident record still exists), so this endpoint can tolerate at-least-once retries; it must never route a single incident to two conflicting regions, which would double-dispatch responders to the same event.

## responder-dispatch-service

- **Latency SLO:** The `POST /dispatch` endpoint, which notifies and assigns a security/medical/police/crisis-response team, must respond within 500 ms at the 95th percentile. Responders and the requesting student are both waiting on this confirmation before anyone acts.
- **Reliability SLO:** Dispatch requests must succeed at least 99% of the time. Separately, as a correctness invariant (not a percentage target): a given incident must be dispatched exactly once. A failed dispatch call is dangerous on its own, but a double-dispatch (two teams assigned to the same incident, or one team double-counted as available) is a data integrity problem that wastes scarce responder capacity during exactly the high-severity moments when it's least affordable, so dispatch requires idempotent, at-most-once assignment semantics.
