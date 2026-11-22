# Kiro Support Bot

A first-line support bot for the fictional Relay Desk product. The local demo shows how a draft stays held until a reviewer approves it. Only the simulated outbox receives replies.

## Replay the held reply

Use Node.js 22.13 or later. The app uses built-in Node modules.

```sh
node src/server.mjs
```

1. Open [Relay Desk](http://127.0.0.1:4173) and add the **Partially answered question** sample. The answer view shows **Held for review**, a 40% policy score, and blocked delivery.
2. Choose **Approve reply**. The decision ledger shows `human:demo-reviewer` and the simulated outbox event. To see the other outcomes, add a fresh sample and choose **Edit before approving** or **Reject reply**.
3. Copy the ticket ID. In a Kiro session for this folder, ask the `relay-desk-ledger` MCP server to call `ledger_get_ticket` with that ID. It reads the same ledger from `.local/workflow.sqlite` and returns the events in order.

This is a single-operator localhost demo with synthetic tickets and a fixed reviewer identity. The server uses no email or external delivery service. The database stays in the ignored `.local/` folder.

## Verify locally

```sh
node scripts/verify-day-1.mjs
node scripts/verify-day-2.mjs
```

The Day 2 verifier runs a localhost server with temporary data. It checks held and delivered views, unchanged and edited approval, rejection, sensitive and high-confidence cases, and the read-only MCP tool.

## Kiro workspace

- [Day 1 spec](.kiro/specs/day-1/design.md) and [Day 2 spec](.kiro/specs/day-2/design.md)
- [Project steering](.kiro/steering/project.md) and [verification hook](.kiro/hooks/day-1.json)
- [Workspace MCP configuration](.kiro/settings/mcp.json)

The Day 1 CLI is still available with `node src/support.mjs fixtures/tickets/workspace-export.json`. It writes to the original JSON ledger.

[MIT license](LICENSE)
