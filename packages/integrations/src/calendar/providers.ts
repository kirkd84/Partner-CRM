/**
 * Calendar provider registry — one row per external calendar system we
 * plan to support. The `configured` flag is driven entirely by env-var
 * presence, so the UI never shows a broken connect button.
 *
 * Adding a new provider: add to PROVIDERS, map its creds into the
 * configured check, wire its sync worker in packages/integrations once
 * the adapter is ready.
 */
export type CalendarProviderId = 'google' | 'microsoft' | 'apple';

export interface CalendarProviderInfo {
  id: CalendarProviderId;
  label: string;
  description: string;
  /** Whether the provider's tenant-wide credentials are set in env. */
  configured: boolean;
  /** Per-user flow: true means each rep enters their own credentials. */
  perUserOnly?: boolean;
  /** Human hint to show when the provider is NOT configured. */
  unconfiguredHint: string;
}

export function listCalendarProviders(): CalendarProviderInfo[] {
  return [
    {
      id: 'google',
      label: 'Google Calendar',
      description:
        'Pull in your events from any Google Calendar you use — personal, work, shared team calendars, all optional.',
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      unconfiguredHint: 'Your admin needs to turn this on before you can connect.',
    },
    {
      id: 'microsoft',
      label: 'Microsoft 365',
      description:
        'Works with Outlook.com and any work Microsoft 365 calendar. Same idea as Google — pick which calendars sync.',
      configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
      unconfiguredHint: 'Your admin needs to turn this on before you can connect.',
    },
    {
      id: 'apple',
      label: 'Apple iCloud',
      description:
        'Use your Apple ID with an app-specific password. You set it up right here — no admin needed.',
      configured: true,
      perUserOnly: true,
      unconfiguredHint:
        'Generate an app-specific password at appleid.apple.com → "Sign-In and Security" → then paste it here.',
    },
  ];
}
