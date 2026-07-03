// app/(marketing)/legal/privacy/page.tsx

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy policy' }

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: 3 July 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1. Who we are</h2>
        <p>
          TenureIQ is a property portfolio management service operated by Hydrogen
          Capital (&ldquo;HydrogenCap&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). You
          can contact us about anything in this policy at{' '}
          <a href="mailto:david@oxygen.rocks" className="text-primary underline-offset-4 hover:underline">
            david@oxygen.rocks
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Who the controller is</h2>
        <p>
          Two different roles apply under UK GDPR, depending on the data:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Your account data</strong> — your name, email address, sign-in
            records and billing details. Hydrogen Capital is the controller for this
            data.
          </li>
          <li>
            <strong>Data your organisation puts into TenureIQ</strong> — property,
            tenancy, financial and compliance records, including personal data about
            tenants. Your organisation (our customer) is the controller for this data;
            Hydrogen Capital acts as a processor on the organisation&apos;s
            instructions. If you are a tenant whose details appear in TenureIQ, your
            landlord or their managing organisation is the controller and should be
            your first point of contact.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3. What we store</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account data:</strong> name, email address, organisation
            membership and role, and authentication records.
          </li>
          <li>
            <strong>Portfolio data:</strong> properties, ownership entities, units,
            mortgages, valuations, transactions, maintenance jobs and compliance
            records entered by your organisation.
          </li>
          <li>
            <strong>Tenant personal data</strong> entered by your organisation:
            tenant names, contact details, tenancy terms and right-to-rent status.
          </li>
          <li>
            <strong>Documents</strong> your organisation uploads (certificates,
            statements, tenancy agreements), including text extracted from them by
            OCR to fill in fields automatically.
          </li>
          <li>
            <strong>Audit records:</strong> a log of who changed what and when, kept
            for accountability within your organisation.
          </li>
          <li>
            <strong>Billing data:</strong> subscription plan and payment status.
            Card details are held by Stripe, never by us.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4. AASC placements — what we deliberately do not store</h2>
        <p>
          TenureIQ includes a module for providers of asylum accommodation and
          support contracts (AASC). It is designed so that the identities of service
          users are <strong>never stored</strong>. The system records only the number
          of people placed at a property, together with placement dates and contract
          details. There is no field for a service user&apos;s name, reference number
          or any other identifying information, and we ask customers not to enter
          such information into free-text fields. This is a structural,
          privacy-by-design decision, not a configuration option.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5. Lawful bases</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Contract</strong> — we process account and billing data to provide
            the service you signed up for.
          </li>
          <li>
            <strong>Legitimate interests</strong> — we keep audit logs and security
            records to protect the service and our customers&apos; data, and we send
            service emails (such as compliance deadline reminders) that are part of
            the product itself.
          </li>
          <li>
            <strong>Legal obligation</strong> — we retain billing and tax records for
            as long as UK law requires.
          </li>
          <li>
            Where your organisation is the controller (tenant data), the organisation
            is responsible for establishing its own lawful basis — typically contract
            (managing the tenancy) and legal obligation (for example, right-to-rent
            checks under the Immigration Act 2014).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">6. Processors we use</h2>
        <p>We use a small number of sub-processors to run the service:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Supabase</strong> — database, authentication and file storage,
            hosted in a UK or EU region.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting.
          </li>
          <li>
            <strong>Stripe</strong> — subscription payments. Stripe handles card data
            directly; we never see card numbers.
          </li>
          <li>
            <strong>Resend</strong> — transactional email (sign-in links, compliance
            reminders, invitations).
          </li>
        </ul>
        <p>
          Where any of these providers transfer data outside the UK, transfers are
          protected by appropriate safeguards such as the UK International Data
          Transfer Agreement or the UK Addendum to the EU Standard Contractual
          Clauses.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">7. Your rights</h2>
        <p>Under UK GDPR you have the right to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>access the personal data we hold about you;</li>
          <li>have inaccurate data rectified;</li>
          <li>have your data erased (&ldquo;right to be forgotten&rdquo;);</li>
          <li>receive your data in a portable format;</li>
          <li>restrict or object to certain processing.</li>
        </ul>
        <p>
          For account data, email us and we will respond within one month. For tenant
          data, contact the organisation that manages your tenancy; we will assist
          them as their processor. You also have the right to complain to the
          Information Commissioner&apos;s Office (ICO) at{' '}
          <a href="https://ico.org.uk" className="text-primary underline-offset-4 hover:underline">
            ico.org.uk
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">8. Retention</h2>
        <p>
          Data is kept for as long as the organisation&apos;s account is active.
          Records deleted inside the product are soft-deleted — hidden from normal
          use but retained so the organisation&apos;s audit trail stays complete.
          When an organisation closes its account, its data is deleted, except for
          billing and tax records we are legally required to keep.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">9. Cookies</h2>
        <p>
          TenureIQ uses essential cookies only: a session cookie to keep you signed
          in and a cookie remembering which organisation you have selected. We do not
          use advertising or third-party analytics cookies, so there is no cookie
          consent banner to click through.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">10. Changes to this policy</h2>
        <p>
          If we make material changes, we will update this page and notify account
          owners by email. The date at the top shows the current version.
        </p>
      </section>
    </article>
  )
}
