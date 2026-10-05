/**
 * In-memory reference implementation of the pairing rules enforced by the
 * `matchmake` Postgres function. Kept rule-for-rule identical so the fuzz
 * test below validates the same invariants the database guarantees.
 */
export interface World {
  queue: Map<string, { createdAt: number; expiresAt: number }>
  calls: Map<string, { a: string; b: string; status: string }>
  userCall: Map<string, string>
  blocks: Set<string> // "a|b" both directions added by blockBoth
  now: number
  callCounter?: number
}

export function blockBoth(w: World, a: string, b: string) {
  w.blocks.add(`${a}|${b}`)
  w.blocks.add(`${b}|${a}`)
}

export function isBlocked(w: World, a: string, b: string) {
  return w.blocks.has(`${a}|${b}`)
}

export function endCall(w: World, callId: string) {
  const call = w.calls.get(callId)
  if (call) {
    w.userCall.delete(call.a)
    w.userCall.delete(call.b)
    w.calls.delete(callId)
  }
}

export function matchmake(w: World, uid: string): 'waiting' | { matched: string } {
  // lazy expiry
  for (const [u, q] of w.queue) if (q.expiresAt <= w.now) w.queue.delete(u)

  // auto-heal: if this user was already in a call, cleanly end it
  if (w.userCall.has(uid)) {
    const oldCallId = w.userCall.get(uid)!
    endCall(w, oldCallId)
  }

  const partner = [...w.queue.entries()]
    .filter(
      ([u]) =>
        u !== uid &&
        !w.userCall.has(u) &&
        !isBlocked(w, uid, u),
    )
    .sort((a, b) => a[1].createdAt - b[1].createdAt)[0]

  if (!partner) {
    w.queue.set(uid, { createdAt: w.now, expiresAt: w.now + 60_000 })
    return 'waiting'
  }

  w.queue.delete(partner[0])
  w.queue.delete(uid)
  w.callCounter = (w.callCounter ?? 0) + 1
  const id = `call-${w.callCounter}`
  w.calls.set(id, { a: partner[0], b: uid, status: 'matched' })
  w.userCall.set(partner[0], id)
  w.userCall.set(uid, id)
  return { matched: id }
}
