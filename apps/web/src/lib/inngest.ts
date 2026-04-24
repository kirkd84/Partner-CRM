/**
 * Inngest function registry for Partner Portal.
 *
 * This barrel lists every function Inngest is allowed to run. The
 * /api/inngest route hands this array to the `serve()` adapter, which
 * is how Inngest discovers what it can invoke on our server.
 *
 * New functions live under `src/lib/jobs/` and get added to the
 * `functions` array below. Keep this file small — business logic
 * belongs in each job file, not here.
 */
export { inngest } from './inngest-client';
import { ping } from './jobs/ping';
import { googleCalendarSyncOnConnect, googleCalendarSyncCron } from './jobs/google-calendar-sync';
import { stormRevenueSyncCron, stormRevenueSyncOnDemand } from './jobs/storm-revenue-sync';

export const functions = [
  ping,
  googleCalendarSyncOnConnect,
  googleCalendarSyncCron,
  stormRevenueSyncCron,
  stormRevenueSyncOnDemand,
];
