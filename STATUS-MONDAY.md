# Status — Monday morning, 2026-04-27

Kirk — here's where things landed Friday night → Saturday. Read top to bottom; the "Try this first" section gives you the 5-minute walkthrough.

## Try this first (5 min)

Once Railway finishes deploying `d27ff7d`:

1. **Open `/map`**, click **Lasso a territory**, draw a polygon around a few blocks.
2. In the right-rail "Find new leads" section, leave Realtors + Insurance ticked, hit **Find new leads in this lasso**. Watch the Google Places quota tick.
3. Walk over to **`/admin/scraped-leads`** — the new businesses should be sitting there, deduped against anything already in the system.
4. Walk over to **`/admin/state-boards`**. Pick a market, pick "Texas realty (TREC)", and try uploading a CSV from the public download link shown under the picker. We'll know immediately whether the column mappings match TREC's current export — if rows get rejected, see "If state board imports return 0 leads" below.
5. Open any approved design under **`/studio`**. Hit the **PDF** button (or the chevron next to it for layout choices). Confirm Letter / Business cards / Native sizes all download cleanly.

## What shipped this weekend

| Commit    | What                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `e61e3c6` | Lasso → Google Places scrape: pick partner types, polygon ray-cast, results land in `/admin/scraped-leads`                                      |
| `4d75099` | State board CSV adapters for CO/TX/FL realty + insurance + `/admin/state-boards` upload UI                                                      |
| `8118437` | Print PDF export for `/studio` designs (Letter / 10-up business cards / native size)                                                            |
| `d27ff7d` | In-process scrape scheduler — promotes a job's `cadence` from `manual` to `daily`/`weekly`/`hourly` and the server runs them on a 5-minute poll |

## Things to do (in order of payoff)

### 1. Add Roof Tech credentials when convenient

These are ALL graceful — every feature works without keys. Adding them just unlocks the LLM-powered upgrades:

- `ANTHROPIC_API_KEY` → real LLM director picks templates from intent (vs rules), AI draft drawer composes outreach copy, intent extractor parses messy prompts more accurately.
- `FAL_KEY` → fal.ai image generation in the marketing wizard so designs can include a custom photo background instead of solid color blocks.
- `INNGEST_EVENT_KEY` → automatic yield from the in-process scheduler to Inngest cron (cleaner for multi-dyno scaling).
- `RESEND_API_KEY` / Twilio credentials → outbound cadence sending actually fires (today it logs "would send" and stops).
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` → push notifications for events/cadences.

### 2. Try the state board imports

The column mappings are educated guesses based on each board's published schema as of last quarter. If Texas/Colorado/Florida changed their CSV headers since, rows will silently get skipped. Two ways to debug:

- Watch the upload result toast — if `total: 0`, the column mappings missed.
- Crack the CSV in Excel and check what the first-row headers actually are. Then edit `packages/integrations/src/ingest/state-boards.ts` — add the new column name to the relevant `columns.<field>` array (they're aliases — multiple names supported per field).

### 3. Promote a scrape job to daily

Once you have a state board CSV imported, the job sits in `/admin/scrape-jobs` with `cadence: manual`. The new `updateScrapeJobCadence` server action exists (lib is in place) but the cadence-edit UI in the scrape jobs admin isn't wired yet — quickest manual path:

- SSH into Railway and run a one-liner: `await prisma.scrapeJob.update({ where: { id: '...' }, data: { cadence: 'daily' } })`
- Or wait for me to add a cadence dropdown to the scrape-jobs row (~10 min of work next session).

For a state board CSV that lives at a stable `/tmp` path, "daily" doesn't help much — the data only changes monthly. Set state-board jobs to `weekly` or leave as `manual`. Daily is most useful for the Google Places jobs (those re-scan a fresh area).

## What's still on the runway (not blocked on creds)

- ~25 more marketing templates (16 ship today; diminishing returns past ~12 unless you spot specific gaps in real use).
- Cadence-edit dropdown in `/admin/scrape-jobs` UI (server action exists, just needs the chip).
- Crop marks on the print PDF for commercial printers (currently no marks — fine for paper trimmers, less ideal for outsourced print).
- An `/admin/state-boards` history view that lets you re-upload a fresh monthly CSV and shows a delta (X new leads vs last import).

## What's blocked on credentials you own

| Feature                                             | Needs                                    | Works without it?                                           |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| LLM director, intent, draft drawer, refinement chat | `ANTHROPIC_API_KEY`                      | Yes — rules-based fallbacks                                 |
| AI image generation in marketing wizard             | `FAL_KEY`                                | Yes — solid color backgrounds                               |
| Production cron scheduling                          | `INNGEST_EVENT_KEY`                      | Yes — in-process scheduler picked up the slack this weekend |
| Push notifications                                  | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | No — silently disabled                                      |
| Outbound email/SMS (cadences, expense receipts)     | `RESEND_API_KEY` / Twilio                | No — logs but doesn't send                                  |
| OAuth sign-in (Google / Azure / Apple)              | Provider client IDs + secrets            | No — credentials sign-in works                              |
| Asset storage (image uploads, PDFs cached)          | R2 bucket + `R2_*` vars                  | Yes — base64 inline + on-demand re-render                   |

## Known sharp edges

- **`/tmp` is ephemeral on Railway.** State board CSVs live at `/tmp/state-boards/<file>` for the life of the dyno. After a redeploy the file's gone — re-uploading is a no-op except it re-saves the CSV; the existing ScrapeJob row keeps its history. The "Run now" button on a STATE_REALTY/STATE_INSURANCE job will throw "CSV missing" if you haven't re-uploaded since the last redeploy. R2 fixes this; until then, one upload per Railway deploy.
- **Multi-dyno warning.** The in-process scheduler is single-dyno only. If you ever scale Railway >1 instance, two dynos will both try to run a job at the same poll. Mostly harmless (runIngest dedups) but wastes Google Places quota. Wire Inngest before scaling out.
- **Lasso scrape costs Google quota.** A typical lasso with Realtors + Insurance ticked fires 2 Places API calls × up to 3 pages = 6 requests, ~$0.20 retail. Not a problem at lasso-here-and-there volume, but if a rep starts spamming the button, it'll add up fast. Consider a cooldown or a per-day cap if you see it happening.
- **PDF generation is synchronous.** First PDF render after a deploy takes 3-5 seconds (Satori spins up + native binary loads). Subsequent renders are fast. Not user-facing-broken but feels sluggish on cold start.

## Conversation continuity

I can't actually keep working between our sessions — when you close Cowork, this conversation pauses. So I built as much as I could into this single session: 4 commits, ~4500 lines added/changed, all pushed to `main`. Everything past this doc waits until Monday.

When you're back, paste any of these to keep going:

- "Add the cadence dropdown to /admin/scrape-jobs rows."
- "I uploaded a TX realty CSV and 0 leads came through. Here's the first 3 lines: ..." (then I can tweak column mappings)
- "Build the next batch of marketing templates."
- "Wire fal.ai image gen into the studio."

Have a good weekend.
