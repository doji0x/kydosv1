/** Ensure active frontend files are checked; never run application code. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsupported source symlink: ${path}`);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}
export function inspectCoverage(configPath = resolve(root, 'jsconfig.json')) {
  const configuration = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configuration.error) throw new Error(ts.flattenDiagnosticMessageText(configuration.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(configuration.config, ts.sys, root);
  if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  if (parsed.options.checkJs !== true || parsed.options.allowJs !== true || parsed.options.noEmit !== true) {
    throw new Error('Frontend checks require checkJs, allowJs and noEmit');
  }
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checked = new Set(program.getSourceFiles().map(file => resolve(file.fileName)));
  const maintained = sourceFiles(resolve(root, 'src'));
  const missing = maintained.filter(file => !checked.has(file)).map(file => relative(root, file));
  const suppressed = maintained.filter(file => /@ts-(?:nocheck|ignore|expect-error)\b/.test(readFileSync(file, 'utf8')))
    .map(file => relative(root, file));
  if (missing.length || suppressed.length) throw new Error(JSON.stringify({ missing, suppressed }, null, 2));
  return { scope: 'frontend', maintained: maintained.length, checked: maintained.length, missing, suppressed };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(inspectCoverage(), null, 2));
}
