# WebRTC connectivity troubleshooting

## How the connection is built

1. Both users join a private Supabase Broadcast channel `call:<call_id>`.
2. The `initiator` (the user who waited longer in the queue) sends the SDP
   offer once both sides report `ready`; the other answers.
3. ICE candidates trickle over the same channel; candidates received before
   the remote description are buffered and flushed after.
4. If the connection is not established within `VITE_CONNECTION_TIMEOUT_MS`
   (default 20 s), the UI shows a "Connection failed" state with a Next/retry
   path.

## Symptom: "Could not establish a connection in time"

| Likely cause | What to do |
| --- | --- |
| Symmetric NAT / corporate firewall | Configure TURN (`VITE_TURN_URL`, credentials). STUN alone cannot cross symmetric NATs. |
| UDP blocked | Same as above; TURN over UDP/TCP/443 is required. Self-host [coturn](https://github.com/coturn/coturn) or use a TURN provider. |
| Wrong ICE transport policy | Leave `VITE_ICE_TRANSPORT_POLICY=all` unless testing relay-only. |
| VPN / captive portal | Disable VPN and rejoin. |

## Symptom: no remote video, or frozen video

- Check both users actually granted camera permission (browser padlock icon).
- Try the camera toggle off/on. On "Next" the local preview persists because
  tracks are reused; "End", sign-out, and page unload stop all tracks.
- A black tile with "Camera off" means the peer disabled their camera — this is expected.

## Symptom: audio is silent

- The remote `<video>` element plays muted only for the local preview; the
  remote one is unmuted. Click the page once if the browser blocked autoplay.
- Check the mic toggle state on both sides and OS-level microphone permissions.

## Testing TURN-only behavior locally

```
VITE_ICE_TRANSPORT_POLICY=relay
VITE_TURN_URL=turn:your-turn-host:3478
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

Restart `npm run dev` after changing `.env`. Do **not** commit real TURN
credentials; prefer short-lived credentials delivered at runtime by a trusted
endpoint.

## Signaling debugging

All signaling is validated client-side (`src/lib/signaling.ts`). To inspect:

- Browser devtools → Network → WS → your Supabase realtime socket.
- Postgres `realtime.messages` retention is short; don't rely on it for audit.
- Ensure both browsers are signed in, verified, and not on the same account —
  self-matching is prevented by the pairing rules.

## "verify your email" loop

- Check spam. Use "Resend verification email".
- Confirm redirect URLs include `<site>/chat` in Supabase → Authentication →
  URL Configuration, and that "Confirm email" is enabled.

## Domain restriction errors

- `only @iic.com.np addresses...` — client-side check.
- `domain_not_allowed` — database trigger; fired even if the client check is
  bypassed, so a direct API signup is also rejected.
