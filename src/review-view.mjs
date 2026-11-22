const status = {
  'reply.held': ['Held for review', 'held'],
  'reply.delivered': ['Delivered (simulated)', 'sent'],
  'review.rejected': ['Rejected', 'rejected'],
};
const actionLabel = {
  'ticket.triaged': 'Ticket triaged',
  'reply.held': 'Reply held',
  'review.approved': 'Reviewer approved',
  'review.edited': 'Reviewer edited and approved',
  'review.rejected': 'Reviewer rejected',
  'reply.delivered': 'Simulated delivery recorded',
};
const reason = {
  reviewed_exact_match: 'The reviewed article answers the exact question.',
  incomplete_evidence: 'The manual answers part of the request. A reviewer must decide what to send.',
  sensitive: 'This request needs human judgment before any reply can go out.',
  no_match: 'No product article matched this question.',
  lookup_unavailable: 'The product manual could not be read.',
};

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function html(value) {
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}

function pill(action) {
  const [label, tone] = status[action];
  return `<span class="status ` + tone + `">` + label + '</span>';
}

function reviewForm(ticketId, holdId, draft) {
  const opening = `<form action="/tickets/` + html(ticketId) + `/review" method="post">
    <input type="hidden" name="revision" value="` + html(holdId) + '">';
  return opening + `
      <div class="review-actions">
        <button class="primary" name="decision" value="approve">Approve reply</button>
        <button class="reject" name="decision" value="reject">Reject reply</button>
      </div>
    </form>
    <details>
      <summary>Edit before approving</summary>
      ` + opening + `
        <label for="edited-text">Edited reply</label>
        <textarea id="edited-text" name="text" rows="5" maxlength="1800" required>` + html(draft) + `</textarea>
        <button class="primary" name="decision" value="edit">Approve edited reply</button>
      </form>
    </details>`;
}

function renderAnswer(events) {
  const { ticket, score, reason: reasonCode, matches, draft } = events[0].data;
  const last = events.at(-1);
  const held = last.action === 'reply.held';
  const delivered = last.action === 'reply.delivered';
  const message = held ? 'Delivery blocked until a reviewer approves.'
    : delivered ? 'The reply was written to the simulated outbox.'
    : 'The reply was rejected. The simulated outbox is empty for this ticket.';
  const sources = matches.length
    ? matches.map(match => `<li>` + html(match.title) + ` <code>` + html(match.articleId) + '</code></li>').join('')
    : '<li>No eligible sources</li>';
  const timeline = events.map(event => `<li><div><strong>` + actionLabel[event.action] + `</strong>
    <code>` + html(event.actor) + `</code></div><time datetime="` + html(event.occurredAt) + `">`
    + html(event.occurredAt.replace('T', ' ').slice(0, 19)) + ' UTC</time></li>').join('');
  return `<section class="ticket" aria-labelledby="ticket-title">
    <div class="ticket-head">` + pill(last.action) + `<code>` + html(ticket.id) + `</code></div>
    <h1 id="ticket-title">` + html(ticket.subject) + `</h1>
    <p class="customer-note">` + html(ticket.message) + `</p>
    <article class="answer" aria-labelledby="answer-title">
      <div class="answer-head"><h2 id="answer-title">` + (delivered ? 'Delivered reply' : 'Draft reply') + `</h2>
        <span class="score">Policy score <strong>` + Math.round(score * 100) + `%</strong></span></div>
      <p class="reply-text">` + html(delivered ? last.data.text : draft) + `</p>
      <div class="evidence"><p>` + reason[reasonCode] + `</p><ul class="sources" aria-label="Product documentation sources">` + sources + `</ul></div>
    </article>
    <div class="delivery ` + status[last.action][1] + `" role="status"><span aria-hidden="true"></span>` + message + `</div>
    ` + (held ? reviewForm(ticket.id, last.eventId, draft) : '') + `
    <section class="history" aria-labelledby="history-title"><h2 id="history-title">Decision ledger</h2>
      <ol>` + timeline + `</ol>
    </section>
  </section>`;
}

export function renderPage(tickets, events, error = '') {
  const selected = events[0]?.ticketId;
  const sorted = [...tickets].sort((a, b) => Number(b.action === 'reply.held') - Number(a.action === 'reply.held'));
  const waiting = tickets.filter(ticket => ticket.action === 'reply.held').length;
  const queue = sorted.map(({ id, subject, action }) => `<li><a href="/?ticket=` + html(id) + '"'
    + (id === selected ? ' aria-current="page"' : '') + `><strong>` + html(subject) + '</strong>'
    + pill(action) + '</a></li>').join('');
  const answer = events.length ? renderAnswer(events) : `<section class="empty">
    <h1>Review a support reply</h1><p>Add a sample ticket to see its draft and decision history.</p></section>`;
  const alert = error ? '<p class="error" role="alert">' + html(error) + '</p>' : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relay Desk · Review queue</title><link rel="stylesheet" href="/style.css"></head>
<body><a class="skip" href="#main">Skip to ticket</a>
<header class="mast"><div class="brand"><span class="mark" aria-hidden="true">R</span> Relay Desk</div>
  <span class="local"><i></i> Local simulation</span></header>
<div class="layout">
  <aside><div class="queue-head"><h2>Review queue</h2><span>` + waiting + ` held</span></div>
    <form class="demo" method="post" action="/tickets">
      <label for="scenario">Sample ticket</label>
      <select id="scenario" name="scenario"><option value="held">Partially answered question</option>
        <option value="confident">Documented how-to</option><option value="sensitive">Sensitive request</option></select>
      <button class="primary" type="submit">Add sample ticket</button>
    </form>
    <nav aria-label="Ticket history"><ul class="queue">` + queue + `</ul></nav>
  </aside>
  <main id="main">` + alert + answer + `</main>
</div></body></html>`;
}
