# Kiro Support Bot

Cachetronaut's support bot for the fictional Relay Desk product. The Day 1 CLI accepts a synthetic ticket, searches the product manual, and records an intake decision with matching articles in the local ledger.

## Run locally

Use Node.js 22 or later. The CLI uses Node's built-in modules.

~~~sh
node src/support.mjs fixtures/tickets/workspace-export.json
node scripts/verify-day-1.mjs
~~~

The first command prints the decision and stores it at `.local/ledger/ticket-001.json`. An identical retry returns the existing decision. To choose a different ledger directory, pass it after the ticket path. The verifier uses temporary ledgers and checks that the CLI response matches the persisted record.

## Kiro workspace

- [Spec and design](.kiro/specs/day-1/design.md) for the ticket, approval, and ledger contracts
- [Steering](.kiro/steering/project.md) for the synthetic data and release boundary
- [Verification hook](.kiro/hooks/day-1.json) configured to run the local gate after Kiro spec tasks

Next comes the MCP tool server, draft and hold decisions, and the human approval queue with simulated delivery. See the [MIT license](LICENSE).
