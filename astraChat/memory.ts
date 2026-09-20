// memory logic (snippet), add audit logging on events
import { logAuditEvent } from '../_shared/astraAudit';

// ... other imports & state ...

async function onToolRun({ toolName, args, result, sessionId, userId, origin }: any) {
  try {
    await logAuditEvent({
      eventType: 'tool_run',
      tool: toolName,
      detail: { args, result },
      sourceId: sessionId,
      actorId: userId,
      origin
    });
  } catch {}
}

async function onMessage({ role, content, sessionId, msgId, userId, origin }: any) {
  try {
    await logAuditEvent({
      eventType: 'message',
      detail: { role, content },
      sourceId: msgId ?? sessionId,
      actorId: userId,
      origin
    });
  } catch {}
}

async function onMemoryError({ error, context, sessionId, userId, origin }: any) {
  try {
    await logAuditEvent({
      eventType: 'error',
      error: error?.message || String(error),
      detail: context,
      sourceId: sessionId,
      actorId: userId,
      origin
    });
  } catch {}
}

// Example: intercept/additive hooks in memory event flow

export async function processToolRun(toolName: string, args: any, sessionId: string, userId: string, origin?: string) {
  // (regular in-memory logic)
  let result: any;
  try {
    result = await runTool(toolName, args); // app logic stub
    await onToolRun({ toolName, args, result, sessionId, userId, origin });
  } catch (error) {
    await onMemoryError({ error, context: { toolName, args }, sessionId, userId, origin });
    throw error;
  }
  return result;
}

export async function processMessage(role: string, content: string, sessionId: string, msgId: string, userId: string, origin?: string) {
  // (session/memory logic as before...)
  await onMessage({ role, content, sessionId, msgId, userId, origin });
  // ... continue existing logic
}

// ...rest of memory/session module remains session-only, no other persistence unless needed
