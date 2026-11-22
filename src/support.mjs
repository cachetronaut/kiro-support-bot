import { randomUUID } from 'node:crypto';
import {
  linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const manual = new URL('../docs/manual.json', import.meta.url);
const categories = new Set(['how_to', 'sensitive', 'other']);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readTicket(file) {
  const input = readJson(file);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Ticket must be a JSON object.');
  }
  const { id, category, subject, message } = input;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) {
    throw new Error('Ticket ID must start with a lowercase letter and contain only lowercase letters, digits, or hyphens (1–64 characters).');
  }
  if (!categories.has(category)) {
    throw new Error('Ticket category must be how_to, sensitive, or other.');
  }
  if (!isText(subject) || !isText(message)) {
    throw new Error('Ticket subject and message must be nonempty strings.');
  }
  return { id, category, subject, message };
}

function words(text) {
  return new Set(text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu));
}

function searchManual(ticket) {
  const articles = readJson(manual);
  if (!Array.isArray(articles) || !articles.length || !articles.every(article =>
    article && isText(article.id) && isText(article.title) && isText(article.excerpt)
    && Array.isArray(article.terms) && article.terms.every(isText)
  )) {
    throw new Error('Product manual requires a nonempty list of complete articles.');
  }
  if (new Set(articles.map(article => article.id)).size !== articles.length) {
    throw new Error('Product manual article IDs must be unique.');
  }

  const query = words(ticket.subject + ' ' + ticket.message);
  return articles.map(({ id, title, excerpt, terms }) => {
    const articleWords = words([title, ...terms].join(' '));
    const score = [...articleWords].filter(word => query.has(word)).length;
    return { articleId: id, title, excerpt, score };
  }).filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.articleId.localeCompare(b.articleId, 'en'));
}

function readDecision(path, ticket) {
  let decision;
  try {
    decision = readJson(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!decision || !isDeepStrictEqual(decision.ticket, ticket)) {
    throw new Error('Ticket ID already exists with different input: ' + ticket.id);
  }
  return decision;
}

function analyzeTicket(ticket, ledgerDir) {
  const destination = join(ledgerDir, ticket.id + '.json');
  const existing = readDecision(destination, ticket);
  if (existing) return existing;

  const decision = {
    schemaVersion: 1,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    action: 'ticket.analyzed',
    actor: { type: 'system', id: 'intake' },
    ticket,
    matches: searchManual(ticket),
  };

  mkdirSync(ledgerDir, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(ledgerDir, '.pending-'));
  const pending = join(staging, 'decision.json');
  try {
    writeFileSync(pending, JSON.stringify(decision, null, 2) + '\n', {
      flag: 'wx', mode: 0o600, flush: true,
    });
    // Publish the complete record in one step. A concurrent writer can win only once.
    try {
      linkSync(pending, destination);
      return decision;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const winner = readDecision(destination, ticket);
      if (!winner) throw error;
      return winner;
    }
  } finally {
    rmSync(staging, { recursive: true });
  }
}

export { searchManual };

if (import.meta.main ?? (process.argv[1] === import.meta.filename)) {
  try {
    const [ticketFile, ledgerDir = '.local/ledger', ...rest] = process.argv.slice(2);
    if (!ticketFile || rest.length) {
      throw new Error('Usage: node src/support.mjs <ticket.json> [ledger-directory]');
    }
    const decision = analyzeTicket(readTicket(ticketFile), ledgerDir);
    console.log(JSON.stringify(decision, null, 2));
  } catch (error) {
    console.error('Intake failed: ' + error.message);
    process.exitCode = 1;
  }
}
