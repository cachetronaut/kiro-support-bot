# Requirements Document

## Introduction

Relay Desk reviews synthetic support tickets before any uncertain reply reaches the simulated outbox.

## Glossary

- **Policy score** measures how strongly the release rules support the answer.
- **Simulated outbox** is a durable ledger event containing the delivered text.

## Requirements

### Requirement 1: Triage

**User Story:** As a reviewer, I want to see the draft, its sources, and why a ticket needs review.

#### Acceptance Criteria

1. WHEN an allowlisted how-to ticket matches its reviewed article, THE system SHALL record a high-confidence decision and simulate delivery of the article answer.
2. IF the ticket is sensitive, unclear, unsupported, or lacks complete evidence, THEN THE system SHALL hold its draft and record zero delivery events.

### Requirement 2: Review and evidence

**User Story:** As a reviewer, I want to decide whether the exact reply reaches the simulated outbox.

#### Acceptance Criteria

1. WHEN a held reply is approved unchanged or edited and approved, THE system SHALL record the reviewer and exact text delivered locally.
2. WHEN a held reply is rejected, THE system SHALL record the rejection and keep its simulated outbox empty.
3. IF a review cites a stale revision, THEN THE system SHALL reject it and retain the current history.
4. WHEN Kiro calls the ledger MCP tool with a ticket ID, THE system SHALL return its event history in order.
