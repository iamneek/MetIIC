import { describe, expect, it } from 'vitest'
import { blockBoth, matchmake, type World } from './matchmakingModel'

function newWorld(): World {
  return { queue: new Map(), calls: new Map(), userCall: new Map(), blocks: new Set(), now: 0 }
}

function checkInvariants(w: World, users: string[]) {
  // no user is in two active calls
  for (const [callId, c] of w.calls) {
    expect(c.a).not.toBe(c.b)
    expect(w.userCall.get(c.a)).toBe(callId)
    expect(w.userCall.get(c.b)).toBe(callId)
    expect(isBlockedSafe(w, c.a, c.b)).toBe(false)
  }
  // every userCall reference is a real call
  for (const [u, callId] of w.userCall) {
    expect(w.calls.has(callId)).toBe(true)
    expect(users).toContain(u)
  }
  // nobody waiting is also in a call
  for (const u of w.queue.keys()) {
    expect(w.userCall.has(u)).toBe(false)
  }
}

function isBlockedSafe(w: World, a: string, b: string) {
  return w.blocks.has(`${a}|${b}`)
}

describe('matchmaking pairing invariants (model of matchmake SQL)', () => {
  it('never self-matches', () => {
    const w = newWorld()
    expect(matchmake(w, 'a')).toBe('waiting')
    expect(matchmake(w, 'a')).toBe('waiting') // re-join should replace, and must not match itself
    expect(w.userCall.size).toBe(0)
  })

  it('pairs two distinct users with one call id', () => {
    const w = newWorld()
    matchmake(w, 'a')
    const r = matchmake(w, 'b')
    expect(typeof r).toBe('object')
    expect(w.calls.size).toBe(1)
  })

  it('excludes blocked pairs in both directions', () => {
    const w = newWorld()
    blockBoth(w, 'a', 'b')
    matchmake(w, 'a')
    expect(matchmake(w, 'b')).toBe('waiting')
    expect(w.calls.size).toBe(0)
  })

  it('does not match users already in a call', () => {
    const w = newWorld()
    matchmake(w, 'a')
    matchmake(w, 'b') // a+b matched
    expect(matchmake(w, 'a')).toBe('in_call')
    matchmake(w, 'c')
    expect(typeof matchmake(w, 'd')).toBe('object')
    expect(w.calls.size).toBe(2)
  })

  it('expired queue entries cannot be matched', () => {
    const w = newWorld()
    matchmake(w, 'a')
    w.now = 61_000 // a's entry expired (60s TTL)
    const r = matchmake(w, 'b')
    expect(r).toBe('waiting') // b matched with nobody
    expect(w.calls.size).toBe(0)
  })

  it('holds invariants over randomized interleavings', () => {
    let seed = 1234567
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const users = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    for (let iter = 0; iter < 50; iter++) {
      const w = newWorld()
      blockBoth(w, 'c', 'd')
      for (let step = 0; step < 200; step++) {
        const u = users[Math.floor(rand() * users.length)]
        w.now += Math.floor(rand() * 5_000)
        matchmake(w, u)
        checkInvariants(w, users)
      }
    }
  })
})
