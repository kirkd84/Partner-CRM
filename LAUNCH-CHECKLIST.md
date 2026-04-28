# Pre-launch checklist

The single doc to walk through before inviting your first real rep team. Every item is a decision or a task with a clear owner. The in-app `/admin/launch-checklist` covers env vars + data sanity; this file covers everything else.

> If you can answer "yes" or "N/A" to every item, you're ready. If anything is "no" or "unknown", that's the work.

## 1. Operational basics

- [ ] **Production domain pointing at Railway.** Custom domain configured in Railway → Settings → Networking. SSL cert auto-issued.
- [ ] **`/api/health` hooked up to an uptime monitor.** Better Uptime, Cronitor, or even UptimeRobot (free tier) pinging every 1-5 minutes. Without this you'll only know prod is down when a rep tells you.
- [ ] **Postgres backup _tested_ — not just configured.** Railway takes daily snapshots; have you actually restored one to a staging service? The first time you restore should not be during an outage. Run through it once on a copy.
- [ ] **`/api/cron/scrape-tick` wired to a cron.** Railway → Cron Schedules, or cron-job.org, hitting POST every 5m with the `x-cron-secret` header. Without this, scheduled scrape jobs never auto-run.
- [ ] **Manual smoke test on prod by a human.** Log in. Draw a lasso. Approve a scraped lead. Create a hit list. Open the run view on a phone. Open `/studio`, generate a design, download the PDF. If anything throws, fix before launching.

## 2. Email + SMS deliverability

These are the longest-lead-time launch items. Start them before you set a launch date.

- [ ] **Sender domain verified at Resend.** SPF, DKIM, DMARC records on the sending domain (e.g. `rooftechnologies.com` or a `mail.rooftechnologies.com` subdomain). Without DKIM your emails land in spam at Gmail.
- [ ] **A2P 10DLC registration via Twilio.** US carriers require this for B2B SMS. **2-4 week timeline**, includes a brand registration + campaign approval. Until done, your SMS cadence steps will silently fail or get blocked. If SMS isn't critical for v1, defer this; if it is, start _now_.
- [ ] **`From:` address matches a real mailbox.** A bounce or reply needs to go somewhere a human reads. CAN-SPAM technically requires this for any opt-out reply.
- [ ] **Test send to Gmail + Outlook + Yahoo.** Inbox, not spam. If you're in the spam folder, fix before going live.
- [ ] **Unsubscribe link works.** Open `/api/unsubscribe?token=…` in an incognito window — confirm it 1-click unsubscribes without making the user log in.

## 3. Legal + compliance

- [ ] **Terms of Service published.** Stub at `/legal/terms` — replace placeholder with content from a lawyer or a generator (termly.io / iubenda).
- [ ] **Privacy Policy published.** Stub at `/legal/privacy` — same. Required for any service collecting contact info, and required by Apple/Google if you ever ship a mobile app.
- [ ] **Cookie banner.** Required in EU; not strictly required in US, but expected. Skip if 100% US-only and willing to take the risk.
- [ ] **CAN-SPAM compliance** — already in place for emails: physical address in footer (Wheat Ridge, CO), `From:` identifies your business, unsubscribe link present, honors opt-out within 10 business days.
- [ ] **TCPA / SMS consent.** `Partner.smsConsent` field exists in the schema, but is the consent flow actually presented to a partner before SMS sends? Verify the cadence dispatcher checks consent before each send.
- [ ] **CCPA mostly N/A** — you're B2B with business contact info. If a partner is a sole proprietor using a personal phone, gray area.
- [ ] **Trademark check on "PartnerRadar"** before you put it on a flyer. USPTO TESS search is free.

## 4. Data migration

- [ ] **Existing partner book imported.** Use `/admin/state-boards` for state-licensed targets, or the new `/admin/partners/import` for a CSV from your prior CRM / spreadsheet (mirror of the state-board flow).
- [ ] **Demo data wiped or marked.** The 50 seeded partners from `/admin/markets` → "Seed demo" will coexist with real partners. Either delete them, or accept that real reports include them.
- [ ] **Storm Cloud integration tested with real creds.** Today: `STORM_API_MODE=mock`. Before launch, flip to `real`, set the API key, activate one test partner, verify the round-trip.
- [ ] **Audit log retention policy.** Right now AuditLog grows forever. Decide: keep forever (storage cost slow) or prune older than N months (cron job).

## 5. User onboarding

- [ ] **First-run rep experience.** When a brand-new rep with zero partners logs in, what do they see? Empty-state cards should say "Here's how to start" not just blank pages.
- [ ] **Rep training material.** Even a 1-page PDF: "here's how to log a drop-by, here's how to use a hit list, here's how to invite a partner to an event."
- [ ] **Manager training material.** Slightly different: how to assign reps to markets, how to read a reliability score, how to run a state-board import.
- [ ] **Support escalation path.** Where does a rep email when they hit a bug? Slack? `support@rooftechnologies.com`? Document it inside the app footer.

## 6. Reliability + observability

- [ ] **Sentry / error tracking wired.** Not blocking launch but you'll wish it was day-2. Without it, errors only surface in Railway logs.
- [ ] **Railway dyno scale = 1.** The in-process scrape scheduler + rate limiter assume single dyno. Don't scale to >1 instance until Inngest is wired and the rate limiter is on Upstash. Otherwise you'll get duplicate scheduled runs and rate-limit under-counting.
- [ ] **Database connection pool sized.** Default Prisma pool size is `num_cpus * 2 + 1`. Railway dyno has fewer connections allocated than you'd think; verify under load.
- [ ] **Disaster recovery runbook.** When prod is down at 7pm on a Thursday, what's the first thing you check? Document. Hint: `/api/health`, then Railway logs, then `git log` for "what changed in the last hour."

## 7. Security (post first audit)

Already covered by `SECURITY.md` — these are the residuals to revisit:

- [ ] **Rotate any password or token in a screenshot you've shared while testing.** Demo `Demo1234!` is fine in dev, change it before any real user gets a login.
- [ ] **`NEXTAUTH_SECRET` rotated from any value used in dev.** If the dev secret ever leaked, prod sessions are minted by it. Generate fresh: `openssl rand -base64 32`.
- [ ] **`CRON_SECRET` set on Railway and on whatever cron service hits the endpoint.** 503 if missing.
- [ ] **2FA on the GitHub repo + Railway account.** A compromised Railway account is a compromised database.
- [ ] **`pnpm audit` clean.** Run before launch + at every dependency bump.

## 8. Business + go-to-market

Less my domain but worth a mention:

- [ ] **Pricing model documented** if PartnerRadar is going to be sold as a Storm Cloud add-on later (per `SPEC.md`).
- [ ] **Internal vs. external SLA.** Is `/api/health` flipping red a "wake Kirk up" event or a "fix in the morning" event? Decide before it happens.
- [ ] **Customer-comms template** for outages. "We're investigating an issue affecting the partner map" — pre-written so you don't write it under stress.

## 9. Day-1 launch sequence (suggested order)

1. **T-7 days:** finish A2P 10DLC, finish Resend domain verification, finish ToS/Privacy.
2. **T-3 days:** test full backup → restore on a staging service.
3. **T-2 days:** import existing partner book; wipe demo data.
4. **T-1 day:** human smoke test on prod. Walk through every major flow. Fix anything that throws.
5. **T-0 morning:** flip Storm Cloud to `real`. Verify one round-trip activation.
6. **T-0 afternoon:** invite first rep. Watch their session. Note what they trip on.
7. **T+1 morning:** check `/admin/audit-log` and Railway logs. Anything unusual gets fixed before T+2.

## 10. Things you can ignore until later

- Mobile app (Expo). Web PWA install on iOS / Android works fine for v1.
- Multi-tenant white-label of PartnerRadar to other companies. Single-file swap in `packages/config/tenant.ts`; do it when there's a buyer.
- Inngest. The in-process scheduler + `/api/cron/scrape-tick` cover cron until you scale beyond one dyno.
- fal.ai image gen. Solid color blocks in marketing wizard look fine; AI images are an upgrade not a launch requirement.
- Push notifications. Email + SMS cover the same ground; VAPID is optional v2 polish.
