import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'relay-desk-verify-'));
const env = { ...process.env, SUPPORT_BOT_DB: join(scratch, 'ledger.sqlite'), SUPPORT_BOT_PORT: '0' };
const server = spawn(process.execPath, ['src/server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
const finished = once(server, 'close');
const lines = createInterface({ input: server.stdout });
let origin;

function mcp(ticketId) {
  const requests = [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'ledger_get_ticket', arguments: { ticketId } } },
  ];
  const input = requests.map(request => JSON.stringify({ jsonrpc: '2.0', ...request })).join('\n') + '\n';
  const stdout = execFileSync(process.execPath, ['src/ledger-mcp.mjs'], { cwd: root, env, input, encoding: 'utf8' });
  const [initialize, list, call] = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(initialize.result.protocolVersion, '2025-11-25');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['ledger_get_ticket']);
  assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  const data = JSON.parse(call.result.content[0].text);
  assert.equal(data.found, true);
  assert.equal(data.ticketId, ticketId);
  return data.events;
}

function form(path, values, source = origin) {
  return fetch(origin + path, { method: 'POST', headers: { Origin: source }, body: new URLSearchParams(values), redirect: 'manual' });
}

async function seed(scenario) {
  const response = await form('/tickets', { scenario });
  assert.equal(response.status, 303);
  const view = response.headers.get('location');
  const id = new URL(view, origin).searchParams.get('ticket');
  const page = await (await fetch(origin + view)).text();
  const revision = page.match(/name="revision" value="([^"]+)"/)?.[1];
  return { id, revision, page };
}

function review(ticket, decision, fields = {}) {
  return form('/tickets/' + ticket.id + '/review', { revision: ticket.revision, decision, ...fields });
}

try {
  const [startup] = await once(lines, 'line');
  origin = startup.split(' ').at(-1);
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await form('/tickets', { scenario: 'held' }, 'http://elsewhere.invalid')).status, 403);

  const held = await seed('held');
  assert.match(held.page, /Delivery blocked until a reviewer approves/);
  assert.match(held.page, /Policy score <strong>40%/);
  const before = mcp(held.id);
  assert.deepEqual(before.map(event => event.action), ['ticket.triaged', 'reply.held']);
  assert.equal((await review(held, 'approve', { revision: 'stale' })).status, 409);
  const results = await Promise.all([review(held, 'approve'), review(held, 'approve')]);
  assert.deepEqual(results.map(result => result.status).sort(), [303, 409]);
  const after = mcp(held.id);
  assert.deepEqual(after.map(event => event.action), ['ticket.triaged', 'reply.held', 'review.approved', 'reply.delivered']);
  assert.deepEqual(after.slice(0, 2), before);
  assert.equal(after[2].actor, 'human:demo-reviewer');
  assert.equal(after[3].data.authorizationId, after[2].eventId);
  assert.equal(after[3].data.text, before[0].data.draft);
  assert.equal(after[3].data.text, after[2].data.text);
  const deliveredPage = await (await fetch(origin + '/?ticket=' + held.id)).text();
  assert.match(deliveredPage, /Delivered reply/);
  assert.doesNotMatch(deliveredPage, /name="decision"/);
  console.log('PASS ' + held.id + ': 40% → held with no delivery → human approval → one simulated delivery; MCP returned all four events.');

  const edited = await seed('held');
  assert.equal((await review(edited, 'edit', { text: '  ' })).status, 400);
  const text = 'We will check <archived board comments>.';
  assert.equal((await review(edited, 'edit', { text })).status, 303);
  const editedEvents = mcp(edited.id);
  assert.equal(editedEvents[2].action, 'review.edited');
  assert.equal(editedEvents[2].data.text, text);
  assert.equal(editedEvents[3].data.text, text);
  assert.match(await (await fetch(origin + '/?ticket=' + edited.id)).text(), /&lt;archived board comments&gt;/);

  const rejected = await seed('sensitive');
  const sensitive = mcp(rejected.id);
  assert.equal(sensitive[0].data.reason, 'sensitive');
  assert.equal(sensitive[0].data.score, 0);
  assert.equal((await review(rejected, 'reject')).status, 303);
  assert.deepEqual(mcp(rejected.id).map(event => event.action), ['ticket.triaged', 'reply.held', 'review.rejected']);
  assert.equal((await review(rejected, 'approve')).status, 409);

  const confident = await seed('confident');
  const direct = mcp(confident.id);
  assert.deepEqual(direct.map(event => event.action), ['ticket.triaged', 'reply.delivered']);
  assert.equal(direct[0].data.score, 1);
  assert.equal(direct[1].data.authorizationId, direct[0].eventId);
  console.log('PASS exact edited reply, rejection with no delivery, sensitive hold, high-confidence delivery, stale/concurrent approvals, and local origin checks.');
} finally {
  lines.close();
  server.kill();
  await finished;
  rmSync(scratch, { recursive: true });
}
