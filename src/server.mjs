import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { renderPage } from './review-view.mjs';
import { createWorkflow, ticketIdPattern, WorkflowError } from './workflow.mjs';

const stylesheet = readFileSync(new URL('./review.css', import.meta.url));
const workflow = createWorkflow();
const host = '127.0.0.1';
const port = Number(process.env.SUPPORT_BOT_PORT ?? '4173');

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function show(res, status, ticketId, error) {
  const tickets = workflow.list();
  const selected = ticketId ?? tickets.find(ticket => ticket.action === 'reply.held')?.id ?? tickets[0]?.id;
  const events = selected ? workflow.events(selected) : [];
  if (status === 200 && selected && !events.length) {
    status = 404;
    error = 'Ticket not found.';
  }
  send(res, status, renderPage(tickets, events, error), 'text/html; charset=utf-8');
}

function redirect(res, ticketId) {
  res.writeHead(303, { Location: '/?ticket=' + encodeURIComponent(ticketId) });
  res.end();
}

async function readForm(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    throw new WorkflowError(415, 'Submit the form from the local review screen.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw new WorkflowError(413, 'Form is too large.');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  const authority = host + ':' + server.address().port;
  const origin = 'http://' + authority;
  if (req.headers.host !== authority || (req.method === 'POST' && req.headers.origin !== origin)) {
    return send(res, 403, 'Use the local review screen.');
  }
  let ticketId;
  try {
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') {
      ticketId = url.searchParams.get('ticket') ?? undefined;
      if (ticketId && !ticketIdPattern.test(ticketId)) throw new WorkflowError(404, 'Ticket not found.');
      return show(res, 200, ticketId);
    }
    if (req.method === 'GET' && url.pathname === '/style.css') {
      return send(res, 200, stylesheet, 'text/css; charset=utf-8');
    }
    if (req.method === 'POST' && url.pathname === '/tickets') {
      const form = await readForm(req);
      return redirect(res, workflow.seed(form.get('scenario')));
    }
    const review = /^\/tickets\/([^/]+)\/review$/.exec(url.pathname);
    if (req.method === 'POST' && review && ticketIdPattern.test(review[1])) {
      ticketId = review[1];
      const form = await readForm(req);
      workflow.review(ticketId, form.get('revision'), form.get('decision'), form.get('text'));
      return redirect(res, ticketId);
    }
    return send(res, 404, 'Page not found.');
  } catch (error) {
    if (error instanceof WorkflowError) return show(res, error.status, ticketId, error.message);
    console.error(error);
    return send(res, 500, 'The local workflow could not complete the request.');
  }
});

server.on('close', () => workflow.close());
server.listen(port, host, () => console.log('Relay Desk http://' + host + ':' + server.address().port));
