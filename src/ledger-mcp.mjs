import { createInterface } from 'node:readline';
import { readTicketEvents, ticketIdPattern } from './workflow.mjs';

const toolName = 'ledger_get_ticket';
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const tool = {
  name: toolName,
  description: 'Read the ordered decision history of a synthetic Relay Desk ticket.',
  inputSchema: {
    type: 'object',
    properties: { ticketId: { type: 'string', pattern: ticketIdPattern.source } },
    required: ['ticketId'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

function send(id, payload) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...payload }) + '\n');
}

function reply(id, result) {
  send(id, { result });
}

function fail(id, code, message) {
  send(id, { error: { code, message } });
}

function callLedger(id, params) {
  if (params?.name !== toolName) return fail(id, -32602, 'Unknown tool.');
  const args = params.arguments;
  if (!args || Object.keys(args).length !== 1 || typeof args.ticketId !== 'string'
    || !ticketIdPattern.test(args.ticketId)) {
    return fail(id, -32602, 'Use a valid synthetic ticket ID.');
  }
  try {
    const events = readTicketEvents(args.ticketId);
    const data = { ticketId: args.ticketId, found: events.length > 0, events };
    return reply(id, { content: [{ type: 'text', text: JSON.stringify(data) }] });
  } catch {
    return reply(id, { isError: true, content: [{ type: 'text', text: 'The local ledger could not be read.' }] });
  }
}

function handle(request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return fail(null, -32600, 'Invalid request.');
  }
  const { id, method, params } = request;
  if (!Object.hasOwn(request, 'id')) return;
  switch (method) {
    case 'initialize': {
      const version = params?.protocolVersion;
      return reply(id, {
        protocolVersion: versions.includes(version) ? version : versions[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'relay-desk-ledger', version: '0.2.0' },
      });
    }
    case 'ping': return reply(id, {});
    case 'tools/list': return reply(id, { tools: [tool] });
    case 'tools/call': return callLedger(id, params);
    default: return fail(id, -32601, 'Method not found.');
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  try {
    handle(JSON.parse(line));
  } catch (error) {
    if (error instanceof SyntaxError) fail(null, -32700, 'Invalid JSON.');
    else throw error;
  }
}
