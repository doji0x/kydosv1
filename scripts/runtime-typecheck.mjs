/** Enumerate maintained runtime/tooling source and check it without executing it.
 * No signing keys, deployed services or network RPC are needed. Deno downloads
 * only integrity-locked dependencies unless --cached-only is requested.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', '.git', 'dist', 'target']);
/** @param {string} directory @returns {string[]} */
function walk(directory, base = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${path}`);
    return entry.isDirectory() ? walk(path, base) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [relative(base, path)] : [];
  });
}
export function sourceInventory(base = root) {
  const groups = { frontend: [], backend: [], tooling: [], dbc: [], tests: [], historical: [] };
  const manifest = JSON.parse(readFileSync(join(base, 'typechecks/historical.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1, 'Unknown source inventory version');
  const historical = { ...manifest.files }, all = walk(base, base).sort();
  for (const archive of manifest.archives) {
    assert.equal(archive.directory, 'archive', 'Only the preexisting EVM archive may be classified as an archive');
    const entries = all.filter(path => path.startsWith(archive.directory + '/')).map(path =>
      [path, createHash('sha256').update(readFileSync(join(base, path))).digest('hex')]);
    assert.equal(entries.length, archive.sourceCount, 'Archived source inventory changed');
    assert.equal(createHash('sha256').update(JSON.stringify(entries)).digest('hex'), archive.sourceHash, 'Archived source bytes changed');
    for (const [path, sha256] of entries) historical[path] = { sha256, reason: archive.reason };
  }
  for (const path of all) {
    if (path.startsWith('src/')) groups.frontend.push(path);
    else if (/^base44\/(functions|shared)\//.test(path)) groups.backend.push(path);
    else if (path.startsWith('scripts/') || path.startsWith('solana/scripts/') || /^[^/]+\.config\.[cm]?[jt]s$/.test(path)) groups.tooling.push(path);
    else if (/^solana\/dbc\/[^/]+\.(mjs|ts)$/.test(path) && !path.endsWith('.test.mjs')) groups.dbc.push(path);
    else if (path.startsWith('tests/') || path.startsWith('solana/tests/') || path.endsWith('.test.mjs') || path.startsWith('typechecks/')) groups.tests.push(path);
    else if (Object.hasOwn(historical, path)) {
      const hash = createHash('sha256').update(readFileSync(join(base, path))).digest('hex');
      assert.equal(hash, historical[path].sha256, `Historical source changed: ${path}; classify/review it before proceeding`);
      groups.historical.push(path);
    } else throw new Error(`Source is not assigned to a runtime: ${path}`);
  }
  assert.deepEqual(groups.historical.sort(), Object.keys(historical).sort(), 'Historical inventory changed');
  // Do not silently start using excluded draft snippets in maintained modules.
  for (const path of [...groups.frontend, ...groups.backend, ...groups.tooling, ...groups.dbc]) {
    const text = readFileSync(join(base, path), 'utf8');
    assert.ok(!/@ts-(?:nocheck|ignore|expect-error)\b/.test(text), `Suppressed runtime source: ${path}`);
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    /** @param {ts.Node} node */
    function visit(node) {
      const value = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : '';
      if (value.startsWith('.')) {
        const target = relative(base, resolve(base, dirname(path), value));
        for (const old of groups.historical) assert.ok(old !== target && old.replace(/\.[jt]s$/, '') !== target, `Active source imports historical snippet: ${path} -> ${old}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return groups;
}
/** @param {string} configName */
export function compilerConfig(configName, base = root) {
  const path = join(base, configName), config = ts.readConfigFile(path, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(path));
  if (parsed.errors.length) throw new Error(parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  assert.equal(parsed.options.checkJs, true); assert.equal(parsed.options.noEmit, true); assert.equal(parsed.options.allowJs, true);
  return parsed;
}
export function controllerAccountDeclaration() {
  const idl = JSON.parse(readFileSync(join(root, 'src/lib/solana/idl/kydos_launchpad.json'), 'utf8'));
  const accounts = idl.accounts.filter(a => a.name === 'dbcLaunch'), types = idl.types.filter(a => a.name === 'dbcLaunch');
  assert.equal(accounts.length, 1); assert.equal(types.length, 1);
  return '// Generated account-only view of the canonical browser IDL; never a second ABI.\n' +
    '// Verified by scripts/runtime-typecheck.mjs; regenerate from that IDL on changes.\n' +
    "import type { IdlInstruction, IdlMetadata } from '@coral-xyz/anchor';\n" +
    'export type ControllerAccountIdl = {\n  address: string;\n  metadata: IdlMetadata;\n  instructions: IdlInstruction[];\n} & ' + JSON.stringify({ accounts, types }, null, 2) + ';\n';
}
export function checkRuntimeCoverage() {
  const inventory = sourceInventory();
  for (const [name, config] of [['tooling', 'typechecks/node.json'], ['dbc', 'typechecks/dbc.json']]) {
    const parsed = compilerConfig(config), program = ts.createProgram(parsed.fileNames, parsed.options);
    const included = new Set(program.getSourceFiles().map(file => relative(root, resolve(file.fileName))));
    for (const file of inventory[name]) assert.ok(included.has(file), `${config} does not check ${file}`);
  }
  const deno = JSON.parse(readFileSync(join(root, 'typechecks/deno.json'), 'utf8'));
  assert.equal(deno.compilerOptions.checkJs, true);
  assert.equal(deno.lock.frozen, true);
  assert.equal(deno.lock.path, './deno.lock');
  assert.equal(deno.nodeModulesDir, 'none');
  assert.ok(!deno.exclude?.length, 'Do not exclude deployed backend source');
  assert.ok(existsSync(join(root, 'typechecks/deno.lock')), 'Missing runtime dependency lock');
  assert.equal(readFileSync(join(root, 'solana/dbc/controller-account.d.ts'), 'utf8'), controllerAccountDeclaration(), 'Typed controller account view does not match canonical IDL');
  return inventory;
}
/** @param {string} executable @param {string[]} args */
function execute(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', env: { ...process.env, DENO_NO_PACKAGE_JSON: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Typecheck process failed: ${executable} (exit ${result.status ?? result.signal})`);
}
export function runRuntimeCheck(mode, cached = false) {
  const inventory = checkRuntimeCoverage();
  if (mode === 'coverage') return inventory;
  if (mode === 'backend') execute(process.env.DENO_BINARY || 'deno', ['check', '--config', 'typechecks/deno.json', '--frozen-lockfile', ...(cached ? ['--cached-only'] : []), ...inventory.backend]);
  else if (mode === 'tooling') {
    for (const file of ['typechecks/node.json', 'typechecks/dbc.json']) execute(process.execPath, ['node_modules/typescript/bin/tsc', '-p', file]);
  } else throw new Error('Choose backend, tooling or coverage');
  return inventory;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, option, ...extra] = process.argv.slice(2);
  assert.ok(!extra.length && (!option || option === '--cached-only'), 'Unsupported checker arguments');
  const groups = runRuntimeCheck(mode, option === '--cached-only');
  console.log(JSON.stringify({ mode, files: Object.fromEntries(Object.entries(groups).map(([name, files]) => [name, files.length])) }, null, 2));
}
