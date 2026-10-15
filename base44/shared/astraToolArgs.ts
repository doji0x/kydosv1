/** Parsed tool fields, not authorization. Repository/branch policy is enforced
 * by the caller. Write preconditions are trusted session state, never model input.
 */
export interface AstraToolArgs {
  repo?: string; branch?: string; path?: string; content?: string; message?: string;
  sourceBranch?: string; base?: string; query?: string; id?: string; url?: string;
  expectedHash?: string; severity?: string; finding?: string; proposedFix?: string;
  conversationId?: string; filePaths?: string[];
  offset?: number; limit?: number; runId?: number;
}
const strings = new Set(['repo', 'branch', 'path', 'content', 'message', 'sourceBranch',
  'base', 'query', 'id', 'url', 'expectedHash', 'severity', 'finding', 'proposedFix', 'conversationId']);
const integers = new Set(['offset', 'limit', 'runId']);
export function parseToolArgs(input: unknown): AstraToolArgs {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('Tool arguments must be a plain object.');
  }
  const result: Record<string, string | number | string[]> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!strings.has(key) && !integers.has(key) && key !== 'filePaths') throw new Error(`Unsupported tool argument: ${key}`);
    // Strict model schemas represent omitted optional fields as null.
    if (value === null || value === undefined) continue;
    if (strings.has(key)) {
      if (typeof value !== 'string') throw new Error(`Tool argument ${key} must be a string.`);
      result[key] = value;
    } else if (integers.has(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`Tool argument ${key} must be a nonnegative safe integer.`);
      result[key] = value;
    } else {
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Tool filePaths must be an array of strings.');
      result[key] = [...value];
    }
  }
  // Every admitted key and value type has been validated above.
  return result as AstraToolArgs;
}
