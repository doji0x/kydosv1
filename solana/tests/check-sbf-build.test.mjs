import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeStackDiagnostics } from '../scripts/check-sbf-build.mjs';

test('rejects the stack overwrite diagnostic even with a successful-build trailer', () => {
  assert.throws(() => assertSafeStackDiagnostics('Error: A function call in method migrate overwrites values in the frame.\nFinished release profile'), /Unsafe SBF/);
});
test('rejects oversized stack offsets and frames', () => {
  for (const log of ['Stack offset of 5000 exceeded max offset of 4096', 'Error: stack frame too large']) {
    assert.throws(() => assertSafeStackDiagnostics(log), /Unsafe SBF/);
  }
});
test('does not confuse ordinary deprecation warnings with stack failures', () => {
  assert.doesNotThrow(() => assertSafeStackDiagnostics('warning: deprecated method\nFinished release profile'));
  assert.throws(() => assertSafeStackDiagnostics(null), TypeError);
});
test('CLI exits unsuccessfully when a compiler log contains unsafe stack diagnostics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kydos-build-log-'));
  try {
    const log = join(dir, 'build.log');
    writeFileSync(log, 'Error: A function call overwrites values in the frame.\nFinished release profile');
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-sbf-build.mjs', import.meta.url)), log], {encoding:'utf8'});
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Unsafe SBF stack/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
