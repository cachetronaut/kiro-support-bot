# Implementation Plan

## Overview

Make the held-reply demo reproducible from a fresh synthetic ticket.

## Tasks

- [x] 1. Implement triage, the append-only ledger, and atomic review decisions.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_
- [x] 2. Build the review queue and answer view.
  - _Requirements: 1.2, 2.1, 2.2_
- [x] 3. Implement the read-only ledger tool, wire the workspace MCP settings, and verify the approval flow through the queue and MCP protocol.
  - _Requirements: 2.4_
- [x] 4. Verify the ledger tool from a Kiro session.
  - _Requirements: 2.4_

## Notes

Use a fresh synthetic ticket for each demo. Run `node scripts/verify-day-2.mjs` for repeatable verification. Kiro workspace trust is required for the in-session MCP call.

## Task Dependency Graph

```json
{"waves":[{"id":0,"tasks":["1"]},{"id":1,"tasks":["2"]},{"id":2,"tasks":["3"]},{"id":3,"tasks":["4"]}]}
```
