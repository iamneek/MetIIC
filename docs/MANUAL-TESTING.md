# Manual two-browser testing checklist

Automated camera testing is not practical; use two real browser profiles (or
one real browser + one incognito), each with its own verified `@iic.edu.np`
account, on the same network if possible, and ideally behind typical home NATs.

## Setup

- [ ] `npm run dev` running; `.env` points at a Supabase project with migrations applied.
- [ ] Both accounts exist, are email-verified, and are not suspended.

## Gatekeeping

- [ ] Sign-up with `student@gmail.com` is rejected with a clear message.
- [ ] Sign-up with `student@fakeiic.edu.np` / `...@iic.edu.np.attacker.com` is rejected.
- [ ] Directly POSTing a signup for a non-iic.edu.np email fails (DB trigger).
- [ ] An unverified account signing in is told to verify email; calling `matchmake` fails.

## Matchmaking & call

- [ ] A clicks Start, sees "Waiting for another student…".
- [ ] B clicks Start; both are paired (same call id visible in devtools), both see
      the peer within ~5 s on STUN-capable networks.
- [ ] Both sides can see and hear; local preview is mirrored, remote video is not.
- [ ] Mic toggle mutes/unmutes; camera toggle shows the placeholder, no black box.
- [ ] "Next" on A ends the old call cleanly (old pc closed, old channel removed),
      and A is re-queued without a duplicate row (`match_queue` has ≤1 row per user).
- [ ] "End" returns both to idle; the peer's UI shows the call ended.
- [ ] Refresh mid-call: on reload, `my_state()` re-enters the call flow on both sides.

## Moderation

- [ ] Report submits; row appears in `reports`; rate limit blocks >10/hour.
- [ ] Block inserts a `blocks` row, ends the call, and neither user is matched
      with the other afterwards (both directions).

## Security spot-checks

- [ ] With the anon key, `supabase.from('profiles').select()` returns only your row.
- [ ] Subscribing to `call:<other-call-id>` receives nothing (RLS).
- [ ] No service-role key appears in the built bundle: `grep -ri "service_role" dist/` finds nothing.

## Networking matrix (best effort)

- [ ] Two browsers, same Wi-Fi: call connects (host candidates).
- [ ] Two different networks: call connects if NATs allow; otherwise configure TURN
      and retest. Document results in your course report.
