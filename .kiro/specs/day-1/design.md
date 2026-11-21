# Design

## Intake and search

The CLI accepts synthetic tickets as JSON. Each ticket requires `id`, `category`, `subject`, and `message`. Categories are `how_to` for public product instructions, `sensitive` for billing disputes, account access, security, privacy, or personal data, and `other` for anything else. Day 1 uses seeded categories. The future release policy must verify category and intent independently of the agent's claims.

Search the bundled manual using distinct words from the subject and message. Rank articles by the count of distinct query words they share with the title or search terms. Omit zero scores and break ties by article ID. A score measures retrieval overlap only. The CLI commits the ticket and ranked sources together in a single intake event. The CLI exits with a nonzero code on invalid input, an ID conflict, an unreadable manual, or a failed write.

## Reply policy and approval

For the full demo, mark confidence high only if one reviewed public article directly answers the entire recognized how-to request and the draft adds zero unsupported claims. Begin with an allowlist of exact normalized synthetic question variants. Hold every other request, including sensitive content regardless of category, multi-intent or ambiguous requests, conflicting evidence, and lookup failures. The release function enforces the rule. The agent cannot approve, change approval state, or deliver held drafts through MCP.

The full workflow starts at `received`. A high-confidence reply moves to `sent` after local delivery succeeds. Any other reply moves to `held`. A human moves `held` to `approved`, `approved_edited`, or `rejected`. Approval binds the exact reply text. Only the approved text can move to `sent`. Rejection is terminal. A delivery failure keeps the approved state for retry.

## Decision ledger

Day 1 saves one immutable JSON file per ticket ID. Each row has `schemaVersion`, `eventId`, `occurredAt` in UTC, `action`, `actor` with `type` and `id`, `ticket`, and `matches`. Each match contains an article ID, title, excerpt, and overlap score. Day 1 records `ticket.analyzed` with actor `system/intake`. Publishing the file atomically keeps intake and search evidence together and resolves concurrent retries by ticket ID. Later events also record state transitions, decision reasons, source IDs, and the exact draft version reviewed or delivered.
