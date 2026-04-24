/**
 * A trivial "hello" job that does nothing but prove the wiring works.
 * Trigger it from the Inngest dashboard (Functions → ping → Invoke)
 * and watch the Railway deploy logs — the console.log should fire,
 * confirming Inngest can reach our /api/inngest endpoint and execute
 * jobs here. Keep this function around as a free smoke test.
 */
import { inngest } from '../inngest-client';

export const ping = inngest.createFunction(
  { id: 'ping', name: 'Ping — smoke test' },
  { event: 'partner-portal/ping' },
  async ({ event, step }) => {
    await step.run('log', async () => {
      console.log('[inngest:ping] received event', {
        name: event.name,
        data: event.data,
        ts: event.ts,
      });
      return { ok: true, receivedAt: new Date().toISOString() };
    });
    return { pong: true };
  },
);
