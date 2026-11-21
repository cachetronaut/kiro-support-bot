# Requirements Document

## Introduction

A first-line support bot uses a fictional product manual and holds uncertain replies for human review. Day 1 ends at intake, retrieval, and the first ledger event.

## Glossary

- **Ticket** means a synthetic support request with an ID, category, subject, and message.
- **Ledger** means the local append-only record of ticket decisions and their actors.

## Requirements

### Requirement 1: Local intake and search

**User Story:** As a support operator, I want to intake a seeded ticket and see the sources the bot found, so that I can verify the decision trail.

#### Acceptance Criteria

1. WHEN the CLI receives a valid ticket JSON file, THE system SHALL accept its ID, category, subject, and message.
2. WHEN a ticket is accepted for the first time, THE system SHALL rank matching manual articles and return their IDs, excerpts, and scores. An unmatched ticket shall return an empty list.
3. WHEN a ticket is analyzed, THE system SHALL write one ledger entry with the ticket, result, actor, and timestamp. An identical retry shall return that entry.
4. IF input is invalid, an ID conflicts with a saved ticket, or the manual cannot be read for a new ticket, THEN THE system SHALL exit with a nonzero status before adding a ledger entry.

### Requirement 2: Reply review for the demo

**User Story:** As a support operator, I want to review uncertain drafts, so that I decide what reply the customer sees.

#### Acceptance Criteria

1. WHEN drafting a reply, THE system SHALL use retrieved articles and record their IDs.
2. IF a request is sensitive, ambiguous, conflicting, or unsupported, THEN THE system SHALL hold the draft for human review.
3. WHEN a human reviews a held draft, THE system SHALL accept approval, edited approval, or rejection and record the reviewer and decision.
4. IF the reply is a high-confidence public documentation answer or has human approval, THEN THE system SHALL allow local simulated delivery of the authorized text. A held or rejected draft stays undelivered.
