import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/config'

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16 text-center">
        <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Meet a fellow iic.com.np student, anonymously.
        </h1>
        <p className="max-w-md text-base text-ink/60">
          Random one-on-one video chat, restricted to verified @iic.com.np students. No profiles,
          no recordings, no sharing of your email.
        </p>
        <div className="flex gap-3">
          <Link
            to="/sign-up"
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Get started
          </Link>
          <Link
            to="/sign-in"
            className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Sign in
          </Link>
        </div>
        <section className="mt-8 max-w-lg text-left text-xs leading-relaxed text-ink/50">
          <p>
            By using {APP_NAME} you agree to be respectful. Harassment, spam, and inappropriate
            behavior are grounds for suspension. Be kind, stay safe, and never share personal
            details you would not share with a stranger.
          </p>
        </section>
      </main>
    </div>
  )
}
