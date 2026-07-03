# TenureIQ — production deployment runbook

Target: Vercel (app + cron) + Supabase (Postgres, Auth, Storage) +
Stripe (billing) + Resend (email) + Sentry (errors). Steps marked
**[you]** need account access and must be done by a human; everything
else is copy-paste.

## 1. Supabase production project **[you]**

1. Create a project at supabase.com — choose the **London (eu-west-2)**
   region (the privacy policy states UK/EU hosting).
2. Note from Project Settings → API: the project URL, `anon` key and
   `service_role` key.
3. Settings → Database: note the connection strings. You need both the
   **pooled** URL (port 6543, for `DATABASE_URL`) and the **direct**
   URL (port 5432, for `DIRECT_URL`).

### Apply the schema

Pick ONE applier and stick with it (both trees are byte-identical;
applying both to one database fails on duplicates). Recommended: the
Supabase CLI, since the Supabase GitHub integration (already installed
on the repo — it runs on every PR) uses `supabase/migrations/`.

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push          # applies supabase/migrations/*.sql in order
```

### Post-migration, run once in the SQL editor

```sql
-- pg_cron schedule for the reminder engine (see scripts/pg_cron_schedule.sql)
-- Enable the pg_cron extension first: Dashboard → Database → Extensions.
select cron.schedule('enqueue-compliance-reminders', '0 4 * * *',
                     $$select enqueue_compliance_reminders()$$);
```

### Auth settings **[you]**

- Authentication → URL Configuration: Site URL = `https://<your-domain>`,
  and add `https://<your-domain>/auth/callback` to the redirect list.
- Authentication → Email Templates → Magic Link: point the link at the
  token-hash route so SSR cookie auth works on every device:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
- SMTP: configure custom SMTP (Resend supports SMTP) so auth emails come
  from your domain rather than supabase.io.

## 2. Resend **[you]**

1. Create an API key at resend.com; verify your sending domain
   (SPF + DKIM records).
2. Decide the from address, e.g. `TenureIQ <notifications@your-domain>`.

## 3. Stripe **[you]**

1. Create three recurring monthly Prices matching `lib/billing/plans.ts`
   (Starter £49, Growth £149, Pro £399) and note the `price_...` ids.
2. Developers → Webhooks: add endpoint
   `https://<your-domain>/api/webhooks/stripe` with events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Note the `whsec_...` signing secret.

## 4. Sentry **[you]**

Create a Next.js project at sentry.io; note the DSN. (Source-map upload
is disabled in the build config — add `SENTRY_AUTH_TOKEN` and re-enable
in next.config.ts later if you want readable stack traces.)

## 5. Vercel **[you]**

1. Import the GitHub repo; framework preset Next.js; build command
   `pnpm build` (default detection is fine).
2. vercel.json already registers the cron: `/api/cron/send-reminders`
   every 10 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET`
   automatically when the env var exists.
3. Set the production environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | pooled Supabase connection string (`...:6543/postgres?pgbouncer=true`) |
| `DIRECT_URL` | direct connection string (`...:5432/postgres`) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `NEXT_PUBLIC_SUPABASE_URL` | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` |
| `CRON_SECRET` | `openssl rand -hex 24` (≥16 chars; cron route refuses without it in prod) |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | `TenureIQ <notifications@your-domain>` |
| `RESEND_API_KEY` | from step 2 |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_STARTER_MONTHLY` / `_GROWTH_` / `_PRO_` | `price_...` ids |
| `NEXT_PUBLIC_SENTRY_DSN` | from step 4 (optional — everything no-ops without it) |

4. Add your custom domain; Vercel provisions TLS.

## 6. Post-deploy smoke test

1. Visit `/` (landing), `/pricing`, `/legal/privacy` — public.
2. Sign up with a magic link → onboarding → create an organisation.
3. Create an entity + property; confirm the dashboard tiles update.
4. Settings → Members: invite a second email; confirm the email arrives
   (Resend dashboard shows the send).
5. Trigger a deliberate error (visit a garbage `/properties/<uuid>`)
   and check nothing leaks a stack trace; check Sentry received events
   if DSN configured.
6. `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/send-reminders`
   → 200 with a JSON result; check `/admin/cron-log` as an owner.

## 7. Backups

- Supabase: Database → Backups — daily automatic backups on Pro plan;
  enable PITR if the budget allows. Document the restore drill: create
  a branch/staging project from a backup quarterly and boot the app
  against it.
- Configuration state that is NOT in the database: Vercel env vars
  (export a copy to a password manager), Stripe products/webhooks,
  Supabase auth settings. Re-creatable from this runbook.

## 8. Operational notes

- The reminder engine needs BOTH halves: pg_cron enqueues (step 1),
  the Vercel cron sends. `/admin/cron-log` (owner only) shows runs.
- The Supabase GitHub integration applies NEW migration files on merge
  to the production branch if you enable "production branch" in the
  integration settings — otherwise run `supabase db push` per release.
- Never hand out the service_role key; it bypasses RLS.
