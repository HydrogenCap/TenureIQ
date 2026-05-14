---
name: tenureiq-cron-and-reminders
description: Scheduled job and reminder pattern for TenureIQ. Use when building any cron job — compliance expiry reminders (M6), mortgage refinance window alerts, rent review reminders, HMO licence renewals, AASC contract break-clause windows, monthly investor statements. Encodes pg_cron usage, idempotency, BST/GMT handling, suppression rules, and the email provider abstraction. Cron is the kind of thing that silently breaks; this skill makes it observable and idempotent.
---

# TenureIQ Cron & Reminders

The reminder engine drives compliance value. Miss a gas safety expiry email and the user trusts the product less than a spreadsheet with a reminder column. This is also where things silently break — a cron that throws once and stops getting scheduled is a real risk.

## Architecture overview

```
pg_cron (Supabase)                            Email provider (Resend)
  │  every day at 07:00 Europe/London            ▲
  ▼                                              │
  enqueue_reminders()  ──→ reminders table  ──→ send_reminders()
  (pure SQL function)      (idempotent inserts)   (cron, every 10 min)
```

Two-stage design:

1. **Enqueue stage** (daily, 07:00 London) — a Postgres function selects items expiring at the right offsets and UPSERTs into a `reminders` table. Idempotent on `(related_kind, related_id, trigger_at::date)` so re-running the job creates no duplicates.
2. **Send stage** (every 10 min) — picks up reminders with `status='pending'` and `trigger_at <= now()`, calls the email provider, marks `sent_at`.

This separation matters because:
- Sending email is the unreliable part. If Resend is down, the enqueue keeps working.
- Manually re-running the send stage is safe (idempotency on `sent_at IS NULL`).
- The reminder table is auditable — you can answer "did we email Sarah about the gas safety on 12 March?"

## The schema

```prisma
model Reminder {
  id              String   @id @default(uuid()) @db.Uuid
  organisationId  String   @map("organisation_id") @db.Uuid

  // What is this reminder about
  relatedKind     String   @map("related_kind")  // compliance_item | mortgage_fix_end | hmo_licence_renewal | aasc_break_clause | rent_review | investor_statement
  relatedId       String   @map("related_id") @db.Uuid

  // Timing
  triggerAt       DateTime @map("trigger_at") @db.Timestamptz(6)
  daysUntilEvent  Int      @map("days_until_event")  // 90 | 60 | 30 | 14 | 7 | 0 | -7 (overdue)

  // Recipient + content
  recipientUserId String   @map("recipient_user_id") @db.Uuid
  channel         String   @default("email")
  subject         String
  bodyKey         String   @map("body_key")  // template id — body is rendered at send time
  bodyContext     Json     @map("body_context")  // values for template rendering

  // Lifecycle
  status          String   @default("pending")  // pending | sent | failed | suppressed | superseded
  sentAt          DateTime? @map("sent_at") @db.Timestamptz(6)
  errorMessage    String?  @map("error_message")
  providerMessageId String? @map("provider_message_id")
  attempts        Int      @default(0)

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  organisation    Organisation @relation(fields: [organisationId], references: [id])

  @@unique([relatedKind, relatedId, daysUntilEvent], name: "reminder_idempotency_key")
  @@map("reminders")
  @@index([organisationId])
  @@index([status, triggerAt])
}
```

The unique constraint on `(related_kind, related_id, days_until_event)` is the **idempotency anchor**. Re-running enqueue creates the same key → conflict → upsert with `do nothing` → no duplicate.

## The enqueue function (compliance example)

```sql
-- supabase/migrations/<ts>_enqueue_compliance_reminders.sql

create or replace function enqueue_compliance_reminders()
returns table(enqueued integer) as $$
declare
  reminder_offsets int[] := array[90, 60, 30, 14, 7, 0, -7];  -- days until expiry; negative = overdue
  v_offset int;
  v_count int := 0;
begin
  foreach v_offset in array reminder_offsets loop
    insert into reminders (
      organisation_id, related_kind, related_id, trigger_at, days_until_event,
      recipient_user_id, channel, subject, body_key, body_context, status
    )
    select
      ci.organisation_id,
      'compliance_item',
      ci.id,
      -- trigger at 07:30 London time on (expiry - offset days)
      (ci.expiry_date - (v_offset || ' days')::interval) + interval '7 hours 30 minutes' at time zone 'Europe/London',
      v_offset,
      om.user_id,
      'email',
      case
        when v_offset > 0 then 'Reminder: ' || ci.kind || ' expires in ' || v_offset || ' day' || case when v_offset = 1 then '' else 's' end
        when v_offset = 0 then 'Action needed: ' || ci.kind || ' expires today'
        else 'OVERDUE: ' || ci.kind || ' expired ' || abs(v_offset) || ' day' || case when v_offset = -1 then '' else 's' end || ' ago'
      end,
      'compliance_reminder',
      jsonb_build_object(
        'kind', ci.kind,
        'expiry_date', ci.expiry_date,
        'property_address', p.address_line_1,
        'property_postcode', p.postcode,
        'property_id', p.id,
        'days_until_event', v_offset
      ),
      -- Suppress weekends for 'expiring' reminders. Always send for 'expired' (overdue).
      case
        when v_offset > 0 and extract(isodow from (ci.expiry_date - (v_offset || ' days')::interval)) in (6, 7) then 'suppressed'
        else 'pending'
      end
    from compliance_items ci
    join properties p on p.id = ci.property_id
    join organisation_members om on om.organisation_id = ci.organisation_id
      and om.notify_compliance = true
      and om.accepted_at is not null
      and om.deleted_at is null
    where ci.deleted_at is null
      and ci.expiry_date is not null
      -- target date matches today's offset window
      and (ci.expiry_date - (v_offset || ' days')::interval)::date = current_date
      -- 14-day grace for new orgs (don't blast them with reminders on day one)
      and ci.organisation_id in (select id from organisations where created_at <= now() - interval '14 days')
    on conflict (related_kind, related_id, days_until_event) do nothing;

    get diagnostics v_count = row_count;
  end loop;

  return query select v_count;
end;
$$ language plpgsql security definer;

-- Schedule daily at 07:00 London
select cron.schedule(
  'enqueue-compliance-reminders',
  '0 7 * * *',   -- 07:00 UTC = 07:00 GMT / 08:00 BST. See note below.
  $$ select enqueue_compliance_reminders() $$
);
```

### About BST/GMT

`pg_cron` schedules in **UTC**. The simplest robust pattern is to schedule "at or just before 07:00 London" by running the job at the same UTC time year-round and accepting that the user sees the email at 07:00 in winter and 08:00 in summer.

If you need exactly 07:00 London regardless, schedule two crons disabled/enabled by date — too brittle. Better: schedule at 06:00 UTC, write 07:00 London-localised content (so the timestamp inside the email reads correctly), accept the 1-hour drift in send time.

The **`trigger_at` column itself** uses `at time zone 'Europe/London'` so the *target* moment is timezone-correct — only the cron firing has GMT/BST slop.

## The send stage

```ts
// app/api/cron/send-reminders/route.ts
import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db/admin'
import { sendEmail } from '@/lib/email/send'
import { renderReminderEmail } from '@/lib/email/templates'

export const maxDuration = 300

export async function POST(req: Request) {
  // Verify caller — pg_cron POSTs with a shared secret in a header
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const sb = supabaseService()

  // Lock-and-claim: select up to 100 pending reminders due now, mark them 'sending'
  const { data: due } = await sb.rpc('claim_pending_reminders', { p_limit: 100 })

  let sent = 0
  let failed = 0
  for (const reminder of due ?? []) {
    try {
      const { subject, html, text } = renderReminderEmail(reminder.body_key, reminder.body_context)
      const result = await sendEmail({
        to: reminder.recipient_email,
        subject,
        html,
        text,
        replyTo: 'noreply@tenureiq.com',
        tags: { kind: reminder.related_kind, offset: String(reminder.days_until_event) },
      })

      await sb.from('reminders').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: result.messageId,
      }).eq('id', reminder.id)
      sent++
    } catch (err) {
      await sb.from('reminders').update({
        status: 'failed',
        error_message: String(err),
        attempts: (reminder.attempts ?? 0) + 1,
      }).eq('id', reminder.id)
      failed++
    }
  }

  return NextResponse.json({ sent, failed })
}
```

And the SQL claim function:

```sql
create or replace function claim_pending_reminders(p_limit int default 100)
returns setof reminders as $$
  with claimed as (
    select id from reminders
    where status = 'pending'
      and trigger_at <= now()
      and attempts < 3
    order by trigger_at
    limit p_limit
    for update skip locked
  )
  update reminders r
  set status = 'sending', attempts = r.attempts + 1
  from claimed c
  where r.id = c.id
  returning r.*;
$$ language sql security definer;
```

`for update skip locked` is the key — multiple cron invocations won't double-claim. `attempts < 3` caps retries.

## The email provider abstraction

```ts
// lib/email/send.ts
import 'server-only'

type SendArgs = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  tags?: Record<string, string>
}

export type SendResult = { messageId: string }

// Resend (default), can swap by env
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const provider = process.env.EMAIL_PROVIDER ?? 'resend'
  switch (provider) {
    case 'resend': return sendResend(args)
    case 'postmark': return sendPostmark(args)
    case 'console': return sendConsole(args)  // dev only
    default: throw new Error(`Unknown email provider: ${provider}`)
  }
}

async function sendResend(args: SendArgs): Promise<SendResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TenureIQ <reminders@tenureiq.com>',
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: args.replyTo,
      tags: args.tags ? Object.entries(args.tags).map(([name, value]) => ({ name, value })) : undefined,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return { messageId: json.id }
}

async function sendPostmark(args: SendArgs): Promise<SendResult> {
  // implementation analogous
  throw new Error('Postmark not implemented')
}

async function sendConsole(args: SendArgs): Promise<SendResult> {
  console.log('[EMAIL]', args.to, '|', args.subject)
  console.log(args.text)
  return { messageId: 'console-' + Date.now() }
}
```

In development: `EMAIL_PROVIDER=console`. The send loop runs identically; emails just log instead of go out.

## Suppression rules

Three layers:

1. **Per-event-type suppression** (in `enqueue_*` functions): skip weekends for "expiring" reminders, always send for "expired" (overdue is urgent).
2. **Per-user preferences** (on `organisation_members.notify_*` flags): each member can opt out of compliance / refinance / AASC / financial reminders independently.
3. **Per-org grace period**: 14 days after `organisations.created_at` before chasing missing certs. Avoids onboarding-day reminder flood.

## Superseding

If a user uploads a new gas safety certificate while a "30 days to expiry" reminder is pending, the new cert pushes the expiry forward. The old reminder is no longer correct.

Handle in the `compliance_items` AFTER UPDATE trigger:

```sql
create or replace function supersede_reminders_on_compliance_change()
returns trigger as $$
begin
  if new.expiry_date is distinct from old.expiry_date then
    update reminders
    set status = 'superseded'
    where related_kind = 'compliance_item'
      and related_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger compliance_items_supersede_reminders
after update on compliance_items
for each row execute function supersede_reminders_on_compliance_change();
```

Then the next enqueue cycle creates fresh reminders against the new expiry date.

## Calling the cron — pick one

### Option A: `pg_cron` direct → Edge Function

Schedule `pg_cron` to call a Supabase Edge Function that calls your `/api/cron/send-reminders` endpoint. Edge Functions in same region keep latency low.

### Option B: External scheduler (Vercel Cron, EasyCron, GitHub Actions cron)

Schedule the external service to POST to `/api/cron/send-reminders` with the secret header. Simplest if you're on Vercel — Vercel Cron is one line of config.

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/send-reminders", "schedule": "*/10 * * * *" }
  ]
}
```

Vercel Cron is the recommended default for v1 — zero infrastructure, observable in the Vercel dashboard.

## Observability

Every cron run should write a row to a `cron_run_log` table:

```sql
create table cron_run_log (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',  -- running | success | failed
  rows_processed int,
  error_message text
);
```

The `/api/cron/send-reminders` handler writes a row on start, updates on completion. If a cron silently stops running, the gap in `cron_run_log` is the only signal you'll get — a daily Slack message of "cron ran X times, processed Y reminders" prevents the silent-break failure mode.

## Anti-patterns

1. **Idempotency on `id` instead of business key.** Re-running enqueue with `id` as the dedupe key just creates new ids. Always dedupe on the natural business identity.
2. **Cron firing in UTC but body content showing UTC times.** Render times in `Europe/London` in the email body — the user doesn't care that the server lives in `us-east-1`.
3. **Send-and-forget with no `cron_run_log`.** When the cron breaks (and it will), there's no signal until a user complains.
4. **Catching all errors per-batch.** If one reminder fails, mark that one failed and continue — don't fail the whole batch.
5. **Retrying forever on a failed send.** Cap at 3 attempts, then human review. Most "send failed" reasons are permanent (invalid email, bounced).
6. **Calculating "next service date" in cron.** Domain logic lives in `lib/domain/`, not in cron SQL. The enqueue function should read `expiry_date` columns that another process maintained.
7. **One generic "reminder" email template.** Each reminder kind has its own template with appropriate tone — compliance is "act now", investor statement is "here is your quarterly", AASC break clause is "the contract window opens in 60 days".
