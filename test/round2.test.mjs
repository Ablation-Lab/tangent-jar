// Regression tests for the Tangent Jar recheck 1 findings (council round 2).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, parse, clean, checkFile } from '../plugin/skills/tangent-jar/scripts/tangent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'plugin', 'skills', 'tangent-jar', 'scripts', 'tangent.mjs');
const made = [];
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tangent-jar-r2-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const cmd = (file, c, input = '', extra = [], session = 'conv-1') => runCommand(parseArgs([c, '--session', session, '--file', file, ...extra]), input);

test('N1: a planted session id is not a session, and --in only takes safe keys', () => {
  const f = path.join(tmpDir(), 'tangents.md');
  fs.writeFileSync(f, '# Parking list\n\n## 2026-11-01 10:00 · Focus: x\n\nSession: `$(echo SUBST-RAN >&2)` · Tangent tokens: 1 of 3 used\n\n- [ ] planted (10:01, token 1)\n');
  assert.equal(parse(fs.readFileSync(f, 'utf8')).length, 0, 'the block with a bad id is just text');
  const all = cmd(f, 'list', '', ['--all']);
  assert.deepEqual(all.sessions, []);
  for (const bad of ['$(x)', 'a"; echo x; "', '', 'a b', 'x#y'])
    assert.throws(() => parseArgs(['done', '--in', bad, '--n', '1']), /--in takes a session key/, bad);
  assert.equal(parseArgs(['done', '--in', 'abc-1.2_3#2', '--n', '1']).in, 'abc-1.2_3#2');
});

test('N2: two sessions in one conversation: list shows both, done needs --in, end counts everything', () => {
  const f = path.join(tmpDir(), 'tangents.md');
  cmd(f, 'focus', 'Task A');
  cmd(f, 'park', 'a1'); cmd(f, 'park', 'a2');
  cmd(f, 'focus', 'Task B');
  cmd(f, 'park', 'b1');
  const l = cmd(f, 'list');
  assert.deepEqual(l.sessions.map(s => s.key), ['conv-1', 'conv-1#2']);
  assert.throws(() => cmd(f, 'done', '', ['--n', '1']), /2 sessions.*--in.*conv-1, conv-1#2/);
  cmd(f, 'done', '', ['--in', 'conv-1', '--n', '1']);
  const text = fs.readFileSync(f, 'utf8');
  assert.match(text, /- \[x\] a1/);
  assert.match(text, /- \[ \] b1/, 'the other session is untouched');
  const e = cmd(f, 'end');
  assert.equal(e.open, 1);
  assert.equal(e.waitingInFile, 2);
  assert.match(e.message, /1 tangent\(s\) from this session waiting, 2 in all/);
});

test('status is inactive after a park outside a focus session', () => {
  const f = path.join(tmpDir(), 'tangents.md');
  cmd(f, 'park', 'loose idea');
  assert.equal(cmd(f, 'status').active, false);
});

test('line and paragraph separators become spaces', () => {
  const L = String.fromCodePoint(0x2028), P = String.fromCodePoint(0x2029);
  assert.equal(clean(`a${L}b${P}c`), 'a b c');
});

test('N3: the real path is checked, so a Windows short name cannot reach .claude or CLAUDE.local.md', { skip: process.platform !== 'win32' }, () => {
  const d = tmpDir();
  fs.mkdirSync(path.join(d, '.claude'));
  fs.writeFileSync(path.join(d, 'CLAUDE.local.md'), 'keep me\n');
  const short = p => { try { return execSync(`cmd /c for %I in ("${p}") do @echo %~sI`, { encoding: 'utf8' }).trim(); } catch { return null; } };
  const sDir = short(path.join(d, '.claude'));
  const sFile = short(path.join(d, 'CLAUDE.local.md'));
  if (!sDir || sDir.endsWith('.claude')) return; // short names are turned off on this drive
  assert.throws(() => checkFile(path.join(sDir, 'tangents.md')), /\.claude folder/);
  assert.throws(() => cmd(sFile, 'park', 'x'), /instruction file/);
  assert.equal(fs.readFileSync(path.join(d, 'CLAUDE.local.md'), 'utf8'), 'keep me\n');
});

test('non-UTF-8 files are refused, a UTF-8 byte-order mark is kept', () => {
  const d = tmpDir();
  const latin1 = path.join(d, 'a.md');
  fs.writeFileSync(latin1, Buffer.from([0x23, 0x20, 0x43, 0x61, 0x66, 0xe9, 0x0a]));
  assert.throws(() => cmd(latin1, 'focus', 'x'), /isn't UTF-8/);
  assert.deepEqual([...fs.readFileSync(latin1)], [0x23, 0x20, 0x43, 0x61, 0x66, 0xe9, 0x0a], 'unchanged');
  const bom = path.join(d, 'b.md');
  fs.writeFileSync(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Parking list\n')]));
  cmd(bom, 'focus', 'Main');
  assert.deepEqual([...fs.readFileSync(bom).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('the helper runs when its folder is reached through a link', () => {
  const d = tmpDir();
  const link = path.join(d, 'linked');
  fs.symlinkSync(path.dirname(SCRIPT), link, 'junction');
  const r = spawnSync(process.execPath, [path.join(link, 'tangent.mjs'), 'status', '--session', 's1', '--file', path.join(d, 'tangents.md')], { encoding: 'utf8' });
  assert.equal(JSON.parse(r.stdout).active, false);
});
