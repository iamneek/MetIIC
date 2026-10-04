import { describe, expect, it } from 'vitest'
import { parseSignal, serializeSignal } from './signaling'

describe('parseSignal', () => {
  it('accepts a ready message', () => {
    expect(parseSignal({ type: 'ready' })).toEqual({ type: 'ready' })
  })

  it('accepts offer/answer with well-formed sdp', () => {
    const msg = parseSignal({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0...' } })
    expect(msg?.type).toBe('offer')
  })

  it('rejects offer without sdp', () => {
    expect(parseSignal({ type: 'offer' })).toBeNull()
    expect(parseSignal({ type: 'offer', sdp: { type: 'offer' } })).toBeNull()
  })

  it('accepts ICE candidate including end-of-candidates null', () => {
    expect(parseSignal({ type: 'ice', candidate: { candidate: 'c=...' } })?.type).toBe('ice')
    expect(parseSignal({ type: 'ice', candidate: null })?.type).toBe('ice')
  })

  it('rejects unknown types and junk', () => {
    expect(parseSignal({ type: 'hack' })).toBeNull()
    expect(parseSignal(null)).toBeNull()
    expect(parseSignal('nope')).toBeNull()
    expect(parseSignal(42)).toBeNull()
    expect(parseSignal({ type: 'end', reason: 123 })).toBeNull()
  })

  it('rejects oversized payloads', () => {
    const big = JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'x'.repeat(200 * 1024) } })
    expect(parseSignal(big)).toBeNull()
  })

  it('round-trips through serialize', () => {
    const msg = { type: 'answer' as const, sdp: { type: 'answer' as const, sdp: 'v=0' } }
    expect(parseSignal(serializeSignal(msg))).toEqual(msg)
  })
})
