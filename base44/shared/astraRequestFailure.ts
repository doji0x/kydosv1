import { beforeDeadline } from './astraDeadline.ts';
import { safeAstraError } from './astraOpenAi.ts';

export async function persistRequestFailure(base44, user, error, alreadyLogged = false) {
  const message = safeAstraError(error);
  // Independent writes: a logging failure must never prevent the status update.
  const save = async (label, operation) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await beforeDeadline(operation, Date.now() + 4000, `${label} timed out.`); return; }
      catch (failure) { console.error(label, safeAstraError(failure)); }
    }
  };
  await Promise.all([
    save('Astra failure status', () => base44.entities.AstraMessage.update(user.id, { status: 'failed' })),
    alreadyLogged ? Promise.resolve() : save('Astra failure activity', () => base44.entities.AstraMessage.create({
      conversationId: user.conversationId, requestId: user.requestId, turn: user.turn,
      role: 'activity', activityType: 'tool', toolName: 'request', status: 'failed',
      content: message, summary: message, repo: user.repo || 'doji0x/kydosv1'
    }))
  ]);
  return message;
}