/**
 * Shared Inngest client — imported by every job definition AND by
 * server actions that need to `send()` events. Isolated in its own
 * module so job files can import the client without dragging the
 * whole registry along with them (which would be a circular import).
 */
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'partner-portal',
  name: 'Partner Portal',
});
