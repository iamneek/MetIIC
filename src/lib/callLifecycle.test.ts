import { describe, expect, it } from 'vitest'
import { canTransition, assertTransition, isLive } from './callLifecycle'

describe('call lifecycle', () => {
  it('follows the happy path waiting->matched->connecting->connected->ended', () => {
    expect(canTransition('waiting', 'matched')).toBe(true)
    expect(canTransition('matched', 'connecting')).toBe(true)
    expect(canTransition('connecting', 'connected')).toBe(true)
    expect(canTransition('connected', 'ending')).toBe(true)
    expect(canTransition('ending', 'ended')).toBe(true)
  })

  it('rejects skipping or reversing states', () => {
    expect(canTransition('waiting', 'connected')).toBe(false)
    expect(canTransition('ended', 'connecting')).toBe(false)
    expect(canTransition('failed', 'matched')).toBe(false)
    expect(canTransition('connected', 'waiting')).toBe(false)
  })

  it('assertTransition throws on illegal move', () => {
    expect(() => assertTransition('ended', 'connected')).toThrow(/Illegal/)
  })

  it('isLive covers active phases only', () => {
    expect(isLive('connecting')).toBe(true)
    expect(isLive('connected')).toBe(true)
    expect(isLive('ended')).toBe(false)
  })
})
