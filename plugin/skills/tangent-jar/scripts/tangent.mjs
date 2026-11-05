#!/usr/bin/env node
// Tangent Jar helper: keeps the parking list, a Markdown file in the project.
//
//   node tangent.mjs focus  --session <id> [--file <path>] [--tokens 3] [--switch]  (main task on stdin)
//   node tangent.mjs park   --session <id> [--file <path>]                (tangent on stdin)
//   node tangent.mjs status --session <id> [--file <path>]
//   node tangent.mjs list   [--session <id> | --all] [--open] [--file <path>]
//   node tangent.mjs done   --session <id> --n <number> [--in <key>] [--file <path>]
//   node tangent.mjs end    --session <id> [--file <path>]
//
// Text comes in on stdin so quotes and $ signs in it can't break the shell command. The file is
// the only thing it writes (default: tangents.md in the current folder), always replaced whole
// through a temporary file next to it. Output is one line of JSON for Claude to read.
// It makes no network requests and reads nothing else.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_ALLOWANCE = 3;
const HEADER = '# Parking list\n\nTangents parked by Tangent Jar during focus sessions. Tick one off when you come back to it.\n';
const NOT_SET = '(not set)';

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd, session: null, file: null, tokens: DEFAULT_ALLOWANCE, n: null, all: false, open: false, in: null, switch: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const val = () => { const v = rest[++i]; if (v == null) throw new Error(`${a} needs a value`); return v; };
    if (a === '--session') o.session = val();
    else if (a === '--file') o.file = val();
    else if (a === '--tokens') o.tokens = Number(val());
    else if (a === '--n') o.n = Number(val());
    else if (a === '--in') o.in = val();
    else if (a === '--all') o.all = true;
    else if (a === '--open') o.open = true;
    else if (a === '--switch') o.switch = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!['focus', 'park', 'status', 'list', 'done', 'end'].includes(cmd)) throw new Error(`unknown command "${cmd ?? ''}"; use focus, park, status, list, done or end`);
  if (!Number.isInteger(o.tokens) || o.tokens < 1 || o.tokens > 20) throw new Error('--tokens must be a whole number from 1 to 20');
  return o;
}

const pad = n => String(n).padStart(2, '0');
// Local date and time, from the same clock.
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// A session ID from Claude Code (${CLAUDE_SESSION_ID}); if the placeholder wasn't substituted,
// fall back to one session per (local) day.
export function sessionId(raw, now = new Date()) {
  if (raw && /^[A-Za-z0-9_.-]{1,80}$/.test(raw)) return raw;
  return `day-${ymd(now)}`;
}

// Built from code points so the source holds no invisible characters.
const cp = n => String.fromCodePoint(n);
// Bidi embeddings, overrides and isolates, zero-width spaces and word joiners. The joiners emoji and
// many scripts need (U+200C, U+200D) are kept.
const HIDDEN = new RegExp(`[${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}${cp(0x200b)}${cp(0x2060)}${cp(0xfeff)}]`, 'gu');
// Tag characters, except inside a subdivision flag (a black flag, tag letters, then a cancel tag).
const TAGS = new RegExp(`(${cp(0x1f3f4)}[${cp(0xe0020)}-${cp(0xe007e)}]+${cp(0xe007f)})|[${cp(0xe0000)}-${cp(0xe007f)}]`, 'gu');

// One line, capped by characters (so emoji aren't split). Items always start "- [ ] ", so text
// starting with "-" or "#" stays plain text. Backticks become ' so a tangent can't look like a
// session line's id.
export function clean(text, max = 300) {
  const t = String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(HIDDEN, '')
    .replace(TAGS, (m, flag) => flag || '')
    .replace(/`/g, "'")
    .replace(/\s{2,}/g, ' ').trim();
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : t;
}

const SESSION_LINE = /^Session: `([^`]+)` · Tangent tokens: (\d+) of (\d+) used(?:, (\d+) over)?(?: · Ended (\d\d:\d\d))?\s*$/;
const ITEM = /^- \[( |x|X)\] (.*)$/;

// Reads sessions from the file's lines, remembering where each part is, so edits change only
// those lines and anything else the user wrote in the file is kept exactly as it was.
// A conversation can hold several focus sessions; each block gets a key: its session ID for the
// first, then "<id>#2", "<id>#3" and so on.
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
    if (it && cur.sessionLine >= 0) cur.items.push({ done: it[1] !== ' ', text: it[2], line: i });
  });
  const out = sessions.filter(s => s.id);
  const seen = new Map();
  for (const s of out) { const k = (seen.get(s.id) || 0) + 1; seen.set(s.id, k); s.key = k === 1 ? s.id : `${s.id}#${k}`; }
  return out;
}

export const parse = text => parseLines(text.replace(/\r\n/g, '\n').split('\n'));

export function sessionText(s) {
  const over = Math.max(0, s.used - s.total);
  return `Session: \`${s.id}\` · Tangent tokens: ${Math.min(s.used, s.total)} of ${s.total} used${over ? `, ${over} over` : ''}${s.ended ? ` · Ended ${s.ended}` : ''}`;
}

// The file as an editable list of lines.
class Doc {
  constructor(text) {
    const t = text ?? '';
    this.eol = /\r\n/.test(t) ? '\r\n' : '\n';
    this.lines = t.length ? t.replace(/\r\n/g, '\n').split('\n') : HEADER.split('\n');
    this.sessions = parseLines(this.lines);
  }
  refresh() { this.sessions = parseLines(this.lines); }
  // The conversation's current block is its last one.
  latest(id) { return this.sessions.filter(s => s.id === id).pop(); }
  byKey(key) { return this.sessions.find(s => s.key === key); }
  addSession(heading, id, total) {
    // Keep the user's lines; add the block after the last non-blank line, keeping a final newline.
    let end = this.lines.length;
    while (end > 0 && this.lines[end - 1] === '') end--;
    this.lines.splice(end, this.lines.length - end, '', `## ${heading}`, '', sessionText({ id, used: 0, total, ended: null }), '');
    this.refresh();
    return this.latest(id);
  }
  update(s) { this.lines[s.sessionLine] = sessionText(s); this.lines[s.headingLine] = `## ${s.heading}`; }
  // After the session's last tangent; the first one goes after the session line and a blank line.
  addItem(s, text) {
    const item = `- [ ] ${text}`;
    let at;
    if (s.items.length) at = s.items[s.items.length - 1].line + 1;
    else if (this.lines[s.sessionLine + 1] === '') at = s.sessionLine + 2;
    else { this.lines.splice(s.sessionLine + 1, 0, ''); at = s.sessionLine + 2; }
    this.lines.splice(at, 0, item);
    // A blank line before whatever follows (another session's heading), and a final newline.
    if (at + 1 < this.lines.length && this.lines[at + 1] !== '' && !ITEM.test(this.lines[at + 1])) this.lines.splice(at + 1, 0, '');
    if (this.lines[this.lines.length - 1] !== '') this.lines.push('');
  }
  tick(item) { this.lines[item.line] = this.lines[item.line].replace(/^- \[ \]/, '- [x]'); }
  text() { return this.lines.join(this.eol); }
}

const focusOf = s => s.heading.replace(/^.*?· Focus: /, '');

// Playful, never a refusal or a guilt trip. Picked by how far over budget the session is.
const OVER_LINES = [
  'The jar is empty, so this one goes on the tab. Parked anyway.',
  'Tangent on credit. Parked, and the main task would like a word.',
  'At this rate the parking list will need its own focus session. Parked.',
  'Parked. I admire the curiosity; the main task admires it slightly less.',
  'Parked. The jar is overflowing in the best possible way.',
];

// Fixed text, without the user's own words, so nothing in it comes from the file.
export function nudge(s) {
  const left = s.total - s.used;
  if (focusOf(s) === NOT_SET) return 'Parked.';
  if (left > 1) return `Parked. ${left} tokens left. Back to the main task.`;
  if (left === 1) return 'Parked. 1 token left, so spend it wisely. Back to the main task.';
  if (left === 0) return 'Parked. That was your last token. Back to the main task.';
  return `${OVER_LINES[(-left - 1) % OVER_LINES.length]} (${-left} over.) Back to the main task.`;
}

// Files that instruct Claude or other tools are never a parking list.
const INSTRUCTION_FILES = ['claude.md', 'claude.local.md', 'agents.md', 'gemini.md', 'skill.md'];

export function checkFile(raw) {
  const given = String(raw);
  if (/^[\\/]{2}/.test(given)) throw new Error('--file must be on this computer, not a network path');
  const file = path.resolve(given);
  const rest = /^[A-Za-z]:/.test(file) ? file.slice(2) : file;
  if (rest.includes(':')) throw new Error('--file must be an ordinary file name (no ":" after the drive)');
  if (!/\.(md|markdown|txt)$/i.test(file)) throw new Error('--file must be a .md, .markdown or .txt file');
  const parts = file.split(/[\\/]+/).map(p => p.toLowerCase());
  if (INSTRUCTION_FILES.includes(parts[parts.length - 1]) || parts.includes('.claude')) throw new Error(`${path.basename(file)} is an instruction file for Claude or another tool, not a parking list; use tangents.md`);
  const dir = path.dirname(file);
  if (path.dirname(dir) === dir) throw new Error('--file must be in a project folder, not at the top of a drive');
  if (!fs.existsSync(dir)) throw new Error(`the folder ${dir} doesn't exist; create it first or use tangents.md in the project`);
  return file;
}

function load(file) {
  let st;
  try { st = fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return new Doc(''); throw e; }
  if (st.isSymbolicLink() || !st.isFile()) throw new Error(`${path.basename(file)} is a link or not an ordinary file; Tangent Jar won't write to it`);
  if (st.nlink > 1) throw new Error(`${path.basename(file)} has other hard links; Tangent Jar won't write to it`);
  const buf = fs.readFileSync(file);
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff) || buf.includes(0)) throw new Error(`${path.basename(file)} isn't UTF-8 text (it looks like UTF-16); save it as UTF-8 first`);
  return new Doc(buf.toString('utf8'));
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function save(file, doc) {
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, doc.text(), { flag: 'wx' });
    // Windows refuses a rename while another program (an editor, a sync tool) has the file open.
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, file); break; } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 10) throw new Error(`couldn't save ${path.basename(file)} (${e.code}); is it open somewhere that locks it?`);
        sleep(100);
      }
    }
  } finally { fs.rmSync(tmp, { force: true }); }
}

function summary(s, extra = {}) {
  return { session: s.id, key: s.key, focus: focusOf(s), tokensUsed: Math.min(s.used, s.total), tokensTotal: s.total, tokensLeft: Math.max(0, s.total - s.used), over: Math.max(0, s.used - s.total),
    open: s.items.filter(i => !i.done).length, parked: s.items.length, ended: s.ended, ...extra };
}

export function runCommand(o, input, now = new Date()) {
  const file = checkFile(o.file || path.join(process.cwd(), 'tangents.md'));
  const id = sessionId(o.session, now);
  const doc = load(file);
  let s = doc.latest(id);
  const active = () => s && !s.ended;
  const stamp = `${ymd(now)} ${hhmm(now)}`;
  const reread = key => { doc.refresh(); s = doc.byKey(key); };
  switch (o.cmd) {
    case 'focus': {
      const task = clean(input, 200);
      if (!task) throw new Error('give the main task on stdin');
      if (o.switch && active()) {
        // Same session, new main task: the tokens carry on.
        s.heading = `${s.heading.replace(/ · Focus: .*$/, '')} · Focus: ${task}`;
        doc.update(s); reread(s.key);
      } else {
        // A new focus session always gets fresh tokens; an unfinished one is ended first.
        if (active()) { s.ended = hhmm(now); doc.update(s); }
        s = doc.addSession(`${stamp} · Focus: ${task}`, id, o.tokens);
      }
      save(file, doc);
      return summary(s, { file, message: `Focus session on: ${task}. You have ${Math.max(0, s.total - s.used)} tangent tokens.` });
    }
    case 'park': {
      const text = clean(input);
      if (!text) throw new Error('give the tangent on stdin');
      if (!active()) s = doc.addSession(`${stamp} · Focus: ${NOT_SET}`, id, o.tokens);
      s.used += 1;
      const label = s.used <= s.total ? `token ${s.used}` : `over budget +${s.used - s.total}`;
      doc.update(s);
      doc.addItem(s, `${text} (${hhmm(now)}, ${label})`);
      reread(s.key);
      save(file, doc);
      return summary(s, { file, number: s.items.length, inFocusSession: focusOf(s) !== NOT_SET, nudge: nudge(s) });
    }
    case 'status':
      if (!active()) return { file, session: id, active: false, message: 'No focus session running in this conversation.' };
      return summary(s, { file, active: true });
    case 'list': {
      const pick = o.all ? doc.sessions : (s ? [s] : []);
      return { file, sessions: pick.map(x => ({ ...summary(x), items: x.items.map((it, k) => ({ n: k + 1, done: it.done, text: it.text })).filter(it => !o.open || !it.done) })) };
    }
    case 'done': {
      // --in picks any session's block (keys come from list --all), for ticking off in a later conversation.
      const t = o.in ? doc.byKey(o.in) : s;
      if (!t) throw new Error(o.in ? `no session ${o.in} in ${path.basename(file)} (list --all shows the keys)` : 'no focus session in this conversation; use --in with a key from list --all');
      if (!Number.isInteger(o.n) || o.n < 1 || o.n > t.items.length) throw new Error(`--n must be 1 to ${t.items.length}`);
      doc.tick(t.items[o.n - 1]);
      reread(t.key);
      save(file, doc);
      return summary(s, { file, ticked: o.n });
    }
    case 'end': {
      if (!active()) throw new Error('no focus session running in this conversation');
      s.ended = hhmm(now);
      doc.update(s);
      reread(s.key);
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
