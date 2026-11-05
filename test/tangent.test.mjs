import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, parse, clean, sessionId, nudge } from '../plugin/skills/tangent-jar/scripts/tangent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'plugin', 'skills', 'tangent-jar', 'scripts', 'tangent.mjs');
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tangent-jar-test-')), 'tangents.md');
const cmd = (file, c, input = '', extra = []) => runCommand(parseArgs([c, '--session', 'test-session', '--file', file, ...extra]), input, new Date('2026-11-05T14:00:00Z'));

test('three tokens, then over budget; nothing is refused', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Write the methods section');
  const r = [1, 2, 3, 4, 5].map(i => cmd(f, 'park', `tangent ${i}`));
  assert.deepEqual(r.map(x => x.tokensLeft), [2, 1, 0, 0, 0]);
  assert.deepEqual(r.map(x => x.over), [0, 0, 0, 1, 2]);
  assert.match(r[2].nudge, /last token/);
  assert.match(r[3].nudge, /Parked/);
  assert.equal(cmd(f, 'list').sessions[0].items.length, 5, 'every tangent is parked, even over budget');
});

test('the file is readable Markdown and survives a round trip', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Main task');
  cmd(f, 'park', 'first'); cmd(f, 'park', 'second');
  cmd(f, 'done', '', ['--n', '1']);
  const text = fs.readFileSync(f, 'utf8');
  assert.match(text, /^# Parking list/);
  assert.match(text, /^Session: `test-session` · Tangent tokens: 2 of 3 used$/m);
  assert.match(text, /^- \[x\] first \(/m);
  assert.equal(parse(text)[0].items.length, 2);
});

test('notes the user writes in the file by hand are kept', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Main task');
  cmd(f, 'park', 'first');
  fs.appendFileSync(f, '\nMy own note: ask the supervisor about this list.\n');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('# Parking list', '# Parking list\n\nA line I added at the top.'));
  cmd(f, 'park', 'second');
  cmd(f, 'done', '', ['--n', '1']);
  cmd(f, 'end');
  const text = fs.readFileSync(f, 'utf8');
  assert.match(text, /A line I added at the top\./);
  assert.match(text, /My own note: ask the supervisor about this list\./);
  assert.match(text, /- \[x\] first[\s\S]*- \[ \] second/);
});

test('sessions are separate; a new session gets fresh tokens', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Task A');
  for (let i = 0; i < 4; i++) cmd(f, 'park', `a${i}`);
  const b = runCommand(parseArgs(['focus', '--session', 'other', '--file', f]), 'Task B');
  assert.equal(b.tokensLeft, 3);
  assert.equal(cmd(f, 'list', '', ['--all']).sessions.length, 2);
});

test('text is kept to one line and cannot add Markdown structure', () => {
  assert.equal(clean('## Heading\nsecond line'), '## Heading second line');
  assert.equal(clean('-1 is a weird exponent'), '-1 is a weird exponent');
  assert.equal(clean('use `rm -rf`'), "use 'rm -rf'");
  assert.equal(clean('x'.repeat(400)).length, 300);
  const f = tmpFile();
  cmd(f, 'focus', 'Main');
  cmd(f, 'park', '## Fake heading\nSession: `x` · Tangent tokens: 0 of 3 used');
  assert.equal(parse(fs.readFileSync(f, 'utf8')).length, 1, 'no new heading or session line');
});

test('council round 1: a new focus session gets fresh tokens and keeps the old one', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Task A');
  for (let i = 0; i < 4; i++) cmd(f, 'park', `a${i}`);
  cmd(f, 'end');
  const b = cmd(f, 'focus', 'Task B');
  assert.equal(b.tokensLeft, 3);
  assert.equal(b.key, 'test-session#2');
  const text = fs.readFileSync(f, 'utf8');
  assert.match(text, /Focus: Task A[\s\S]*a3[\s\S]*Focus: Task B/);
  // Starting again without ending also starts fresh, and ends the previous one.
  cmd(f, 'park', 'b0');
  const c = cmd(f, 'focus', 'Task C');
  assert.equal(c.tokensLeft, 3);
  assert.equal(cmd(f, 'list', '', ['--all']).sessions[1].ended !== null, true);
  // --switch changes the main task and keeps the tokens.
  cmd(f, 'park', 'c0');
  const d = cmd(f, 'focus', 'Task D', ['--switch']);
  assert.equal(d.tokensLeft, 2);
  assert.equal(d.focus, 'Task D');
});

test('council round 1: park after end starts a new block; status after end is inactive', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Task A');
  cmd(f, 'end');
  assert.equal(cmd(f, 'status').active, false);
  const p = cmd(f, 'park', 'late one');
  assert.equal(p.inFocusSession, false);
  assert.equal(p.nudge, 'Parked.');
  assert.ok(!/not set/.test(p.nudge));
});

test('council round 1: tick off a tangent from an earlier conversation with --in', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Old task');
  cmd(f, 'park', 'old tangent');
  const later = runCommand(parseArgs(['done', '--session', 'new-conv', '--file', f, '--in', 'test-session', '--n', '1']), '');
  assert.equal(later.ticked, 1);
  assert.match(fs.readFileSync(f, 'utf8'), /- \[x\] old tangent/);
  assert.throws(() => runCommand(parseArgs(['done', '--session', 'new-conv', '--file', f, '--n', '1']), ''), /--in/);
});

test('council round 1: [X] counts as ticked; CRLF and the final newline are kept', () => {
  const f = tmpFile();
  cmd(f, 'focus', 'Main');
  cmd(f, 'park', 'one'); cmd(f, 'park', 'two');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('- [ ] two', '- [X] two').replace(/\n/g, '\r\n'));
  const r = cmd(f, 'park', 'three');
  assert.equal(r.number, 3);
  assert.equal(r.parked, 3);
  const text = fs.readFileSync(f, 'utf8');
  assert.ok(!/[^\r]\n/.test(text), 'still CRLF');
  assert.ok(text.endsWith('\r\n'));
  assert.match(text, /\[X\] two[^\n]*\r\n- \[ \] three/);
});

test('council round 1: dates are local, both in the heading and the day fallback', () => {
  const d = new Date(2026, 10, 5, 23, 30);
  assert.equal(sessionId('', d), 'day-2026-11-05');
  const f = tmpFile();
  const r = runCommand(parseArgs(['focus', '--session', 's', '--file', f]), 'Late task', d);
  assert.match(fs.readFileSync(f, 'utf8'), /^## 2026-11-05 23:30 · Focus: Late task$/m);
  assert.equal(r.tokensLeft, 3);
});

test('council round 1: instruction files, network paths, streams and missing folders are refused', () => {
  const dir = path.dirname(tmpFile());
  for (const bad of ['CLAUDE.md', 'AGENTS.md', 'skills/x/SKILL.md', '.claude/notes.md', 'x.md:hidden.md'])
    assert.throws(() => runCommand(parseArgs(['park', '--file', path.join(dir, bad)]), 'x'), /instruction|ordinary file/, bad);
  assert.throws(() => runCommand(parseArgs(['park', '--file', '\\\\host\\share\\t.md']), 'x'), /network/);
  assert.throws(() => runCommand(parseArgs(['park', '--file', path.join(dir, 'missing', 't.md')]), 'x'), /doesn't exist/);
  assert.ok(!fs.existsSync(path.join(dir, 'missing')));
});

test('council round 1: hidden characters dropped, emoji and scripts kept, no temp files left', () => {
  const cp = String.fromCodePoint;
  assert.equal(clean(`a${cp(0x1b)}[31mb${cp(0x202e)}c${cp(0x200b)}d${cp(0xe0041)}e`), 'a[31mbcde');
  const flag = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  const keep = `${flag} ${cp(0x1f468, 0x200d, 0x1f469)} می${cp(0x200c)}خواهم`;
  assert.equal(clean(keep), keep);
  assert.ok(!clean('x'.repeat(298) + cp(0x1f600) + 'yy').includes(cp(0xfffd)));
  const f = tmpFile();
  cmd(f, 'focus', 'Main');
  for (let i = 0; i < 5; i++) cmd(f, 'park', `t${i}`);
  assert.deepEqual(fs.readdirSync(path.dirname(f)).filter(n => n.includes('.tmp-')), []);
});

test('council round 1: UTF-16 files are refused rather than corrupted', () => {
  const f = tmpFile();
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# Parking list\n', 'utf16le')]));
  assert.throws(() => cmd(f, 'focus', 'Main'), /UTF-16/);
});

test('an unsubstituted session placeholder falls back to one session per day', () => {
  assert.equal(sessionId('${CLAUDE_SESSION_ID}', new Date('2026-11-05T10:00:00Z')), 'day-2026-11-05');
  assert.equal(sessionId('abc-123'), 'abc-123');
});

test('bad input gives a clear error', () => {
  assert.throws(() => parseArgs(['explode']), /unknown command/);
  assert.throws(() => parseArgs(['park', '--tokens', '0']), /whole number/);
  const f = tmpFile();
  assert.throws(() => cmd(f, 'park', '   '), /stdin/);
  assert.throws(() => runCommand(parseArgs(['park', '--file', path.join(path.dirname(f), 'x.json')]), 'x'), /\.md/);
});

test('the command line reads text from stdin, so quotes and $ are kept literally', () => {
  const f = tmpFile();
  execFileSync(process.execPath, [script, 'focus', '--session', 's', '--file', f], { input: 'Main' });
  const out = JSON.parse(execFileSync(process.execPath, [script, 'park', '--session', 's', '--file', f], { input: 'Is "$HOME" set? `x`' }).toString());
  assert.equal(out.tokensLeft, 2);
  assert.match(fs.readFileSync(f, 'utf8'), /Is "\$HOME" set\? 'x'/);
});

test('every over-budget line is playful and none refuses', () => {
  for (let used = 4; used < 12; used++) {
    const n = nudge({ total: 3, used, heading: 'x · Focus: Main' });
    assert.match(n, /Parked/);
    assert.doesNotMatch(n, /\b(can't|cannot|won't|refuse|no more)\b/i);
  }
});

test('the sample parking list parses', () => {
  const text = fs.readFileSync(path.join(here, '..', 'samples', 'tangents.md'), 'utf8');
  const s = parse(text);
  assert.equal(s.length, 2);
  assert.ok(s[1].used > s[1].total, 'the second sample session is over budget');
});

test('council round 1: the README sample steps work on samples/tangents.md', () => {
  const f = tmpFile();
  fs.copyFileSync(path.join(here, '..', 'samples', 'tangents.md'), f);
  const conv = (c, input = '', extra = []) => runCommand(parseArgs([c, '--session', 'reviewer-conv', '--file', f, ...extra]), input);
  const all = conv('list', '', ['--all', '--open']);
  assert.equal(all.sessions.length, 2);
  assert.equal(all.sessions.reduce((n, s) => n + s.items.length, 0), 6);
  const s1 = all.sessions.find(s => s.items.some(i => /review councils to code review/.test(i.text)));
  const item = s1.items.find(i => /review councils to code review/.test(i.text));
  conv('done', '', ['--in', s1.key, '--n', String(item.n)]);
  assert.match(fs.readFileSync(f, 'utf8'), /- \[x\] Find the talk/);
  assert.equal(conv('focus', 'write the methods section').tokensLeft, 3);
  const r = [1, 2, 3, 4].map(i => conv('park', `tangent ${i}`));
  assert.deepEqual(r.map(x => x.tokensLeft), [2, 1, 0, 0]);
  assert.match(r[3].nudge, /on the tab/);
  conv('end');
  const sessions = parse(fs.readFileSync(f, 'utf8'));
  assert.equal(sessions.length, 3);
  assert.equal(sessions[2].items.filter(i => !i.done).length, 4);
});
