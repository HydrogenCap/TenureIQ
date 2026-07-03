// app/global-error.tsx — root error boundary. Renders its own <html> per Next.js docs.
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en-GB">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            fontFamily: 'system-ui, sans-serif',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            An unexpected error occurred. Please try again.
            {error.digest ? ` Reference: ${error.digest}` : null}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              background: 'transparent',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
