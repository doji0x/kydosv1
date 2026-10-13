import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ts from 'typescript';
import { inspectCoverage } from '../scripts/typecheck-coverage.mjs';
import { RequestError, requestStatus, requestRetryAfter } from '../src/lib/requestError.js';

const root = resolve(import.meta.dirname, '..');
const configuration = JSON.parse(readFileSync(join(root, 'jsconfig.json'), 'utf8'));
const parsed = ts.parseJsonConfigFileContent(configuration, ts.sys, root);
function compile(source) {
  const directory = mkdtempSync(join(root, 'tests', '.type-contract-'));
  try {
    const path = join(directory, 'case.tsx');
    writeFileSync(path, source);
    const program = ts.createProgram([path], parsed.options);
    return ts.getPreEmitDiagnostics(program).map(d => ({ code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const imports = `import React from 'react';
import { InputOTP } from '@/components/ui/input-otp';
import { DialogContent } from '@/components/ui/dialog';
import { Toggle } from '@/components/ui/toggle';
import { Image } from '@/components/ui/image';
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar';
import { RequestError } from '@/lib/requestError';
`;

test('all maintained frontend source is included with no suppression comments', () => {
  const result = inspectCoverage();
  assert.ok(result.maintained >= 197);
  assert.equal(result.checked, result.maintained);
  assert.deepEqual(result.missing, []);
});
test('coverage guard rejects turning off JavaScript checking', () => {
  const directory = mkdtempSync(join(root, 'tests', '.type-contract-'));
  try {
    const path = join(directory, 'disabled.json');
    writeFileSync(path, JSON.stringify({ ...configuration,
      compilerOptions: { ...configuration.compilerOptions, checkJs: false } }));
    assert.throws(() => inspectCoverage(path), /checkJs/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('real component types accept native props, variants, refs and both OTP modes', () => {
  const errors = compile(imports + `
const img = React.createRef<HTMLImageElement>();
const children = <InputOTP maxLength={6}><span>OTP</span></InputOTP>;
const render = <InputOTP maxLength={6} render={({slots}) => <span>{slots.length}</span>} />;
const dialog = <DialogContent aria-label="Details"><Image ref={img} src="/a.png" alt="art" /></DialogContent>;
const toggle = <Toggle size="sm" variant="outline">Toggle</Toggle>;
const sidebar = <SidebarProvider defaultOpen={false}><Sidebar side="right" collapsible="icon" /></SidebarProvider>;
const failure = new RequestError('failed', {status: 429, retryAfter: 3});
`);
  assert.deepEqual(errors, []);
});
test('incorrect component and request contracts produce compiler errors', () => {
  const errors = compile(imports + `
const wrongImage = <Image src={123} />;
const wrongToggle = <Toggle size="gigantic" />;
const wrongOtp = <InputOTP maxLength="six" render={() => null} />;
const wrongError = new RequestError('failed', {status: '429'});
`);
  assert.equal(errors.length, 4, JSON.stringify(errors));
  assert.ok(errors.every(error => error.code === 2322));
});
test('typed request metadata is preserved without accepting foreign errors', () => {
  const error = new RequestError('Limited', { status: 429, retryAfter: 5 });
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'Limited');
  assert.equal(requestStatus(error), 429);
  assert.equal(requestRetryAfter(error), 5);
  assert.equal(requestStatus(new Error('other')), undefined);
  assert.equal(requestStatus({status: 429}), undefined);
  assert.equal(requestRetryAfter(null), undefined);
});
