import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { searchManual } from './support.mjs';

const defaultDb = fileURLToPath(new URL('../.local/workflow.sqlite', import.meta.url));
const reviewedArticle = 'workspace-export';
const reviewedRequest = {
  category: 'how_to',
  subject: 'Workspace export',
  message: 'Where can I download an archive of my workspace?',
};
export const scenarios = {
  held: {
    category: 'how_to',
    subject: 'Workspace export',
    message: 'Can I download an archive of my workspace and keep comments from archived boards?',
  },
  confident: reviewedRequest,
  sensitive: {
    category: 'sensitive',
    subject: 'Workspace export',
    message: 'Can you download the archive for my former coworker’s workspace?',
  },
};
export const ticketIdPattern = /^demo-[a-f0-9-]{36}$/;
const reviewer = 'human:demo-reviewer';
const outbox = 'system:simulated-outbox';
const acknowledgment = 'Thanks for reaching out. We’ll review your request and follow up.';

export class WorkflowError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalize(text) {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
}

export function evaluateTicket(ticket, lookup = searchManual) {
  if (ticket.category === 'sensitive') {
    return { score: 0, reason: 'sensitive', matches: [], draft: acknowledgment };
  }
  let matches;
  try {
    matches = lookup(ticket);
  } catch {
    return { score: 0, reason: 'lookup_unavailable', matches: [], draft: acknowledgment };
  }
  if (!matches.length) {
    return { score: 0, reason: 'no_match', matches, draft: acknowledgment };
  }
  const reviewedMatch = matches.length === 1 && matches[0].articleId === reviewedArticle;
  const exact = ticket.category === reviewedRequest.category
    && normalize(ticket.subject) === normalize(reviewedRequest.subject)
    && normalize(ticket.message) === normalize(reviewedRequest.message);
  if (reviewedMatch && exact) {
    return { score: 1, reason: 'reviewed_exact_match', matches, draft: matches[0].excerpt };
  }
  const draft = reviewedMatch
    ? matches[0].excerpt + '\n\nWe’ll check the rest of your request and follow up.'
    : acknowledgment;
  return { score: 0.4, reason: 'incomplete_evidence', matches, draft };
}

export function databasePath() {
  return process.env.SUPPORT_BOT_DB || defaultDb;
}

function openDatabase(path, readOnly = false) {
  const db = new DatabaseSync(path, { readOnly });
  db.exec('PRAGMA busy_timeout = 1500');
  return db;
}

function eventsFor(db, ticketId) {
  return db.prepare(`
    SELECT event_id AS eventId, ticket_id AS ticketId, action, actor,
      occurred_at AS occurredAt, data
    FROM events WHERE ticket_id = ? ORDER BY seq
  `).all(ticketId).map(row => ({ ...row, data: JSON.parse(row.data) }));
}

export function readTicketEvents(ticketId) {
  const path = databasePath();
  if (!existsSync(path)) return [];
  const db = openDatabase(path, true);
  try {
    return eventsFor(db, ticketId);
  } finally {
    db.close();
  }
}

export function createWorkflow(path = databasePath()) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = openDatabase(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      ticket_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      data TEXT NOT NULL,
      UNIQUE (ticket_id, action)
    );
    CREATE INDEX IF NOT EXISTS events_ticket ON events (ticket_id, seq);
  `);

  const insert = db.prepare(`
    INSERT INTO events (event_id, ticket_id, action, actor, occurred_at, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  function append(ticketId, action, actor, data) {
    const eventId = randomUUID();
    insert.run(eventId, ticketId, action, actor, new Date().toISOString(), JSON.stringify(data));
    return eventId;
  }

  function transaction(apply) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = apply();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function seed(scenario) {
    if (!Object.hasOwn(scenarios, scenario)) throw new WorkflowError(400, 'Choose a sample ticket.');
    const ticket = { ...scenarios[scenario], id: 'demo-' + randomUUID() };
    const assessment = evaluateTicket(ticket);
    return transaction(() => {
      const triageId = append(ticket.id, 'ticket.triaged', 'system:triage', { ticket, ...assessment });
      if (assessment.score === 1) {
        append(ticket.id, 'reply.delivered', outbox, { text: assessment.draft, authorizationId: triageId });
      } else {
        append(ticket.id, 'reply.held', 'system:triage', { triageId });
      }
      return ticket.id;
    });
  }

  function review(ticketId, revision, decision, editedText) {
    if (!['approve', 'edit', 'reject'].includes(decision)) {
      throw new WorkflowError(400, 'Choose a review decision.');
    }
    return transaction(() => {
      const events = eventsFor(db, ticketId);
      if (!events.length) throw new WorkflowError(404, 'Ticket not found.');
      const hold = events.at(-1);
      if (hold.action !== 'reply.held' || hold.eventId !== revision) {
        throw new WorkflowError(409, 'This draft changed or has already been reviewed.');
      }
      if (decision === 'reject') {
        append(ticketId, 'review.rejected', reviewer, { holdId: hold.eventId });
        return;
      }
      const original = events[0].data.draft;
      const text = decision === 'edit' ? editedText : original;
      if (typeof text !== 'string' || !text.trim() || text.length > 1800) {
        throw new WorkflowError(400, 'Enter a reply of 1 to 1800 characters.');
      }
      const action = decision === 'edit' ? 'review.edited' : 'review.approved';
      const authorizationId = append(ticketId, action, reviewer, { holdId: hold.eventId, text });
      append(ticketId, 'reply.delivered', outbox, { text, authorizationId });
    });
  }

  function list() {
    return db.prepare(`
      SELECT ticket_id AS id, data,
        (SELECT action FROM events latest WHERE latest.ticket_id = initial.ticket_id
         ORDER BY seq DESC LIMIT 1) AS action
      FROM events initial WHERE action = 'ticket.triaged' ORDER BY seq DESC
    `).all().map(({ id, data, action }) => ({ id, subject: JSON.parse(data).ticket.subject, action }));
  }

  return { seed, review, list, events: ticketId => eventsFor(db, ticketId), close: () => db.close() };
}
