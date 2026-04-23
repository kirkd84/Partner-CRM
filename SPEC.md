# PartnerRadar — Product & Engineering Specification

**Version**: 1.0
**Status**: Authoritative — this document is the source of truth for the build. If code and SPEC.md disagree, SPEC.md wins unless explicitly amended.
**Audience**: Cowork (Claude), sub-agents, any human engineer who joins later.

---

## 0. Product summary

**PartnerRadar** is an internal CRM for the **prospecting** phase of referral-partner acquisition at a roofing/restoration company. The company already uses **Storm Cloud** (app.storm.cloud) to manage active customer projects and its list of already-activated referral partners. Storm Cloud has no prospecting tool. PartnerRadar fills that gap.

**Who uses it**: Sales reps, sales managers, and admins at the company. Reps spend their days driving between potential referral partners — realtors, property managers, insurance agents, non-competing contractors — building relationships that eventually send inbound leads.

**What it does**: Finds candidates (AI-assisted web scraping), manages the pipeline (from first contact to signed partnership), lets reps log notes / calls / SMS / emails / visits / expenses, plans optimized daily hit-list routes, surfaces ROI, and — when a partner is finally "activated" — pushes them into Storm Cloud so they flow into the company's active operational CRM.

**What success looks like**: A Storm Cloud user opens PartnerRadar for the first time and instantly knows how to use it because it feels like a native extension of Storm. Reps spend less time on logistics and more time on relationships. Managers see ROI per partner and per rep. Activated partners flow smoothly into Storm.

---

## 1. Tech stack (non-negotiable)

### Monorepo

- **Turborepo** with **pnpm** workspaces

```
partnerradar/
├── apps/
│   ├── web/              Next.js 15 App Router
│   └── mobile/           Expo (React Native)
├── packages/
│   ├── api/              tRPC routers, business logic
│   ├── db/               Prisma schema + client
│   ├── ui/               Shared UI components (web)
│   ├── types/            Shared Zod schemas + TS types
│   ├── ai/               Prompt templates, tone extraction, message generation
│   └── integrations/     Storm, Twilio, Resend, Google Maps, scrapers
├── dev-data/             Local mock data (gitignored)
├── design-refs/          Screenshots of Storm Cloud for reference
├── .github/workflows/    CI
├── SPEC.md               This file
├── STATUS.md             Progress log
├── ASSUMPTIONS.md        Documented assumptions (created by Cowork)
└── README.md             How to run and deploy
```

### Core

- **Next.js 15** (App Router) + **TypeScript strict mode**
- **PostgreSQL** via **Prisma** (Neon for dev + prod, or Docker Compose locally)
- **Tailwind CSS** + **shadcn/ui**
- **tRPC v11** (type-safe API between web/mobile and backend)
- **Zod** for all validation
- **NextAuth v5** with Credentials provider (SSO plug-in point documented for later)
- **Inngest** for background jobs
- **React Query** (bundled with tRPC) for client data fetching
- **React Hook Form** + Zod resolvers for all forms

### Mobile

- **Expo SDK 51+** (React Native 0.74+)
- **Expo Router** (file-based routing)
- **NativeWind** (Tailwind for RN)
- **Expo Notifications** for push
- **Expo Location** for rep location during routes
- **Expo SecureStore** for tokens
- **Expo Camera / Image Picker** for receipt capture
- **Expo Audio** for voice-note comments
- Shares tRPC client + Zod types with web

### External services

- **Anthropic Claude API** — Sonnet for message drafting, Haiku for tone extraction + fast classification
- **Resend** + **React Email** — transactional email + scheduled digests
- **Twilio** — SMS (Messaging Service; 10DLC for long-codes or short-code)
- **Google Maps JS API** — map rendering, Places (scraping + address autocomplete), Directions (route optimization)
- **Cloudflare R2** — file storage (S3-compatible)
- **OpenStreetMap / Nominatim** — geocoding fallback when Google quota is hit
- **Upstash Redis** — rate limiting, caching
- **Sentry** — error monitoring

### Dev tooling

- **Vitest** for unit tests (co-located `*.test.ts` files)
- **Playwright** for web E2E (in `apps/web/e2e/`)
- **Maestro** for mobile E2E (flows in `apps/mobile/.maestro/`)
- **ESLint** with `@typescript-eslint`, `eslint-plugin-tailwindcss`
- **Prettier** with Tailwind plugin
- **Husky** + **lint-staged** for pre-commit
- **GitHub Actions** for CI (lint + typecheck + tests on every PR)

### Deployment

- **Web**: Vercel
- **Mobile**: EAS Build → TestFlight (iOS) + Play Internal Track (Android)
- **Database**: Neon (managed Postgres)
- **File storage**: Cloudflare R2
- **Background jobs**: Inngest Cloud
- **DNS**: whatever Kirk chooses; document CNAME setup

---

## 2. Entities (high-level)

| Entity | Purpose |
|---|---|
| **User** | A rep, manager, or admin. Belongs to one or more markets. |
| **Market** | Geographic region (e.g., "Denver, CO"). Scopes partners, scrape zones, hit lists, budgets. |
| **Partner** | A referral-partner *candidate* (or, once activated, an active partner). |
| **Contact** | A person at a Partner. Multiple per partner. |
| **Activity** | Any touchpoint — comment, call, SMS, email, visit, stage change, activation. |
| **Task** | A to-do with optional due date and assignee. |
| **Appointment** | A calendar event (in-person meeting, scheduled call). |
| **Expense** | Money spent wooing a partner (meal, gift, event). |
| **RevenueAttribution** | Revenue credited to a partner, pulled from Storm via API. |
| **HitList** | An ordered daily route for a rep. |
| **ScrapeJob** | A recurring scrape config (source + market + filters). |
| **ScrapedLead** | A lead in the approval queue awaiting manager assignment. |
| **AuditLog** | Append-only record of significant actions. |
| **MessageTemplate** | Reusable email/SMS template with variables. |
| **AutomationCadence** | Ordered sequence of templated messages for a pipeline stage. |
| **AIToneSample** | Writing samples a rep provides to train their AI tone. |
| **Notification** | In-app / push notification. |
| **CalendarConnection** | OAuth/CalDAV credentials for external calendar sync. |
| **File** | Uploaded partner-related file. |

---

## 3. Design system (mirror Storm Cloud)

This is the most important section for UX fit. Study the reference screenshots in `/design-refs/`. If they are missing, ask Kirk or browse https://app.storm.cloud via Claude in Chrome.

### 3.1 Color tokens (extend Tailwind `theme.extend.colors`)

```ts
// tailwind.config.ts
colors: {
  nav: {
    bg:      '#0a1929', // dark navy, global top nav
    active:  '#2563eb', // bright blue active pill
    text:    '#e5e7eb',
    muted:   '#94a3b8',
  },
  canvas:    '#f5f6f8', // page background
  card:      '#ffffff',
  'card-border': '#e5e7eb',
  primary: {
    DEFAULT: '#2563eb', // action blue (buttons, links)
    hover:   '#1d4ed8',
  },
  success:  '#10b981', // green positive $
  danger:   '#ef4444', // red negative $, notification badge
  warning:  '#f59e0b', // orange dots
  // Stage colors — each stage has a signature color
  stage: {
    newLead:    '#9ca3af', // gray-400
    researched: '#f97316', // orange-500
    initial:    '#f59e0b', // amber-500
    meeting:    '#3b82f6', // blue-500
    conv:       '#a855f7', // purple-500
    proposal:   '#ec4899', // pink-500
    activated:  '#10b981', // emerald-500
    inactive:   '#94a3b8', // slate-400
  },
}
```

### 3.2 Typography

- **Font**: Inter. Load via `next/font`. System fallback: `ui-sans-serif, system-ui, sans-serif`.
- Body text: 14px / 1.5 line-height
- Labels: 12–13px, `text-gray-500`
- Page H1: 20px `font-semibold`
- Card title: 14–15px `font-semibold`
- Stat numbers (on status tiles): 36–40px, colored per stage
- Table headers: 13px `font-medium text-gray-600 uppercase tracking-wide` — actually Storm uses mixed case; use `font-medium text-gray-700` no tracking

### 3.3 Global top nav (web)

- Fixed top, full width, 52px tall, `bg-nav-bg`
- Logo far left (PartnerRadar logo — placeholder until Kirk provides)
- Menu items with icon + label, ~36px apart horizontally
- Active item: bright blue pill `bg-nav-active` wrapping icon + label, `rounded-md px-3 py-1.5`
- Items (left → right):
  - **+ New** (dropdown: New Partner, New Task, New Appointment, New Expense)
  - **Radar** (link, home/dashboard)
  - **Partners** (link, list view)
  - **Lists** (dropdown: Hit Lists, Scrape Queue, Tasks, Appointments, Expenses, Activations Log)
  - **Reports** (link)
  - **Admin** (link, manager+ only; admin-only sub-tabs shown disabled for managers)
- Right side: search icon, calendar icon, notification bell with red circle badge showing unread count, user avatar + name + dropdown chevron

### 3.4 Mobile nav

- Bottom tab bar with: Radar (home), Partners, Hit List, Calendar, More
- "More" opens a sheet with: Reports, Admin (if permitted), Settings, Logout
- "+ New" is a floating action button bottom-right, opens bottom sheet with quick actions

### 3.5 Cards

- `bg-card border border-card-border rounded-lg shadow-sm p-4 md:p-5`
- Header row: title left (14–15px semibold), "Edit" pencil link right (if editable)

### 3.6 List view pattern

Mirrors Storm Cloud "Referral Partners" screenshot.

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Referral Partners                    [search]  [🔍] [New] btn │
├─────────────────────────────────────────────────────────────────┤
│ Filters │ Name │ Partner Type │ Address │ City │ State │ ...    │
│ ──────  │ ────────────────────────────────────────────────────  │
│ Type ▾  │ Rob Mathes │ Insurance Agent │ ... │ Denver │ CO │ ...│
│ Rep ▾   │ Kyle Styer │ Other │ ...                              │
│ Clear   │ ...                                                   │
└─────────────────────────────────────────────────────────────────┘
                                            Count: 96   [↕][⬇][⚙]
```

- Left sidebar, collapsible, ~200px wide, header "Filters", then dropdowns, "Clear Filters" button at bottom
- Main area: dense sortable table (`<table>` element, proper semantics), click row → detail page
- Top-right action bar: search input with magnifier, primary "New" button
- Bottom bar: "Count: N" left, gear + download + toggle icons right
- Horizontal scroll for overflow; sticky first column for Name
- Row hover: `bg-gray-50`
- Selected row: `bg-blue-50`

### 3.7 Detail view pattern

Mirrors Storm Cloud "Project detail" and "Referral Partner detail" screenshots.

Layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← [PR-1234] Partner Name              [$Spend] [Type] [Activate ▾] ⋮│
│      📍 address                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────────────┐  ┌──────────────────────┐       │
│ │ Contacts │  │ Info | Overview  │  │ Comments|Appts|Tasks │       │
│ │          │  │                  │  │                      │       │
│ │ + new    │  │ Fields...        │  │ Activity items...    │       │
│ │  contact │  │                  │  │                      │       │
│ │          │  │  [Edit info]     │  │  [+ New Appt]        │       │
│ └──────────┘  └──────────────────┘  └──────────────────────┘       │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────────────────────────────────────────┐     │
│ │ Files    │  │ Expenses|Activities|Messages|Docs|Financial  │     │
│ │ folders  │  │ table...                                     │     │
│ └──────────┘  └──────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

- Top strip: back arrow → ID badge (blue pill, `PR-1234`) → title + subtitle (address with pin icon) → right-aligned: key stats ($ spent, ROI chip), type pills, primary action button ("Activate Partner" — dark pill with dropdown arrow for rep to choose Activation reason), kebab menu
- Three-column main section: Contacts card (~20%) / Info card with tabs (~45%) / Activity card with tabs (~35%)
- Bottom split: Files (25%) / Tabbed records panel (75%)
- All tabs underline-active style (blue border-b-2 on active), not pills

### 3.8 Field style (detail view)

```
Label:  Value
```

- Label: `text-gray-500 text-[13px]`, right-padded, fixed width ~120px, aligned right
- Value: `text-gray-900 text-[13px]`
- Row: `py-1.5`

### 3.9 Avatars

- Circle, sizes: 20 / 24 / 28 / 32 / 40px depending on context
- Background: derived from username hash → consistent palette of 12 accent colors
- Text: white, bold, 2-letter initials

### 3.10 Status pills (pipeline stage tiles on Radar)

Mirror Storm "Projects Statuses" widget. Grid of 4 columns on desktop.

Each tile:
- Small label top-left, `text-gray-500 text-xs`
- Large number, `text-[36px] font-semibold`, color = stage color
- `$N,NNN.NN` amount in parens below, `text-gray-500 text-xs`
- Tile is a clickable link → `/partners?stage=X`
- Hover: subtle background lift

### 3.11 Right-drawer modal

Mirror Storm "Calendar Event" drawer.

- Slides in from right, 420px wide desktop / full-width mobile
- Header: X close + title
- Body: form fields, required-asterisk in red, one field per row or two-per-row where compact
- Footer: sticky, Save button (primary blue) bottom-right
- Used for: New/Edit Appointment, New Task, New Expense, New Contact, Quick Add Partner, AI Message Draft, Stage Change (with note)

### 3.12 Activity feed

Per item:
- Avatar circle + name (bold) + verb phrase + timestamp on one line
- Blue `Partner: Name` chip linking to record
- Body text below
- "Reply" link at bottom (comments + SMS/email threads)

### 3.13 Buttons

- Primary: `bg-primary text-white rounded-md px-3 py-1.5 text-sm font-medium hover:bg-primary-hover`
- Secondary: `bg-white border border-gray-300 text-gray-700 rounded-md px-3 py-1.5 text-sm`
- Dashed-blue "+ Action" (Storm's pattern for + New contact / + New Appointment): `border border-dashed border-blue-500 text-blue-600 bg-transparent hover:bg-blue-50 rounded-md px-3 py-1.5 text-sm`
- Destructive: `bg-red-600 text-white`
- Icon-only: 32px square, hover background

### 3.14 Empty states

- Small outline icon in `text-gray-400` (use Lucide icons: Mail, Clipboard, Calendar, Users)
- "No data" text centered below in `text-gray-500 text-sm`

### 3.15 Toasts

- Bottom-right stack, 3s auto-dismiss, swipe to dismiss on mobile
- Variants: success (green), error (red), info (blue), warning (amber)
- Max 3 visible at once

### 3.16 Notifications bell

- Red circle badge with unread count
- Click → dropdown panel, 360px wide, max-height 480px, scrollable
- Each notification: icon + title + body + timestamp + action link
- "Mark all read" at top-right
- "See all notifications" link at bottom

### 3.17 Balloons on Activation

When a user clicks "Activate Partner" and the push succeeds, play a full-screen balloon animation. **Required. Do not skip.**

- Use `react-confetti-boom` or equivalent lightweight canvas/SVG library
- ~30 balloons, random colors from the palette, random x positions, rise from bottom over ~4 seconds
- Optional sound effect (pop or celebration chime) — controlled by user setting `soundEffects: boolean` (default on)
- Event also triggers a strong haptic on mobile

### 3.18 Loading states

- Skeleton screens (gray pulsing rectangles matching final layout) — not spinners — for list + detail pages
- Button loading state: replace label with spinner + keep width

### 3.19 Dark mode

Both web and mobile. Use Tailwind's `dark:` modifier. Nav stays dark in both modes.

---

## 4. Data model

Complete Prisma schema. Cowork: put this in `packages/db/prisma/schema.prisma` and refine as needed — add indexes, adjust field types where you have engineering judgment. Do NOT rename fields without updating SPEC.md.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Core ────────────────────────────────────────────────────────────

model Market {
  id            String   @id @default(cuid())
  name          String
  timezone      String   @default("America/Denver")
  defaultCenter Json     // { lat: number, lng: number }
  scrapeRadius  Int      @default(25) // miles
  physicalAddress String? // for CAN-SPAM email footer
  createdAt     DateTime @default(now())
  users         UserMarket[]
  partners      Partner[]
  hitLists      HitList[]
  scrapeJobs    ScrapeJob[]
  budgetRules   BudgetRule[]
  scrapedLeads  ScrapedLead[]
}

model User {
  id                    String   @id @default(cuid())
  email                 String   @unique
  passwordHash          String?
  stormCloudUserId      String?  @unique // SSO future
  name                  String
  role                  Role     @default(REP)
  avatarColor           String
  homeAddress           String?
  officeAddress         String?
  defaultStart          RouteStartMode @default(OFFICE)
  preferredMapApp       MapApp   @default(GOOGLE)
  aiToneTrainingStatus  ToneTrainingStatus @default(NOT_STARTED)
  aiToneProfile         Json?    // { formality, avgSentenceLength, greetings[], signoffs[], emojiRate, quirks[] }
  aiAutonomousApprovals Int      @default(0)
  aiAutonomousMode      Boolean  @default(false)
  aiAutonomousEnabledAt DateTime?
  monthlyRevenueCached  Decimal? @db.Money
  monthlyRevenueCachedAt DateTime?
  soundEffects          Boolean  @default(true)
  notificationPrefs     Json     @default("{}")
  active                Boolean  @default(true)
  lastLoginAt           DateTime?
  createdAt             DateTime @default(now())
  markets               UserMarket[]
  assignedPartners      Partner[] @relation("AssignedRep")
  activities            Activity[]
  tasks                 Task[]
  appointments          Appointment[]
  expenses              Expense[]
  hitLists              HitList[]
  notifications         Notification[]
  calendarConnections   CalendarConnection[]
  toneSamples           AIToneSample[]
  @@index([email])
}

enum Role { REP MANAGER ADMIN }
enum RouteStartMode { HOME OFFICE LAST_STOP CUSTOM }
enum MapApp { GOOGLE APPLE }
enum ToneTrainingStatus { NOT_STARTED IN_PROGRESS CALIBRATED REP_APPROVED }

model UserMarket {
  userId    String
  marketId  String
  isPrimary Boolean @default(false)
  user      User   @relation(fields:[userId], references:[id], onDelete: Cascade)
  market    Market @relation(fields:[marketId], references:[id], onDelete: Cascade)
  @@id([userId, marketId])
  @@index([marketId])
}

// ─── Partners ────────────────────────────────────────────────────────

model Partner {
  id              String   @id @default(cuid())
  publicId        String   @unique // "PR-1234" for display
  marketId        String
  market          Market   @relation(fields:[marketId], references:[id])
  companyName     String
  partnerType     PartnerType
  customType      String?  // when partnerType = OTHER
  address         String?
  addressLine2    String?
  city            String?
  state           String?
  zip             String?
  lat             Float?
  lng             Float?
  website         String?
  notes           String?  @db.Text
  stage           PartnerStage @default(NEW_LEAD)
  stageChangedAt  DateTime @default(now())
  source          LeadSource @default(MANUAL)
  sourceDetails   Json?
  assignedRepId   String?
  assignedRep     User?    @relation("AssignedRep", fields:[assignedRepId], references:[id])
  smsConsent      Boolean  @default(false)
  smsConsentAt    DateTime?
  smsConsentBy    String?
  smsConsentMethod SmsConsentMethod?
  emailUnsubscribedAt DateTime?
  stormCloudId    String?  @unique
  activatedAt     DateTime?
  activatedBy     String?
  archivedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  contacts        Contact[]
  activities      Activity[]
  tasks           Task[]
  appointments    Appointment[]
  expenses        Expense[]
  files           File[]
  revenueAttributions RevenueAttribution[]
  hitListStops    HitListStop[]
  tags            PartnerTag[]
  @@index([marketId, stage])
  @@index([assignedRepId])
  @@index([archivedAt])
  @@index([stormCloudId])
}

enum PartnerType {
  REALTOR
  PROPERTY_MANAGER
  INSURANCE_AGENT
  MORTGAGE_BROKER
  HOME_INSPECTOR
  PUBLIC_ADJUSTER
  REAL_ESTATE_ATTORNEY
  HVAC
  PLUMBING
  ELECTRICAL
  LANDSCAPER
  GENERAL_CONTRACTOR
  RESTORATION_MITIGATION
  FACILITIES_MANAGER_COMMERCIAL
  OTHER
}

enum PartnerStage {
  NEW_LEAD
  RESEARCHED
  INITIAL_CONTACT
  MEETING_SCHEDULED
  IN_CONVERSATION
  PROPOSAL_SENT
  ACTIVATED
  INACTIVE
}

enum LeadSource { MANUAL SCRAPED REFERRAL IMPORT }
enum SmsConsentMethod { VERBAL WRITTEN EMAIL IN_PERSON }

model PartnerTag {
  id         String @id @default(cuid())
  partnerId  String
  partner    Partner @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  tag        String
  @@index([partnerId, tag])
  @@unique([partnerId, tag])
}

model Contact {
  id            String   @id @default(cuid())
  partnerId     String
  partner       Partner  @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  name          String
  title         String?
  phones        Json     // [{ number, label, primary }]
  emails        Json     // [{ address, label, primary, unsubscribedAt }]
  isPrimary     Boolean  @default(false)
  smsConsent    Boolean  @default(false)
  emailConsent  Boolean  @default(true)
  notes         String?
  createdAt     DateTime @default(now())
  @@index([partnerId])
}

// ─── Activities / Tasks / Appointments / Expenses ────────────────────

model Activity {
  id         String   @id @default(cuid())
  partnerId  String
  partner    Partner  @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields:[userId], references:[id])
  type       ActivityType
  body       String?  @db.Text
  metadata   Json?
  createdAt  DateTime @default(now())
  @@index([partnerId, createdAt])
  @@index([userId, createdAt])
  @@index([type, createdAt])
}

enum ActivityType {
  COMMENT
  CALL
  SMS_OUT
  SMS_IN
  EMAIL_OUT
  EMAIL_IN
  VISIT
  MEETING_HELD
  STAGE_CHANGE
  AI_DRAFT_REQUESTED
  AI_MESSAGE_SENT_AUTO
  AI_MESSAGE_APPROVED
  ACTIVATION
  ASSIGNMENT
  CLAIM
}

model Task {
  id          String   @id @default(cuid())
  partnerId   String?
  partner     Partner? @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  assigneeId  String
  assignee    User     @relation(fields:[assigneeId], references:[id])
  title       String
  description String?  @db.Text
  dueAt       DateTime?
  completedAt DateTime?
  priority    TaskPriority @default(NORMAL)
  createdAt   DateTime @default(now())
  @@index([assigneeId, completedAt])
  @@index([partnerId])
}

enum TaskPriority { LOW NORMAL HIGH URGENT }

model Appointment {
  id                 String   @id @default(cuid())
  partnerId          String?
  partner            Partner? @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  userId             String
  user               User     @relation(fields:[userId], references:[id])
  type               String   // "Meet & Greet" / "Pitch" / "Follow-up" / "Coffee" / "Other"
  title              String
  location           String?
  startsAt           DateTime
  endsAt             DateTime
  allDay             Boolean  @default(false)
  notes              String?  @db.Text
  externalCalendarId String?
  externalProvider   String?  // "google" / "apple" / "storm"
  source             AppointmentSource @default(INTERNAL)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([userId, startsAt])
  @@index([partnerId])
}

enum AppointmentSource { INTERNAL GOOGLE APPLE STORM }

model Expense {
  id             String   @id @default(cuid())
  partnerId      String
  partner        Partner  @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  userId         String
  user           User     @relation(fields:[userId], references:[id])
  amount         Decimal  @db.Money
  description    String
  category       String   // "Meal" / "Gift" / "Event" / "Travel" / "Other"
  occurredOn     DateTime
  receiptFileId  String?
  approvalStatus ExpenseApproval @default(PENDING)
  approvedBy     String?
  approvedAt     DateTime?
  rejectedReason String?
  createdAt      DateTime @default(now())
  @@index([partnerId])
  @@index([userId, approvalStatus])
  @@index([approvalStatus])
}

enum ExpenseApproval { AUTO_APPROVED PENDING APPROVED REJECTED }

model BudgetRule {
  id                            String  @id @default(cuid())
  marketId                      String?
  market                        Market? @relation(fields:[marketId], references:[id])
  repId                         String? // null = default rule
  autoApproveUnder              Decimal @default(25) @db.Money
  managerApproveUnder           Decimal @default(100) @db.Money
  monthlyBudgetPercentOfRevenue Decimal? // e.g., 0.05 = 5%
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt
}

// ─── Revenue (synced from Storm) ─────────────────────────────────────

model RevenueAttribution {
  id                  String   @id @default(cuid())
  partnerId           String
  partner             Partner  @relation(fields:[partnerId], references:[id])
  stormCloudProjectId String
  amount              Decimal  @db.Money
  earnedOn            DateTime
  syncedAt            DateTime @default(now())
  @@index([partnerId])
  @@index([earnedOn])
  @@unique([stormCloudProjectId])
}

// ─── Hit List ────────────────────────────────────────────────────────

model HitList {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields:[userId], references:[id])
  marketId      String
  market        Market   @relation(fields:[marketId], references:[id])
  date          DateTime // local midnight
  startAddress  String
  startLat      Float
  startLng      Float
  startMode     RouteStartMode
  totalDistance Float?   // miles
  totalDuration Int?     // minutes
  generatedAt   DateTime @default(now())
  stops         HitListStop[]
  @@unique([userId, date])
}

model HitListStop {
  id                 String   @id @default(cuid())
  hitListId          String
  hitList            HitList  @relation(fields:[hitListId], references:[id], onDelete: Cascade)
  partnerId          String
  partner            Partner  @relation(fields:[partnerId], references:[id])
  order              Int
  plannedArrival     DateTime
  plannedDurationMin Int      @default(20)
  isAppointmentLock  Boolean  @default(false)
  completedAt        DateTime?
  skippedAt          DateTime?
  skipReason         String?
  notes              String?
  @@index([hitListId, order])
}

// ─── Scraping ────────────────────────────────────────────────────────

model ScrapeJob {
  id        String   @id @default(cuid())
  marketId  String
  market    Market   @relation(fields:[marketId], references:[id])
  source    ScrapeSource
  name      String
  filters   Json     // { partnerTypes:[], radiusMi, keywords:[], selectorMap? }
  cadence   String   // cron expression
  active    Boolean  @default(true)
  lastRunAt DateTime?
  nextRunAt DateTime?
  createdBy String
  createdAt DateTime @default(now())
  leads     ScrapedLead[]
  @@index([marketId, active])
}

enum ScrapeSource {
  GOOGLE_PLACES
  YELP
  LICENSING_BOARD
  CUSTOM_URL
}

model ScrapedLead {
  id                String   @id @default(cuid())
  scrapeJobId       String
  scrapeJob         ScrapeJob @relation(fields:[scrapeJobId], references:[id], onDelete: Cascade)
  marketId          String
  market            Market   @relation(fields:[marketId], references:[id])
  rawPayload        Json
  normalized        Json     // { companyName, partnerType, address, contacts[], ... }
  dedupHash         String
  status            ScrapedLeadStatus @default(PENDING)
  reviewedBy        String?
  reviewedAt        DateTime?
  approvedPartnerId String?  @unique
  rejectedReason    String?
  createdAt         DateTime @default(now())
  @@index([marketId, status])
  @@index([dedupHash])
}

enum ScrapedLeadStatus { PENDING APPROVED REJECTED DUPLICATE }

// ─── Files ───────────────────────────────────────────────────────────

model File {
  id         String  @id @default(cuid())
  partnerId  String?
  partner    Partner? @relation(fields:[partnerId], references:[id], onDelete: Cascade)
  folderId   String?
  folder     FileFolder? @relation(fields:[folderId], references:[id])
  uploaderId String
  name       String
  mimeType   String
  sizeBytes  Int
  storageKey String  // R2 object key
  transcript String? @db.Text // for voice notes
  createdAt  DateTime @default(now())
  @@index([partnerId])
  @@index([folderId])
}

model FileFolder {
  id        String  @id @default(cuid())
  partnerId String
  name      String
  parentId  String?
  parent    FileFolder? @relation("ChildFolders", fields:[parentId], references:[id])
  children  FileFolder[] @relation("ChildFolders")
  files     File[]
  createdAt DateTime @default(now())
  @@index([partnerId])
}

// ─── Calendar ────────────────────────────────────────────────────────

model CalendarConnection {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields:[userId], references:[id], onDelete: Cascade)
  provider              String   // "google" / "apple" / "storm"
  externalAccountId     String
  accessTokenEncrypted  String?
  refreshTokenEncrypted String?
  calendarIds           String[]
  lastSyncedAt          DateTime?
  syncStatus            String   @default("ok") // "ok" / "error" / "disconnected"
  syncError             String?
  @@index([userId])
}

model CalendarEventCache {
  id              String   @id @default(cuid())
  userId          String
  connectionId    String
  externalEventId String
  provider        String
  title           String
  location        String?
  startsAt        DateTime
  endsAt          DateTime
  lastSeenAt      DateTime @default(now())
  @@unique([userId, externalEventId, provider])
  @@index([userId, startsAt])
}

// ─── Notifications ───────────────────────────────────────────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields:[userId], references:[id], onDelete: Cascade)
  type      String
  title     String
  body      String?
  link      String?
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
  @@index([userId, createdAt])
}

// ─── Audit ───────────────────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  entityType String
  entityId   String
  action     String
  diff       Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId])
  @@index([userId, createdAt])
  @@index([createdAt])
}

// ─── Messaging templates & automation ────────────────────────────────

model MessageTemplate {
  id        String   @id @default(cuid())
  kind      MessageKind
  name      String
  subject   String?  // email only
  body      String   @db.Text
  stage     PartnerStage?
  createdBy String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([kind, active])
}

enum MessageKind { EMAIL SMS }

model AutomationCadence {
  id           String   @id @default(cuid())
  name         String
  triggerStage PartnerStage
  steps        Json     // [{ offsetHours, kind, templateId, requireApprovalBelowThreshold }]
  active       Boolean  @default(true)
  createdBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([triggerStage, active])
}

model CadenceExecution {
  id          String   @id @default(cuid())
  cadenceId   String
  partnerId   String
  stepIndex   Int
  scheduledAt DateTime
  executedAt  DateTime?
  outcome     String?  // "sent" / "blocked_consent" / "blocked_quiet_hours" / "blocked_rate_limit" / "failed"
  @@index([partnerId, cadenceId])
  @@index([scheduledAt, executedAt])
}

model AIToneSample {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields:[userId], references:[id], onDelete: Cascade)
  kind      MessageKind
  sample    String   @db.Text
  channel   String?  // "email" / "sms" / "both"
  createdAt DateTime @default(now())
  @@index([userId])
}
```

**Index strategy**: The `@@index` directives above are a starting point. Cowork may add more based on query patterns discovered during development; document additions in a comment.

**Migrations**: always `prisma migrate dev` locally, `prisma migrate deploy` in CI. Never edit a committed migration.

---

## 5. Roles & Permissions

Centralize permission logic in `packages/api/src/permissions.ts`. Export a single function:

```ts
export function can(
  user: User & { markets: string[] },
  action: Action,
  resource?: Resource
): boolean
```

Every tRPC procedure calls `can()` before doing work; denial throws `TRPCError({ code: 'FORBIDDEN' })`. UI mutation affordances hide if `useCan()` returns false.

### 5.1 Role matrix

| Capability | Rep | Manager | Admin |
|---|:-:|:-:|:-:|
| View own + unassigned partners in their markets | ✓ | ✓ | ✓ |
| View other reps' partners | ✗ | ✓ | ✓ |
| Edit own partners | ✓ | ✓ | ✓ |
| Edit others' partners | ✗ | ✓ | ✓ |
| Create partner manually | ✓ | ✓ | ✓ |
| Claim unassigned partner (first-come-first-served) | ✓ | ✓ | ✓ |
| Assign / reassign partners | ✗ | ✓ | ✓ |
| Merge duplicates | ✗ | ✓ | ✓ |
| Soft-delete / archive partner | ✗ | ✓ | ✓ |
| Hard-delete from archive (after 90d) | ✗ | ✗ | ✓ |
| Submit own expenses | ✓ | ✓ | ✓ |
| View own ROI and expense totals | ✓ | ✓ | ✓ |
| View others' expenses and ROI | ✗ | ✓ | ✓ |
| Approve expenses in manager tier | ✗ | ✓ | ✓ |
| Approve expenses above manager tier | ✗ | ✗ | ✓ |
| Bulk export / download | ✗ | ✓ | ✓ |
| Create / edit users | ✗ | ✓ | ✓ |
| Deactivate user | ✗ | ✓ | ✓ |
| Hard-delete user | ✗ | ✗ | ✓ |
| Configure scrape jobs & geo zones | ✗ | ✓ | ✓ |
| Review scrape approval queue | ✗ | ✓ | ✓ |
| Push partner to Storm Cloud (Activate) | ✗ | ✓ | ✓ |
| Manage email / SMS templates & cadences | ✗ | ✗ | ✓ |
| Configure budget rules & approval thresholds | ✗ | ✗ | ✓ |
| View audit log | ✗ | ✓ | ✓ |
| Configure Markets | ✗ | ✗ | ✓ |
| Configure integrations (API keys) | ✗ | ✗ | ✓ |
| Configure global AI autonomy defaults | ✗ | ✗ | ✓ |

### 5.2 Partner visibility rule (reps)

A rep sees a partner if:
```
partner.archivedAt IS NULL
AND (
  partner.assignedRepId = user.id
  OR (partner.assignedRepId IS NULL AND partner.marketId IN user.markets)
)
```

### 5.3 Claim action

When a rep views an unassigned partner, show a "Claim" button. Clicking performs an atomic update: `UPDATE partners SET assignedRepId = userId WHERE id = partnerId AND assignedRepId IS NULL`. If the update affects 0 rows, return "Someone else just claimed this" toast.

### 5.4 Tests required

- Rep A cannot query Rep B's partners (tRPC returns FORBIDDEN)
- Rep A cannot mutate Rep B's partners
- Manager can query everything in their markets
- Admin can query everything globally
- Admin-only actions return FORBIDDEN to managers
- Claim race condition — two reps claiming at the same time, only one succeeds

---

## 6. Features (build in this order)

Each phase has a **goal**, a **deliverable**, and **acceptance criteria**. Cowork should not mark a phase complete until all acceptance criteria are met.

### 6.1 Phase 1 — Foundation

**Goal**: Scaffold the monorepo. Auth works on web + mobile. Design system tokens and components exist. Nav shell navigates.

**Deliverable**:
- Turborepo monorepo matching §1 structure
- Prisma schema migrated against local Postgres (Docker Compose provided)
- Seed script: 3 users (rep@demo.com / manager@demo.com / admin@demo.com, password `Demo1234!`), 2 markets (Denver CO primary, Kansas City KS secondary), 10 partners across various stages, some activities to populate the feed
- Tailwind config with design tokens from §3.1
- `packages/ui` with: Card, Button (all variants), Pill, Avatar, Table, FilterSidebar, DrawerModal, StatusTile, ActivityItem, EmptyState — visually matching Storm Cloud
- NextAuth v5 with Credentials provider on apps/web
- Login page matching Storm's login style
- Global nav shell (web) with dropdowns working, active state, notification bell stub, user menu
- Market switcher in nav (if user has >1 market)
- apps/mobile scaffolded with Expo + Expo Router, bottom tab shell, login screen using same auth
- GitHub Actions CI running lint + typecheck + unit tests on push
- README with "how to run locally" + "how to deploy"

**Acceptance**:
- `pnpm install && pnpm dev` at repo root runs web on :3000 and mobile Expo
- Can log in as any of 3 seeded users on web
- Each role sees appropriate nav items
- Can navigate between top-level pages (placeholder content OK for ones not built yet)
- Mobile: can log in and see bottom tab shell in Expo Go
- CI passes

### 6.2 Phase 2 — Partners core

**Goal**: Reps can manage partners end-to-end.

**Deliverable**:
- `/partners` list view matching Storm's Referral Partners screenshot exactly (spacing, typography, filter sidebar, "New" button)
- Filter sidebar: Partner Type (multi-select), Assigned Rep, Stage, Market, Tags, Has-Phone, Has-Email, Date Added
- Search bar with fuzzy search across name + contact name + contact email
- Dense sortable table with all columns from screenshot plus Stage
- Right-drawer "New Partner" form
- `/partners/[id]` detail view with the 3-column + bottom-split layout from §3.7
- **Contacts** card: list, add via dashed-blue button, edit inline, mark primary
- **Info** card with tabs: Overview (core fields), Details (custom fields), inline edit
- **Activity** card with tabs: Comments (composer with @mentions, live updates), Appointments (Month/Week/Day/List switcher, New button opens drawer per §3.11), Tasks (list + New task drawer)
- **Files** bottom-left: folder tree, drag-drop upload, per-folder count badges
- **Records** bottom-right with tabs: Expenses, Activities (full activity log), Messages (email + SMS threads), Documents, Financial Overview
- Stage dropdown in detail header; change logs Activity(STAGE_CHANGE)
- **"Activate Partner" button** (manager+ only) in top-right action strip. Confirmation modal. On success: set `stage = ACTIVATED, activatedAt = now()`, call stub Storm push (logs payload), log AuditLog, render balloons per §3.17, show toast "Partner activated & synced to Storm Cloud"
- `/radar` dashboard: left column = Pipeline Status tile grid (8 tiles for 8 stages, each clickable → filtered partners list) + Tasks widget + 30-day Stats widget (stats: Contacts made, Meetings held, Partners activated, Revenue attributed, Expenses submitted, Avg days-to-activate); right column = live Activity feed (polling every 10s)
- Global search from nav: fuzzy across partners, contacts, tasks, appointments within visible scope, keyboard-shortcut Cmd/Ctrl+K

**Acceptance**:
- Rep can only see their own + unassigned partners in their markets
- Manager sees all partners in their markets
- Admin sees everything
- Stage advances log Activity entries; Radar feed shows them within 10s
- Activate Partner button: renders balloons, pushes to mock Storm (payload logged to `dev-data/storm-mock.json`), ROI card appears on detail
- File upload to R2 works end-to-end
- E2E test covers: create partner → add contact → advance stage → add note → activate

### 6.3 Phase 3 — Users / Markets / Permissions Admin

**Goal**: Managers and admins can fully manage the team.

**Deliverable**:
- `/admin/users`: list all users in admin's scope with avatar, name, email, role, markets, last login; CRUD; deactivate (soft); hard-delete (admin only)
- Invite flow: enter email + role + markets → system sends invite email via Resend with one-time link → user sets password via form → account activated
- `/admin/markets`: CRUD markets (name, timezone, defaultCenter via map picker, scrapeRadius, physicalAddress for email footer)
- `/admin/audit-log`: filterable table, paginated, detail drawer shows diff
- `/settings` (any user): profile, avatar color picker (12-color palette), home + office addresses with Google Places autocomplete, default route start mode, preferred map app, notification preferences per category × channel
- Enforce permission checker on every admin tRPC procedure; tests verify rep cannot access admin routes

**Acceptance**:
- Invite → accept → login flow works
- Manager can deactivate a rep (rep cannot log in after)
- Admin can hard-delete; audit log records it
- Rep hitting /admin/* gets redirected to /radar with toast
- Audit log shows all create/update/delete events with diffs

### 6.4 Phase 4 — Calendar & Appointments

**Goal**: Appointments sync with reps' Google / Apple calendars + Storm appointments; conflicts are flagged.

**Deliverable**:
- Google Calendar OAuth flow in /settings (scopes: read events on selected calendars)
- Apple CalDAV connection (user enters Apple ID + app-specific password; store encrypted; discover calendars via CalDAV)
- Storm Cloud calendar pull (stub via MockStormCloudClient; document expected response shape in `packages/integrations/storm/README.md`)
- Tokens stored encrypted (AES-256-GCM, key from `ENCRYPTION_KEY` env var via `@noble/ciphers`)
- Inngest job: every 15 min, sync external events into `CalendarEventCache` for connected users
- `/calendar` page: month/week/day/list switcher matching Storm's style; internal + external events with visual distinction (external = striped background + "from Google/Apple/Storm" tag + read-only)
- Appointment drawer matches Storm's Calendar Event drawer exactly: Appointment type (dropdown from configurable list in Admin > Settings), Work order / Partner link (async autocomplete), All-day toggle, Start date + time, Duration (number) + Unit (min/hrs), Assigned to (user select), Notes, Save
- Conflict detection on save: if overlap, show inline warning "Overlaps with: [event title] at [time]" with "Save anyway" and "Cancel" buttons
- Notifications at T-15min: in-app + browser push + mobile push. No email.
- Partner detail Appointments tab shows only that partner's; /calendar shows all for logged-in user

**Acceptance**:
- Connect Google Calendar, events appear within 15 min
- Create internal appointment, shows on calendar
- Conflict warning fires correctly
- External events are read-only
- 15-min reminder fires on schedule; received on mobile + web

### 6.5 Phase 5 — Storm Cloud integration adapter

**Goal**: Clean, swappable adapter. Real API can drop in later.

**Deliverable**:
- `packages/integrations/storm/` package exposing a `StormCloudClient` interface with methods:
  - `createReferralPartner(data)` → `{ stormCloudId }`
  - `getAttributedRevenue(stormCloudId, since)` → `RevenueAttribution[]`
  - `getAppointments(stormCloudId)` → `ExternalAppointment[]`
  - `getUser(email)` → `{ stormCloudUserId }` (for future SSO)
- `MockStormCloudClient`: logs all calls, persists data to `dev-data/storm-mock.json`, returns realistic fake responses
- `RealStormCloudClient`: skeleton with clearly-marked TODOs for endpoint URLs, auth scheme, request/response shapes. Document assumptions in `ASSUMPTIONS.md`.
- Factory returning one or the other based on `STORM_API_MODE` env var (default: `mock`)
- Resilience: retry with exponential backoff (3 attempts), idempotency keys on POSTs, circuit breaker (opens after 5 consecutive failures for 60s), rate limit (configurable, default 10 req/sec)
- Activation push wired into Phase 2's Activate button: on click → serialize payload → call `createReferralPartner` → store `stormCloudId` on partner
- Inngest job every 6 hours: for each `stage = ACTIVATED` partner, call `getAttributedRevenue(stormCloudId, since: partner.activatedAt)`, upsert RevenueAttribution records, recompute User.monthlyRevenueCached for assigned rep
- Webhook receiver at `/api/webhooks/storm` (body: raw JSON; parse and route to handler; document expected event types in ASSUMPTIONS.md)
- Admin > Integrations page: Storm status (mock/real), Test Connection button, last sync time, last 20 events
- SSO placeholder in auth config with explanatory comment

**Acceptance**:
- Activate a partner → payload logged correctly to mock store → stormCloudId populated
- Revenue job runs on schedule → RevenueAttribution records created → partner Financial Overview reflects it
- Changing `STORM_API_MODE=real` without filling in TODOs throws an explicit "not configured" error, not a silent failure

### 6.6 Phase 6 — Expenses + Budget

**Goal**: Submission → approval → ROI reporting.

**Deliverable**:
- Expense drawer on partner detail: upload receipt (image/PDF to R2), amount, category (from configurable list: Meal, Gift, Event, Travel, Other), description, date
- Approval engine (pure function, fully tested):
  - `amount <= autoApproveUnder` → `AUTO_APPROVED`
  - `amount <= managerApproveUnder` → `PENDING`, notify assigned market's managers
  - `amount > managerApproveUnder` → `PENDING`, notify all admins
- Per-rep override of thresholds by admin in User settings
- Monthly budget cap: `budget = rule.monthlyBudgetPercentOfRevenue × user.monthlyRevenueCached`. Check at submission; block if exceeded; admin can override with reason logged to AuditLog.
- `/admin/expenses`: list, filter (status / rep / partner / market / date), bulk approve/reject with reason
- Partner detail Financial Overview: Total Spent, Revenue Attributed, ROI% (calc: (revenue - spend) / spend × 100), color per sign
- Radar widget for rep: "This month — spent $X of $Y budget / generated $Z" 
- Email confirmation on approval or rejection (exception to no-email rule; money deserves email)

**Acceptance**:
- $20 expense auto-approves; $80 routes to manager; $500 routes to admin
- Rejected expense shows reason on detail
- ROI math correct; colors correct
- Monthly cap prevents submission when exceeded unless admin overrides
- Receipt uploads correctly to R2

### 6.7 Phase 7 — AI tone training + message drafting

**Goal**: AI writes in the rep's voice. Approval gate before autonomy.

**Deliverable**:
- First-login onboarding modal: if `aiToneTrainingStatus = NOT_STARTED`, require rep to paste 3–5 email samples + 3–5 SMS samples of their own writing to partners/clients. Store as `AIToneSample`. Submit → call Claude Haiku with a prompt that extracts tone attributes into JSON (see `packages/ai/prompts/extract-tone.md`). Cache as `aiToneProfile` on User. Set status to `CALIBRATED`. Tone profile viewable in settings.
- "Draft AI Message" button on partner detail + on any contact
- Drawer: channel (email/SMS), purpose (First outreach / Follow-up / Schedule meeting / Post-meeting thank-you / Re-engagement / Custom), optional context notes
- On submit, call Claude Sonnet with:
  - System prompt: rep's tone profile + purpose guidelines + compliance constraints (opt-out footer for email, quiet hours note)
  - User prompt: partner context (company name, type, notes, recent activities) + purpose + optional context
- Show draft with Edit / Regenerate / Send / Save as Draft buttons
- Send → via Resend (email) or Twilio (SMS); log Activity(EMAIL_OUT/SMS_OUT); increment `aiAutonomousApprovals` on user if accepted as-is or with edits
- Approval gate: rep must have ≥ N approvals (default 5, configurable by admin) before can enable autonomous mode. Shown as progress bar on settings page: "4 of 5 approvals needed before you can enable AI autonomous sending."
- "Enable AI autonomous sending" toggle, disabled until threshold. Enabling sets `aiAutonomousMode=true, aiAutonomousEnabledAt=now()`; logs AuditLog. Can be disabled anytime.
- Message templates admin: `/admin/templates` — CRUD, fields per §4, variables `{{partner.name}}` `{{rep.name}}` `{{rep.firstName}}` `{{market.name}}` `{{unsubscribe_link}}` (email only)
- Automation cadences admin: `/admin/cadences` — CRUD. Each step: offsetHours from stage entry, kind, templateId, requireApprovalBelowThreshold (bool).
- Inngest scheduler hourly: find partners matching cadence triggers where cadence execution is due; for each:
  1. Check SMS consent (for SMS) — block if missing, log outcome `blocked_consent`
  2. Check quiet hours (9pm–8am in partner's local time) — if in quiet hours, reschedule to 8am, log `blocked_quiet_hours`
  3. Check rate limits (max 1 autonomous SMS per contact per 72h; max 4 autonomous touches per partner per 14 days) — block if exceeded, log `blocked_rate_limit`
  4. If rep has `aiAutonomousMode=true` AND step does not `requireApprovalBelowThreshold` OR rep is past threshold → generate message from template in rep's tone via Claude Sonnet, send, log Activity(AI_MESSAGE_SENT_AUTO)
  5. Otherwise → create a Notification for the rep with the drafted message + approval button
- Inbound SMS webhook `/api/webhooks/twilio/sms`: match partner by phone, Activity(SMS_IN), notify rep, handle STOP keyword (set consent=false, reply with Twilio default opt-out confirmation)
- Inbound email: Resend inbound (if DNS configured) or IMAP fallback. Parse, create Activity(EMAIL_IN), notify rep.
- Never auto-reply to inbound.
- Email footer: unsubscribe link (one-click endpoint `/api/unsubscribe?token=...`), Market.physicalAddress (CAN-SPAM), small "Sent from PartnerRadar" line.
- SMS footer: "Reply STOP to unsubscribe" on first message to a contact.

**Acceptance**:
- Rep pastes samples, tone profile extracted, visible in settings
- Rep drafts 5 messages, autonomous toggle becomes available
- Enabling autonomous → automation cadence runs → messages sent in rep's tone
- STOP reply disables consent; subsequent autonomous sends blocked
- Quiet hours, rate limits enforced
- Unsubscribe link clicked → contact emailConsent set false → no further emails
- Test: tone extraction on provided sample data produces a plausible tone profile JSON

### 6.8 Phase 8 — Lead scraping + approval queue

**Goal**: Managers configure scrapes; leads land in queue; approved leads distributed to reps.

**Deliverable**:
- Scrapers in `packages/integrations/scrapers/`:
  - **GooglePlacesScraper**: for each partnerType in filters, call Places Nearby Search (type + keyword mapping documented), paginate, extract company name, address, phone, website, category. Geocode.
  - **YelpScraper**: Fusion API search by partnerType-category mapping, same fields.
  - **LicensingBoardScraper**: start with CO (insurance licensee lookup, real estate commission licensee lookup — public data). Add KS. Other states stubbed with `throw new NotImplemented()` and documented.
  - **CustomUrlScraper**: generic Cheerio HTML scrape with admin-provided selector map (CSS selectors for name, address, phone, email). Respect robots.txt; rate-limit 1 req/sec.
- All scrapers return `NormalizedLead`: `{ companyName, partnerType, contacts:[{name,title,phone,email}], address, city, state, zip, lat, lng, sourceUrl, sourceMetadata }`
- Dedup: `dedupHash = sha256(normalize(companyName) + "|" + normalize(streetAddress))`. On write, compare hash against existing Partner records and prior ScrapedLead records; set status=DUPLICATE if match.
- Admin > Scrape Jobs page (manager+): list, CRUD, pause, "Run now" button. Per job: market, source, name, filters (partnerTypes, radiusMi, keywords), cadence (cron builder UI).
- Inngest runner: executes jobs on schedule; writes ScrapedLead rows with status=PENDING or DUPLICATE.
- `/scrape-queue` page (manager+):
  - Left filter sidebar: source, partner type, market, date range, status
  - Table of PENDING leads with preview of normalized fields, checkbox per row, select-all
  - Top bar: Assignment mode dropdown ["Split evenly across reps in market", "Assign all to [rep select]", "Leave unassigned"], "Approve selected" primary button, "Reject selected" secondary
  - Bulk approve: creates Partners at NEW_LEAD stage, assigns per mode, logs AuditLog, updates ScrapedLead status=APPROVED with approvedPartnerId
  - "Split evenly" uses active reps in the market, round-robin based on current assignment count (balance-aware)
- Notify reps in-app when new partners land in their assigned pool
- Admin dashboard widget: leads scraped / approved / rejected / activated this month by source + market

**Acceptance**:
- Create a scrape job for Denver realtors via Google Places, run now → leads appear in queue
- Duplicates auto-flagged
- Bulk approve with Split evenly → partners distributed across Denver reps
- Bulk approve with Leave unassigned → partners visible to all reps in market as claimable
- Rep gets in-app notification when assigned new leads

### 6.9 Phase 9 — Hit List + Route Optimization

**Goal**: Reps plan optimized daily routes respecting appointments and external calendar blocks.

**Deliverable**:
- `/hit-list` page: date picker (default today), "Plan my day" primary button, current hit list stops list, "Re-plan from here" button
- Plan my day flow:
  1. Pull rep's calendar events for the day (internal + Google + Apple + Storm). Events with a location become LOCKED stops at their fixed times. Events without location become blockers (no routing through those windows).
  2. Candidate partners panel: sorted by "overdue for outreach" score (days since last Activity, weighted by stage — NEW_LEAD high, ACTIVATED low) then distance from start. Filterable by type, stage, assigned-to-me.
  3. Rep selects stops (checkboxes, recommended limit 8-10).
  4. Start mode selector: Home / Office / Custom address / Last stop (reads yesterday's final stop if exists).
  5. Submit → Inngest job calls Google Directions API with:
     - Origin = start address
     - Waypoints = selected partners (optimized order)
     - Time constraints: locked stops pinned to their times; free stops scheduled in gaps
     - Visit duration default 20 min + 10 min drive buffer (both configurable per-user in settings)
  6. Returns optimized order + arrival times + distances. Persist HitList + HitListStops.
- Execution view (mobile-optimized, works on web too):
  - Big card showing current stop: partner name, address, planned arrival, distance + ETA from current location (or prior stop), notes from prior Activity
  - **Navigate** button: platform deep link to preferred map app (from settings)
    - iOS + Apple: `maps://?daddr=<urlencoded_address>`
    - iOS + Google: `comgooglemaps://?daddr=<urlencoded_address>`
    - Android: `geo:0,0?q=<urlencoded_address>`
    - Web: opens Google Maps web in new tab
  - **Mark visited** button: prompts "How'd it go?" with quick outcomes (Great / Good / No-show / Not interested) + optional voice or text note. On submit: log Activity(VISIT), mark stop completed, advance to next.
  - **Skip** button: prompts reason, logs, advances.
- "Re-plan from here": uses geolocation (mobile) or current-stop location (web), rebuilds route for remaining stops.
- Desktop view: embedded Google Map with numbered markers + polyline route, side list of stops.
- End-of-day summary auto-generated at 6pm local: stops visited / skipped / total drive time / distance / pipeline $ touched. In-app notification with link.

**Acceptance**:
- "Plan my day" with 2 locked appointments and 6 candidate partners produces a route that respects the appointment times
- Navigate button opens the correct map app on both iOS and Android
- Re-plan from here works with live geolocation
- End-of-day summary notification fires

### 6.10 Phase 10 — Reporting

**Goal**: Managers + admins get the core reports, with CSV export.

**Deliverable**:
- `/reports` with left sidebar listing report types; main area renders selected report
- Global date range picker + market filter in header
- Reports:
  1. **Activity by Rep**: for date range, per rep — # calls, emails, SMS, visits, meetings, stage advancements, partners activated, $ spent, $ revenue attributed, ROI. Sortable. Drill-down: click count → underlying Activity list drawer.
  2. **Conversion Funnel**: waterfall/funnel chart — # partners entering each stage → % advancing. Filterable by rep / market / partner type.
  3. **ROI Leaderboard**: reps ranked by revenue attributed, spend, and ROI. Three tabs.
  4. **Scrape Performance**: by source × market — leads scraped / approved / rejected / activated; conversion rate.
  5. **Partner Heatmap**: embedded map, markers colored by stage, size by spend, filterable by type + rep. Click marker → drawer with partner detail.
  6. **Expense Breakdown**: bar chart by category with drill-down (rep / partner / month).
  7. **Activity Timeline**: stacked area chart by activity type over time.
- CSV export on every report (manager+), filename `report-{type}-{daterange}.csv`
- Scheduled email digests (via Resend):
  - **Weekly manager digest** — every Monday 8am market timezone. Summary of last week + actionable insights.
  - **Monthly admin summary** — first of month 8am. Full overview across markets.
- Admin > Reports Settings: configure recipients per digest, enable/disable

**Acceptance**:
- All 7 reports render with seeded data
- CSV export works and opens cleanly in Excel
- Weekly digest fires on schedule to configured recipients
- Date range and market filters propagate to all reports

### 6.11 Phase 11 — Mobile polish + launch prep

**Goal**: Mobile app is app-store-submittable. Launch checklist complete.

**Deliverable**:
- App icon (placeholder OK; Kirk provides final)
- Splash screen
- Dark mode on web + mobile
- Haptics: stage change (light), partner activation (heavy + double-tap pattern), task complete (medium), appointment reminder (light)
- Pull-to-refresh on all lists
- Offline read cache for last 50 viewed partners via React Query + AsyncStorage persister
- Push notification pipeline: Expo Notifications, APNs + FCM keys (dev now, prod keys blocked on Kirk)
- Receipt capture via Expo Camera → direct upload to R2
- Voice-note comments: Expo Audio record → upload to R2 + transcribe via Claude Haiku → attach both to partner as Activity
- EAS Build configs for iOS TestFlight and Android Play Internal Track
- App Store + Play Store metadata draft (title, subtitle, description, keywords, placeholder screenshots auto-generated)
- `/LAUNCH_CHECKLIST.md` at repo root: env vars, DNS, domain, SSL, monitoring alerts, backup config, runbook
- Load test: simulate 50 concurrent users via k6 or Artillery; document p50/p95/p99 of key endpoints in `/LOAD_TEST_RESULTS.md`
- Security review pass: auth flows, RBAC on every endpoint (automated coverage report), secret management, `pnpm audit` clean or documented exceptions
- Tag `v1.0.0`

**Acceptance**:
- App runs on physical iOS + Android devices via EAS builds
- Dark mode works without visual glitches
- Push notifications received on device
- Launch checklist complete; Kirk can follow it to production

---

## 7. Cross-cutting specifications

### 7.1 Auth & SSO

- Phase 1: NextAuth v5 Credentials provider. Password policy: min 12 chars, 1 uppercase, 1 number, 1 symbol. Bcrypt hashing.
- Session: JWT, 8-hour expiry, sliding refresh on activity
- Rate limit login attempts via Upstash: 5 failed / 15 min → lockout 15 min
- `stormCloudUserId` field already in schema; SSO plug-in point commented in `apps/web/src/auth.ts`
- Password reset: tokenized link via Resend, 1-hour expiry
- Session revocation: admin can force-logout a user (invalidates their JWTs via a `tokenVersion` field bumped on revoke)

### 7.2 Notifications (matrix)

| Event | In-app | Browser push | Mobile push | Email |
|---|:-:|:-:|:-:|:-:|
| Task assigned to you | ✓ | ✓ | ✓ | — |
| @mention in comment | ✓ | ✓ | ✓ | — |
| Appointment T-15min | ✓ | ✓ | ✓ | — |
| New scraped leads assigned | ✓ | ✓ | ✓ | — |
| Expense approved/rejected | ✓ | — | — | ✓ (exception) |
| Expense awaiting approval (to approvers) | ✓ | ✓ | ✓ | — |
| Cadence message ready for review | ✓ | ✓ | ✓ | — |
| End-of-day route summary | ✓ | — | ✓ | — |
| Weekly manager digest | — | — | — | ✓ |
| Monthly admin summary | — | — | — | ✓ |
| Password reset | — | — | — | ✓ |
| Invite to PartnerRadar | — | — | — | ✓ |

Each user can toggle channels per category in settings.

### 7.3 Audit logging

- Middleware on every tRPC mutation: emit AuditLog with userId, entityType, entityId, action, diff (before/after JSON shallow diff), IP, user agent
- Surface: `/admin/audit-log` with filters
- Retention: 2 years, then auto-purge via Inngest cron

### 7.4 Soft delete / archive

- Partner archive: `archivedAt = now()`. Hidden from all normal views. Visible in `/admin/archived-partners` with "Restore" button.
- Nightly Inngest job: hard-delete partners with `archivedAt < now() - 90 days` (admins can still restore within the window)
- Hard delete cascades per Prisma schema `onDelete` clauses

### 7.5 Compliance

- **TCPA (SMS)**: autonomous SMS blocked unless `partner.smsConsent=true` AND `contact.smsConsent=true`. Consent metadata recorded (method, date, rep). STOP keyword via Twilio webhook sets consent=false. "Reply STOP to unsubscribe" on first send.
- **CAN-SPAM (email)**: Market.physicalAddress in every email footer. One-click unsubscribe link. Honor unsubscribes immediately (set contact.emailConsent=false).
- **Quiet hours**: 9pm–8am in partner's local timezone, no autonomous sends. Determine partner timezone from address lookup; default to market timezone if unknown.
- **Rate limits**: max 1 autonomous SMS per contact per 72h; max 4 autonomous touches (any channel) per partner per 14 days. Rep manual sends are not rate-limited but should warn if approaching limit.

### 7.6 Performance targets

- List views: first meaningful paint < 1.5s on seeded dataset of 10k partners
- Partner detail: < 800ms
- Radar dashboard: widgets stream independently (Suspense boundaries); skeleton on first render
- Mobile: React Query stale-while-revalidate; optimistic updates on common mutations (stage change, task complete, comment add)
- Pagination: cursor-based, default page 50, max 200

### 7.7 Security

- HTTPS only, HSTS preload, strict CSP, secure + SameSite cookies
- All secrets in env vars; `.env.example` committed with placeholder keys
- Encryption at rest for: OAuth refresh tokens, Apple app-specific passwords, Twilio / Resend / Storm API keys, Google API keys (AES-256-GCM via `@noble/ciphers`, key from `ENCRYPTION_KEY` env)
- Input validation: Zod everywhere; reject at edge
- Rate limiting (Upstash): auth (5/15min), scrape-trigger (10/hr per user), AI drafts (60/hr per user), webhooks (standard Twilio signature verification)
- Dependency scanning: `pnpm audit` in CI, fail on high/critical
- File upload: virus scan via ClamAV in an Inngest step before marking file available; max size 25 MB per file; allowed types whitelist
- PII handling: never log partner contact details; redact from Sentry via `beforeSend`

### 7.8 Observability

- **Logging**: Pino server-side, structured JSON, log levels per env
- **Errors**: Sentry on web, mobile, server; PII scrubbed
- **Metrics**: OpenTelemetry; key business metrics (partners activated, autonomous messages sent, scrape success rate, route planning avg duration) written to a `MetricSnapshot` table + exported to Sentry/Grafana
- **Uptime**: external monitor (BetterStack or UptimeRobot) hitting `/api/health` every 1 min

### 7.9 Testing strategy

- **Unit (Vitest)**: all business logic in `packages/api/src/**`, permission checker, approval engine, tone extraction, scrape normalization, dedup hasher. Target: 80% coverage on packages/api.
- **Integration (Vitest)**: tRPC procedures with in-memory Prisma or a test Postgres. Cover each role × each procedure = small matrix.
- **E2E web (Playwright)**: 5 flagship flows — login, create partner end-to-end, activate partner (balloons!), plan hit list, review+approve scraped leads.
- **E2E mobile (Maestro)**: login, partner list + detail, receipt capture, voice note, hit list execution.
- **CI gates**: lint + typecheck + unit + integration pass on every PR. E2E runs on main before deploy.

### 7.10 Deployment

- **Web**: Vercel, main branch auto-deploys to prod, PRs get preview URLs
- **Mobile**: EAS Build. Internal testing on TestFlight + Play Internal. Production release is a manual step by Kirk.
- **DB migrations**: run via `prisma migrate deploy` in a pre-deploy step
- **Env vars**: documented in `.env.example`; managed in Vercel + EAS secrets
- **Feature flags**: simple `FeatureFlag` table + tRPC procedure; default on/off configurable per-user per-market by admin. Use this to roll out AI autonomy and scraping gradually.

### 7.11 Accessibility

- WCAG 2.1 AA as target
- All forms keyboard-navigable, visible focus rings
- Color is never the only information carrier (add icons/labels to status pills)
- Contrast ratios tested via automated axe-core in Playwright
- Screen-reader labels on icon-only buttons
- Respect `prefers-reduced-motion` (disable balloons → show a simple success toast instead when set)

### 7.12 Internationalization

- Not required for v1 (single-language, English, US formats)
- Use `Intl.NumberFormat`, `Intl.DateTimeFormat` throughout so i18n can be added later without refactor

---

## 8. Glossary

- **Activated**: partner has been promoted to Storm Cloud and is now sending referrals
- **Hit list**: the ordered stops a rep plans to visit in a day
- **Market**: a geographic region that scopes users and partners (e.g., Denver, CO)
- **Pipeline stage**: position of a partner in the prospecting funnel
- **Tone profile**: structured JSON describing a rep's writing style, used to prompt Claude
- **Cadence**: scheduled sequence of templated touches triggered by partner stage
- **Scrape job**: recurring configuration that pulls candidate leads from a source
- **Storm Cloud**: the company's existing operational CRM at app.storm.cloud

---

## 9. Open items (update in ASSUMPTIONS.md as resolved)

- Storm Cloud API URL, auth scheme, exact payload shapes — not yet available; adapter is mocked
- Storm Cloud SSO method — to be added when API lands
- Final branding: logo, favicon, brand color, company name for email footer
- Apple app-specific password capture flow — to be finalized in Phase 4
- Final balloon-animation library choice — evaluate `react-confetti-boom` vs `party-js`; pick in Phase 2
- Production APNs + FCM push certs — blocked on Kirk in Phase 11
- App Store + Play Store developer accounts — blocked on Kirk in Phase 11
- Production domain and DNS — blocked on Kirk before launch

---

## 10. Amendments

When a product decision changes mid-build, edit this file with a new entry below. Cowork should not silently deviate from SPEC.md; if it needs to, it asks Kirk and an amendment is recorded here.

### Amendment log

#### 2026-04-22 — A001: Deployment platform change (Vercel → Railway)
**Changed by:** Kirk (build kickoff)
**Sections affected:** §1 (Tech stack → Deployment), §7.10 (Deployment)
**Change:** Swap Vercel + Neon for Railway (web + Postgres). Rationale: Kirk already uses Railway and wants one platform for simpler billing. Implementation notes:
- Web runs in a Node container on Railway (standard Node runtime, not Vercel Edge)
- Database is Railway Postgres; connection string via `DATABASE_URL` env var; Neon-compatible (plain Postgres, so swap is one env var if ever needed)
- Deploy artifacts: `Dockerfile` + `railway.json` at repo root
- Avoid Vercel-specific features (ISR, Edge runtime, Vercel Analytics) so the container runs cleanly on Railway
- PR preview environments: use Railway's PR environments feature (enable in Railway project settings)
- Mobile deployment unchanged (EAS Build → TestFlight + Play Internal)

#### 2026-04-22 — A002: First-customer branding (Roof Technologies)
**Changed by:** Kirk (build kickoff)
**Sections affected:** §3.1 (Design tokens), §4 (Market seed data), §7.5 (Compliance)
**Change:** PartnerRadar's first deployment is for **Roof Technologies, LLC** (Kirk's roofing company in Wheat Ridge, CO). Product is designed to be white-labeled later when sold to other roofing/restoration companies through Storm Cloud.
- All tenant-specific strings (company name, address, phone, logo, default email from-address, default markets) live in `packages/config/src/tenant.ts` — swapping brands is a one-file change
- Seed company identity (CAN-SPAM footer, default email sender, default phone):
  - Company: Roof Technologies, LLC
  - Address: 4955 Miller St. Suite 202, Wheat Ridge, CO 80033
  - Phone: (855) 766-3001
  - Email: info@RoofTechnologies.com
  - Website: https://rooftechnologies.com
- Seed markets: Denver, CO (primary, Wheat Ridge HQ); Colorado Springs, CO (secondary plausible expansion; Kirk can edit in Admin > Markets)
- Storm Cloud's navy/blue design language (§3.1) is unchanged — Roof Tech's own brand colors do NOT override Storm's palette for v1; the tenant swap later only affects copy/logo/email footer, not the design system itself

#### 2026-04-22 — A003: Autonomy scope
**Changed by:** Kirk (build kickoff)
**Change:** Kirk approved "Full send — Phases 1–11 autonomous" build mode. Cowork ships all phases and commits frequently before pausing for review. Engineering decisions logged in STATUS.md + ASSUMPTIONS.md rather than blocking for approval. Exceptions still require Kirk: API key procurement, destructive ops, money decisions, tech-stack deviations, App Store / Play Store accounts, production DNS.

