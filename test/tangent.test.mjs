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
  assert.equal(clean('## Heading\nsecond line'), 'Heading second line');
  assert.equal(clean('use `rm -rf`'), "use 'rm -rf'");
  assert.equal(clean('x'.repeat(400)).length, 300);
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
