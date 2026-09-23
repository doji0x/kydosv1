import { compactForModel } from '../../shared/astraLimits.ts';
export function nextTurn(rows) { return Math.max(0, ...rows.map(x => Number(x.turn) || 0)) + 1; }
export function buildHistory(rows) {
  const budget = { remaining: 26000 };
  return rows.filter(x => x.role !== 'activity').slice().reverse().map(x => {
    const value = x.role === 'user' ? `[#${x.turn}] ${x.content}` : x.content;
    return { role: x.role === 'system' ? 'developer' : x.role, content: compactForModel(value, `astra-message:${x.id}`, 60000, budget).content };
  }).filter(x => x.content).reverse();
}
export function buildActivityDigest(rows) { const text = rows.filter(x => x.role === 'activity').map(x => `- ${x.content}${x.detail ? ` (${x.detail})` : ''}`).join('\n'); return text ? `Earlier activity:\n${text.slice(-4000)}` : ''; }
export function summarizeToolArgs(args) { const { content, ...rest } = args || {}; return Object.entries(rest).map(([k,v]) => `${k}=${v}`).concat(typeof content === 'string' ? [`content=${content.length} chars`] : []).join(', '); }
export function summarizeToolResult(result) { if (result?.error) return `error: ${result.error}`; if (result?.content) return `${result.content.length} chars`; if (result?.files) return `${result.files.length} files`; return JSON.stringify(result).slice(0, 180); }