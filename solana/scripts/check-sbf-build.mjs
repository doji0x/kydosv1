// The pinned SBF compiler can exit zero after reporting unsafe stack use.
// A produced ELF is therefore not sufficient evidence of a valid build.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertSafeStackDiagnostics(log) {
  if (typeof log !== 'string') throw new TypeError('Compiler log must be text');
  const unsafe = log.split(/\r?\n/).filter(line =>
    /Stack offset.*exceed|overwrites values in the frame|stack frame.*(?:exceed|too large)/i.test(line));
  if (unsafe.length) throw new Error(`Unsafe SBF stack diagnostics:\n${unsafe.join('\n')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node check-sbf-build.mjs <compiler-log>');
  assertSafeStackDiagnostics(readFileSync(process.argv[2], 'utf8'));
  console.log('SBF compiler log has no unsafe stack diagnostics. Runtime tests are still required.');
}
