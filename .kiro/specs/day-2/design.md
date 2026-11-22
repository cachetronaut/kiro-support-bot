# Design

The localhost review screen seeds tickets, displays the draft with sources and score, and writes decisions. A fresh ticket ID makes each demo replayable. The single local operator acts as `human:demo-reviewer`.

Award `1` only to the exact normalized allowlisted subject and message with one matching reviewed article. Send its exact excerpt. Partial matches score `0.4`. Sensitive, unmatched, or unavailable evidence scores `0`. Hold every score below `1`. A held draft quotes an eligible excerpt or uses a neutral acknowledgment. Persist the reason and sources.

Store ordered immutable events in SQLite. Each event has an ID, ticket ID, action, actor, UTC time, and data. Start with `ticket.triaged`, then append `reply.held` or `reply.delivered`. The review command checks the current held event's ID and appends `review.approved`, `review.edited`, or `review.rejected`. An approval and the corresponding `reply.delivered` event commit together with the same text and a reference to the approval event. Use a write transaction to serialize competing decisions. Rejection is terminal. The ledger event itself is the simulated delivery.

The Kiro workspace MCP server opens the database read-only. `ledger_get_ticket` accepts a synthetic ticket ID and returns its timeline. Approval and delivery stay in the local app.
