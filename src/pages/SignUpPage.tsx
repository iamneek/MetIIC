import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { emailValidationMessage, ALLOWED_DOMAIN } from '../lib/domain'
import { APP_NAME } from '../lib/config'

export function SignUpPage() {
  const { signUp, resendVerification } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resendStatus, setResendStatus] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validation = emailValidationMessage(email)
    if (validation) {
      setError(validation)
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setError(null)
    setBusy(true)
    const err = await signUp(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
    else setDone(true)
  }

  if (done) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Check your inbox</h1>
          <p className="mt-3 text-sm text-ink/70">
            We sent a verification link to <strong>{email.trim()}</strong>. Verify it to start using
            {' '}{APP_NAME}. The link may take a minute and can expire — request a new one if needed.
          </p>
          <button
            className="mt-5 rounded-full border border-ink/15 px-4 py-2 text-sm"
            onClick={async () => {
              const err = await resendVerification(email.trim())
              setResendStatus(err ? err : 'Verification email sent again.')
            }}
          >
            Resend verification email
          </button>
          {resendStatus && <p className="mt-3 text-sm text-ink/60">{resendStatus}</p>}
          <p className="mt-5 text-sm text-ink/60">
            <Link className="underline" to="/sign-in">Back to sign in</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-full place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-ink/60">
          {APP_NAME} is restricted to addresses on <code>@{ALLOWED_DOMAIN}</code>.
        </p>
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2.5"
          />
        </label>
        <label className="block text-sm">
          Password (min 8 characters)
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2.5"
          />
        </label>
        {email && emailValidationMessage(email) && (
          <p className="text-xs text-ink/50">{emailValidationMessage(email)}</p>
        )}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-cream disabled:opacity-50">
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="text-sm text-ink/60">
          Already registered? <Link className="underline" to="/sign-in">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
