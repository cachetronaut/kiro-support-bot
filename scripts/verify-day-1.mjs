import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const app = fileURLToPath(new URL('../src/support.mjs', import.meta.url));
const exportTicket = fileURLToPath(new URL('../fixtures/tickets/workspace-export.json', import.meta.url));
const unmatchedTicket = fileURLToPath(new URL('../fixtures/tickets/unmatched.json', import.meta.url));
const sandbox = mkdtempSync(join(tmpdir(), 'support-bot-gate-'));
const ledger = join(sandbox, 'ledger');

async function intake(ticket, directory = ledger, entryPoint = app) {
  const { stdout } = await execute(process.execPath, [entryPoint, ticket, directory]);
  return JSON.parse(stdout);
}

try {
  const decision = await intake(exportTicket);
  assert.equal(decision.action, 'ticket.analyzed');
  assert.equal(decision.ticket.id, 'ticket-001');
  assert.equal(decision.schemaVersion, 1);
  assert.deepEqual(decision.actor, { type: 'system', id: 'intake' });
  assert.match(decision.eventId, /^[a-f0-9-]{36}$/);
  assert.equal(new Date(decision.occurredAt).toISOString(), decision.occurredAt);
  assert.equal(decision.matches.length, 1);
  assert.equal(decision.matches[0].articleId, 'workspace-export');
  assert.equal(decision.matches[0].score, 4);
  assert.match(decision.matches[0].excerpt, /Workspace Settings/);
  assert.deepEqual(readdirSync(ledger), ['ticket-001.json']);
  assert.deepEqual(JSON.parse(readFileSync(join(ledger, 'ticket-001.json'), 'utf8')), decision);
  assert.deepEqual(await intake(exportTicket), decision);
  console.log('PASS: ticket-001 → workspace-export → one ledger entry, including on retry.');

  const conflict = join(sandbox, 'conflict.json');
  writeFileSync(conflict, JSON.stringify({ ...decision.ticket, message: 'Different message.' }));
  await assert.rejects(intake(conflict), /Ticket ID already exists with different input/);
  assert.deepEqual(JSON.parse(readFileSync(join(ledger, 'ticket-001.json'), 'utf8')), decision);

  const invalid = join(sandbox, 'invalid.json');
  writeFileSync(invalid, JSON.stringify({ ...decision.ticket, id: '../escape' }));
  await assert.rejects(intake(invalid), /Ticket ID must start with a lowercase letter/);
  assert.deepEqual(readdirSync(ledger), ['ticket-001.json']);

  const noMatch = await intake(unmatchedTicket);
  assert.equal(noMatch.ticket.id, 'ticket-002');
  assert.deepEqual(noMatch.matches, []);
  assert.deepEqual(readdirSync(ledger).sort(), ['ticket-001.json', 'ticket-002.json']);

  const concurrentLedger = join(sandbox, 'concurrent-ledger');
  const results = await Promise.all(Array.from({ length: 4 }, () => intake(exportTicket, concurrentLedger)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.deepEqual(readdirSync(concurrentLedger), ['ticket-001.json']);

  const noManual = join(sandbox, 'support.mjs');
  const noManualLedger = join(sandbox, 'no-manual-ledger');
  copyFileSync(app, noManual);
  await assert.rejects(intake(exportTicket, noManualLedger, noManual), /ENOENT.*manual.json/);
  assert.equal(existsSync(noManualLedger), false);
  console.log('PASS: unmatched ticket, invalid ID, ID conflict, concurrent retries, and missing manual.');
} finally {
  rmSync(sandbox, { recursive: true });
}
