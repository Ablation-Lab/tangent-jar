#!/usr/bin/env node
// Tangent Jar helper: keeps the parking list, a Markdown file in the project.
//
//   node tangent.mjs focus  --session <id> [--file <path>] [--tokens 3]   (main task on stdin)
//   node tangent.mjs park   --session <id> [--file <path>]                (tangent on stdin)
//   node tangent.mjs status --session <id> [--file <path>]
//   node tangent.mjs list   [--session <id> | --all] [--open] [--file <path>]
//   node tangent.mjs done   --session <id> --n <number> [--file <path>]
//   node tangent.mjs end    --session <id> [--file <path>]
//
// Text comes in on stdin so quotes and $ signs in it can't break the shell command. The file is
// the only thing it writes (default: tangents.md in the current folder), always replaced whole
// through a temporary file next to it. Output is one line of JSON for Claude to read.
// It makes no network requests and reads nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ALLOWANCE = 3;
const HEADER = '# Parking list\n\nTangents parked by Tangent Jar during focus sessions. Tick one off when you come back to it.\n';

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd, session: null, file: null, tokens: DEFAULT_ALLOWANCE, n: null, all: false, open: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const val = () => { const v = rest[++i]; if (v == null) throw new Error(`${a} needs a value`); return v; };
    if (a === '--session') o.session = val();
    else if (a === '--file') o.file = val();
    else if (a === '--tokens') o.tokens = Number(val());
    else if (a === '--n') o.n = Number(val());
    else if (a === '--all') o.all = true;
    else if (a === '--open') o.open = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!['focus', 'park', 'status', 'list', 'done', 'end'].includes(cmd)) throw new Error(`unknown command "${cmd ?? ''}"; use focus, park, status, list, done or end`);
  if (!Number.isInteger(o.tokens) || o.tokens < 1 || o.tokens > 20) throw new Error('--tokens must be a whole number from 1 to 20');
  return o;
}

// A session ID from Claude Code (${CLAUDE_SESSION_ID}); if the placeholder wasn't substituted,
// fall back to one session per day.
export function sessionId(raw, now = new Date()) {
  if (raw && /^[A-Za-z0-9_.-]{1,80}$/.test(raw)) return raw;
  return `day-${now.toISOString().slice(0, 10)}`;
}

// One line, no Markdown structure, capped: the parking list stays a list.
export function clean(text, max = 300) {
  let t = String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[#>*+-]+\s*/, '').replace(/`/g, "'");
  if (t.length > max) t = t.slice(0, max - 1) + '…';
  return t;
}

const SESSION_LINE = /^Session: `([^`]+)` · Tangent tokens: (\d+) of (\d+) used(?:, (\d+) over)?(?: · Ended (\d\d:\d\d))?\s*$/;
const ITEM = /^- \[( |x)\] (.*)$/;

// Reads sessions from the file's lines, remembering where each part is, so edits change only
// those lines and anything else the user wrote in the file is kept exactly as it was.
export function parseLines(lines) {
  const sessions = [];
  let cur = null;
  lines.forEach((line, i) => {
    const h = line.match(/^## (.+)$/);
    if (h) { cur = { heading: h[1], headingLine: i, id: null, sessionLine: -1, used: 0, total: DEFAULT_ALLOWANCE, ended: null, items: [] }; sessions.push(cur); return; }
    if (!cur) return;
    const s = line.match(SESSION_LINE);
    if (s && cur.sessionLine < 0) { cur.id = s[1]; cur.sessionLine = i; cur.used = Number(s[2]) + Number(s[4] || 0); cur.total = Number(s[3]); cur.ended = s[5] || null; return; }
    const it = line.match(ITEM);
    if (it && cur.sessionLine >= 0) cur.items.push({ done: it[1] === 'x', text: it[2], line: i });
  });
  return sessions.filter(s => s.id);
}

export const parse = text => parseLines(text.replace(/\r\n/g, '\n').split('\n'));

export function sessionText(s) {
  const over = Math.max(0, s.used - s.total);
  return `Session: \`${s.id}\` · Tangent tokens: ${Math.min(s.used, s.total)} of ${s.total} used${over ? `, ${over} over` : ''}${s.ended ? ` · Ended ${s.ended}` : ''}`;
}

// The file as an editable list of lines.
class Doc {
  constructor(text) {
    this.lines = (text ?? '').length ? text.replace(/\r\n/g, '\n').split('\n') : HEADER.split('\n');
    this.sessions = parseLines(this.lines);
  }
  refresh() { this.sessions = parseLines(this.lines); }
  find(id) { return this.sessions.find(s => s.id === id); }
  addSession(heading, id, total) {
    while (this.lines.length && this.lines[this.lines.length - 1] === '') this.lines.pop();
    this.lines.push('', `## ${heading}`, '', sessionText({ id, used: 0, total, ended: null }), '');
    this.refresh();
    return this.find(id);
  }
  update(s) { this.lines[s.sessionLine] = sessionText(s); this.lines[s.headingLine] = `## ${s.heading}`; }
  // After the session's last tangent; the first one goes after the session line and a blank line.
  addItem(s, text) {
    const item = `- [ ] ${text}`;
    if (s.items.length) { this.lines.splice(s.items[s.items.length - 1].line + 1, 0, item); return; }
    const at = s.sessionLine + 1;
    if (this.lines[at] === '') this.lines.splice(at + 1, 0, item);
    else this.lines.splice(at, 0, '', item);
  }
  tick(item) { this.lines[item.line] = this.lines[item.line].replace(/^- \[ \]/, '- [x]'); }
  text() { return this.lines.join('\n'); }
}

const hhmm = d => d.toTimeString().slice(0, 5);
const focusOf = s => s.heading.replace(/^.*?· Focus: /, '');

// Playful, never a refusal. Picked by how far over budget the session is.
const OVER_LINES = [
  'The jar is empty, so this one goes on the tab. Parked anyway.',
  'Tangent on credit. Parked, and the main task would like a word.',
  'At this rate the parking list will need its own focus session. Parked.',
  'Parked. I admire the curiosity; the main task admires it slightly less.',
  'Parked, like the others. The main task has started leaving passive-aggressive notes.',
];

export function nudge(s) {
  const left = s.total - s.used;
  const task = focusOf(s);
  if (left > 1) return `Parked. ${left} tokens left. Back to: ${task}.`;
  if (left === 1) return `Parked. 1 token left, so spend it wisely. Back to: ${task}.`;
  if (left === 0) return `Parked. That was your last token. Back to: ${task}.`;
  return `${OVER_LINES[(-left - 1) % OVER_LINES.length]} (${-left} over.) Back to: ${task}.`;
}

function load(file) {
  return new Doc(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
}

function save(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, doc.text());
  fs.renameSync(tmp, file);
}

function summary(s, extra = {}) {
  return { session: s.id, focus: focusOf(s), tokensUsed: Math.min(s.used, s.total), tokensTotal: s.total, tokensLeft: Math.max(0, s.total - s.used), over: Math.max(0, s.used - s.total),
    open: s.items.filter(i => !i.done).length, parked: s.items.length, ended: s.ended, ...extra };
}

export function runCommand(o, input, now = new Date()) {
  const file = path.resolve(o.file || path.join(process.cwd(), 'tangents.md'));
  if (!/\.(md|markdown|txt)$/i.test(file)) throw new Error('--file must be a .md, .markdown or .txt file');
  const id = sessionId(o.session, now);
  const doc = load(file);
  let s = doc.find(id);
  const stamp = `${now.toISOString().slice(0, 10)} ${hhmm(now)}`;
  const reread = () => { doc.refresh(); s = doc.find(id); };
  switch (o.cmd) {
    case 'focus': {
      const task = clean(input, 200);
      if (!task) throw new Error('give the main task on stdin');
      if (s) { s.heading = `${s.heading.replace(/ · Focus: .*$/, '')} · Focus: ${task}`; s.ended = null; doc.update(s); reread(); }
      else s = doc.addSession(`${stamp} · Focus: ${task}`, id, o.tokens);
      save(file, doc);
      return summary(s, { file, message: `Focus session started on: ${task}. You have ${Math.max(0, s.total - s.used)} tangent tokens.` });
    }
    case 'park': {
      const text = clean(input);
      if (!text) throw new Error('give the tangent on stdin');
      if (!s) s = doc.addSession(`${stamp} · Focus: (not set)`, id, o.tokens);
      s.used += 1;
      const label = s.used <= s.total ? `token ${s.used}` : `over budget +${s.used - s.total}`;
      doc.update(s);
      doc.addItem(s, `${text} (${hhmm(now)}, ${label})`);
      reread();
      save(file, doc);
      return summary(s, { file, number: s.items.length, nudge: nudge(s) });
    }
    case 'status':
      if (!s) return { file, session: id, active: false, message: 'No focus session in this conversation yet.' };
      return summary(s, { file, active: !s.ended });
    case 'list': {
      const pick = o.all ? doc.sessions : (s ? [s] : []);
      return { file, sessions: pick.map(x => ({ ...summary(x), items: x.items.map((it, k) => ({ n: k + 1, done: it.done, text: it.text })).filter(it => !o.open || !it.done) })) };
    }
    case 'done': {
      if (!s) throw new Error('no focus session in this conversation');
      if (!Number.isInteger(o.n) || o.n < 1 || o.n > s.items.length) throw new Error(`--n must be 1 to ${s.items.length}`);
      doc.tick(s.items[o.n - 1]);
      reread();
      save(file, doc);
      return summary(s, { file, ticked: o.n });
    }
    case 'end': {
      if (!s) throw new Error('no focus session in this conversation');
      s.ended = hhmm(now);
      doc.update(s);
      reread();
      save(file, doc);
      return summary(s, { file, message: `Session ended. ${s.items.filter(i => !i.done).length} tangent(s) waiting in ${path.basename(file)}.` });
    }
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const input = ['focus', 'park'].includes(o.cmd) ? await readStdin() : '';
    console.log(JSON.stringify(runCommand(o, input)));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
    process.exit(2);
  }
}
