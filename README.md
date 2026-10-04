# Campus Connect

Anonymous, one-on-one random video chat for verified `@iic.com.np` students.
React + TypeScript + Vite + Tailwind frontend, Supabase (Auth/Postgres/Realtime)
for accounts, matchmaking, and WebRTC signaling, and direct browser-to-browser
WebRTC for media.

## Quick start

```bash
npm install
cp .env.example .env        # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

```bash
npm run typecheck           # tsc --noEmit
npm test                    # vitest
npm run build               # production build into dist/
```

## Supabase setup

1. Create a project at https://supabase.com (free tier works).
2. Install the Supabase CLI and link: `supabase link --project-ref <ref>`.
3. Push migrations: `supabase db push` (or paste `supabase/migrations/*.sql`
   into the SQL editor in order).
4. In **Authentication → Providers → Email**, keep "Confirm email" enabled.
5. In **Authentication → URL Configuration**, set Site URL to your deploy
   URL and add `<your-url>/chat` to the redirect URLs.
6. Copy Project URL and `anon` public key into `.env`.
7. Never use the `service_role` key anywhere in the frontend.

The database itself rejects signups whose email is not exactly `@iic.com.np`
(database trigger on `auth.users`, case-insensitive), and `matchmake()` rejects
unverified or suspended accounts — so forging API calls cannot bypass the
domain restriction.

## Architecture

- `src/state/AuthContext.tsx` — session + profile + sign-in/up/out.
- `src/hooks/useLocalMedia.ts` — getUserMedia, mic/camera toggles, cleanup.
- `src/hooks/useMatchmaking.ts` — queue join via `matchmake()`, 4 s value
  polling plus a `postgres_changes` subscription while waiting.
- `src/hooks/useCall.ts` — one `RTCPeerConnection` + one private Realtime
  broadcast channel per call; deterministic initiator-offers negotiation;
  ICE candidate buffering; connection timeout; full teardown on end/Next.
- `src/lib/domain.ts` — strict email-domain validation (unit-tested).
- `src/lib/signaling.ts` — validated, size-capped signaling messages.
- `supabase/migrations/` — schema, RLS, security-definer RPCs, Realtime
  message authorization.

Signaling uses Supabase Realtime **private Broadcast channels** (`call:<id>`)
authorized by RLS policies on `realtime.messages`: only the two participants
of a live call can publish or subscribe. Media never touches Supabase.

### Matchmaking invariants (why it is safe under concurrency)

- The caller's profile row is locked (`FOR UPDATE`) inside `matchmake()`,
  serializing that user's concurrent matchmake attempts.
- The chosen partner's profile row is likewise locked before the call row is
  inserted, so the partner cannot simultaneously be matched elsewhere.
- Partner lookup takes `FOR UPDATE SKIP LOCKED` on the queue row, so two
  matchers can never claim the same waiting user.
- `match_queue.user_id` is a primary key: one active queue row per user.
- Blocked pairs are excluded in both directions; stale rows (>60 s TTL,
  extended by `heartbeat()`) are lazily deleted and never matched.
- Every match creates one call with exactly two participants and one role each.

## Privacy

- Strangers never see your email or any public profile.
- No call recording, no screenshots, no analytics, no media storage.
- Call metadata (ids, statuses, timestamps) and report records are kept for
  abuse handling; signaling (SDP/ICE) is ephemeral and not persisted.
- WebRTC media is encrypted in transit (DTLS-SRTP); this is not a guarantee
  beyond the configured transport unless a trusted TURN/TLS context is used.

## STUN/TURN

Defaults to two public Google STUN servers. STUN alone does **not** guarantee
connectivity — symmetric NATs/firewalls need TURN. Set `VITE_TURN_URL`,
`VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (or fetch short-lived
credentials at runtime from a trusted endpoint) and keep
`VITE_ICE_TRANSPORT_POLICY=relay` while testing TURN-only mode. See
`docs/WEBRTC-TROUBLESHOOTING.md`.

## Free-tier notes

- Frontend: Cloudflare Pages (`npm run build`, publish `dist/`).
- Supabase free tier covers Postgres, Auth, and Realtime at MVP scale.
- No always-on custom server is required.

### Cloudflare Pages deployment

1. Push this repo to GitHub/GitLab.
2. Cloudflare Pages → Create project → connect the repo.
3. Build command: `npm run build`. Output directory: `dist`.
4. Add environment variables from `.env.example` in the Pages project settings
   (Production + Preview). Never add the service-role key.
5. Set Supabase **Authentication → URL Configuration**: Site URL = your
   `*.pages.dev` URL (or custom domain), and add `<url>/chat` to Redirect URLs.
6. Optional custom domain: Pages → Custom domains → point your DNS; then update
   the Supabase site URL accordingly.

Always verify env values at build time — Vite inlines `VITE_*` variables into
the bundle, so redeploy after changing them.

## Manual two-browser checklist

See `docs/MANUAL-TESTING.md`.

## Reporting / moderation

Reports store call id, reporter, reported user, reason, optional ≤500-char
details, timestamp. Private to moderators (query with the service-role key via
SQL, never exposed to clients). Suspensions: set `profiles.suspended = true`.
Duplicate-action protection: client-side busy guards + server-side rate limits
(4 matchmakes/10 s, 10 reports/hour per account).

## Troubleshooting

See `docs/WEBRTC-TROUBLESHOOTING.md`.
