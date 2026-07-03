import { LoginForm } from './_login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to TenureIQ</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you a one-time link to sign in.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
