// app/(marketing)/legal/terms/page.tsx

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of service' }

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
        <p className="text-sm text-muted-foreground">Last updated: 3 July 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1. Agreement</h2>
        <p>
          These terms govern the use of TenureIQ, a property portfolio management
          service operated by Hydrogen Capital (&ldquo;HydrogenCap&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the
          service you agree to them on behalf of yourself and, where applicable, the
          organisation you represent. Questions:{' '}
          <a href="mailto:david@oxygen.rocks" className="text-primary underline-offset-4 hover:underline">
            david@oxygen.rocks
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. The service</h2>
        <p>
          TenureIQ provides software for managing UK residential property portfolios:
          properties, ownership entities, tenancies, mortgages, valuations,
          transactions, compliance tracking with reminders, document storage with
          OCR, maintenance tracking, AASC placement workflow, investor capital
          accounts and PDF reporting. Features available to your organisation depend
          on the subscription plan you choose.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3. Accounts and responsibilities</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            You must provide accurate account information and keep access to your
            sign-in email secure. Sign-in is by emailed one-time link, so your email
            account is the key to your TenureIQ account.
          </li>
          <li>
            Organisation owners are responsible for who they invite and what roles
            they grant. Actions taken by members of your organisation are your
            organisation&apos;s responsibility.
          </li>
          <li>
            You are responsible for the accuracy and lawfulness of the data your
            organisation enters, including having a lawful basis for storing tenant
            personal data.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            use the service unlawfully, or to store data you have no right to
            process;
          </li>
          <li>
            enter the names, reference numbers or other identifying details of asylum
            service users anywhere in the service, including free-text fields — the
            AASC module is designed to hold occupancy counts only;
          </li>
          <li>
            attempt to access other organisations&apos; data, probe or circumvent
            security controls, or resell access to the service without our written
            agreement;
          </li>
          <li>upload malicious content or use the service to send spam.</li>
        </ul>
        <p>
          We may suspend accounts that breach these rules, giving notice where
          reasonably possible.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5. Subscriptions and billing</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            New organisations start on a 14-day trial of the Growth plan with no
            payment card required. When the trial ends, you may subscribe to a paid
            plan or continue on the free tier within its limits.
          </li>
          <li>
            Paid subscriptions are billed monthly in advance through Stripe. Prices
            and plan limits are shown on the pricing page and in billing settings.
          </li>
          <li>
            You can upgrade, downgrade or cancel at any time through the billing
            settings; changes to paid plans are handled by the Stripe customer
            portal. Cancellation takes effect at the end of the current billing
            period, after which the organisation moves to the free tier.
          </li>
          <li>
            If a payment fails, we will retry and notify you; while payment is past
            due, the account is read-only until payment is resolved.
          </li>
          <li>We may change prices with at least 30 days&apos; notice by email.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">6. Your data</h2>
        <p>
          Your organisation owns the data it enters into TenureIQ. We process it only
          to provide the service, as described in our privacy policy, and we do not
          sell it or use it for advertising. You can export your data while your
          account is active, and we will delete it when your organisation closes its
          account, subject to legally required retention of billing records.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">7. Not professional advice</h2>
        <p>
          TenureIQ is a record-keeping and calculation tool. It does not provide
          legal, financial, tax or regulatory advice. In particular:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Compliance reminders are an aid to memory, not a guarantee. You remain
            solely responsible for meeting statutory duties such as gas safety
            checks, electrical inspections, energy performance requirements, HMO
            licensing and right-to-rent checks, whether or not the service reminds
            you.
          </li>
          <li>
            Financial figures such as equity, loan-to-value, interest cover and
            refinance models are calculated from the data you enter and are
            indicative only. Verify them with your lender, accountant or adviser
            before making decisions.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">8. Availability</h2>
        <p>
          We aim to keep the service available at all times but do not guarantee
          uninterrupted operation. We may perform maintenance, and we will give
          notice of planned downtime where practicable. You should keep independent
          copies of documents that are critical to your business.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">9. Liability</h2>
        <p>
          Nothing in these terms excludes liability that cannot be excluded under
          English law, including liability for death or personal injury caused by
          negligence, or for fraud. Subject to that, we are not liable for indirect
          or consequential loss, loss of profit, or losses arising from decisions
          made in reliance on figures or reminders produced by the service; and our
          total liability arising out of the service in any 12-month period is
          limited to the fees your organisation paid to us in that period.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">10. Termination</h2>
        <p>
          You may close your organisation&apos;s account at any time. We may
          terminate or suspend the service for material breach of these terms that
          remains unremedied after notice, or if required by law. On closure, data
          is handled as described in section 6 and the privacy policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">11. Changes to these terms</h2>
        <p>
          We may update these terms as the service evolves. For material changes we
          will give at least 30 days&apos; notice by email; continued use after the
          notice period means acceptance. The date at the top shows the current
          version.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">12. Governing law</h2>
        <p>
          These terms are governed by the law of England and Wales, and the courts of
          England and Wales have exclusive jurisdiction over any dispute arising from
          them or the service.
        </p>
      </section>
    </article>
  )
}
