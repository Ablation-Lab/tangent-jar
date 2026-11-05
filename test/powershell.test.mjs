// The documented PowerShell form (a single-quoted here-string whose text line starts with a space)
// can't be ended early by a tangent that starts with a quote mark and @.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../plugin/skills/tangent-jar/scripts/tangent.mjs', import.meta.url));
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

test('a tangent starting with a curly or straight quote and @ is parked, not run', { skip: process.platform !== 'win32' }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tangent-jar-ps-')); made.push(d);
  const file = path.join(d, 'tangents.md');
  const cp = String.fromCodePoint;
  for (const q of ["'", cp(0x2018), cp(0x2019), cp(0x201a), cp(0x201b)]) {
    const text = `${q}@; Write-Output INJECTED-${q.codePointAt(0)}; @${q}`;
    const ps = `$OutputEncoding = [Text.UTF8Encoding]::new($false); @'\n ${text}\n'@ | node "${SCRIPT}" park --session ps-test --file "${file}"\n`;
    const script = path.join(d, 'run.ps1');
    fs.writeFileSync(script, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ps, 'utf8')]));
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8' });
    assert.ok(!r.stdout.includes(`INJECTED-${q.codePointAt(0)}\n`) && !/^INJECTED/m.test(r.stdout), `ran code for ${q.codePointAt(0)}: ${r.stdout}`);
    assert.match(fs.readFileSync(file, 'utf8'), new RegExp(`INJECTED-${q.codePointAt(0)}`), 'the text was parked as text');
  }
});
