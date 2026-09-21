import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { selectNextRunnable } from '../../shared/astraOrchestration.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const jobId = String(input.jobId || '').trim();
    if (!jobId) return Response.json({ error: 'Job id is required.' }, { status: 400 });

    const service = base44.asServiceRole;
    const job = await service.entities.AstraJob.get(jobId).catch(() => null);
    if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
    if (!['queued', 'running', 'blocked'].includes(job.status)) {
      return Response.json({ error: `A ${job.status || 'finished'} job cannot be cancelled.` }, { status: 409 });
    }

    const cancelledAt = new Date().toISOString();
    await service.entities.AstraJob.update(job.id, {
      status: 'cancelled',
      cancelledAt,
      heartbeatAt: cancelledAt,
      currentStepLabel: job.status === 'running' ? 'Stop requested' : 'Cancelled',
      blocker: 'Cancelled manually by an administrator.',
      nextStep: 'No unfinished step.'
    });

    if (job.status !== 'blocked') {
      const executors = await service.entities.AstraJob.filter({ status: { $in: ['queued', 'running'] } }, 'created_date', 10);
      if (!executors.length) {
        const blocked = await service.entities.AstraJob.filter({ status: 'blocked' }, 'created_date', 100);
        const next = selectNextRunnable(blocked);
        if (next) await service.entities.AstraJob.update(next.id, { status: 'queued', queuedAt: cancelledAt, blocker: '', nextStep: 'Execution is ready to begin.' });
      }
    }

    return Response.json({ ok: true, jobId: job.id, status: 'cancelled' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}