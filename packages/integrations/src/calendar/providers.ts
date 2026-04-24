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
      description: 'Two-way sync with any Google calendar the rep has access to.',
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      unconfiguredHint:
        'Admin: set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Railway. Scope: calendar.readonly.',
    },
    {
      id: 'microsoft',
      label: 'Microsoft 365',
      description:
        'Works with Outlook.com, Microsoft 365 Business, and any Azure-AD organisation calendar.',
      configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
      unconfiguredHint:
        'Admin: register a multi-tenant app in Azure AD. Scopes: Calendars.Read + offline_access.',
    },
    {
      id: 'apple',
      label: 'Apple iCloud',
      description:
        'Per-rep CalDAV connection using an Apple ID + app-specific password. No tenant cred required.',
      configured: true, // no tenant cred to check — but still gated per user
      perUserOnly: true,
      unconfiguredHint:
        'Per-rep flow. Each rep generates an app-specific password at appleid.apple.com and pastes it in /settings.',
    },
  ];
}
