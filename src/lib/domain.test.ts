import { describe, expect, it } from 'vitest'
import { isAllowedEmail, emailValidationMessage } from './domain'

describe('isAllowedEmail', () => {
  it('accepts plain and uppercased student addresses', () => {
    expect(isAllowedEmail('student@iic.com.np')).toBe(true)
    expect(isAllowedEmail('STUDENT@IIC.COM.NP')).toBe(true)
    expect(isAllowedEmail('  Student@IiC.cOm.Np  ')).toBe(true)
    expect(isAllowedEmail('first.last+tag@iic.com.np')).toBe(true)
  })

  it('rejects other domains', () => {
    expect(isAllowedEmail('student@gmail.com')).toBe(false)
    expect(isAllowedEmail('student@fakeiic.com.np')).toBe(false)
    expect(isAllowedEmail('student@iic.com.np.attacker.com')).toBe(false)
    expect(isAllowedEmail('student@sub.iic.com.np')).toBe(false)
    expect(isAllowedEmail('student@iic.com.n')).toBe(false)
    expect(isAllowedEmail('student@iic.com.np ')).toBe(true) // trimmed — allowed
  })

  it('rejects malformed input', () => {
    expect(isAllowedEmail('')).toBe(false)
    expect(isAllowedEmail('@iic.com.np')).toBe(false)
    expect(isAllowedEmail('student@')).toBe(false)
    expect(isAllowedEmail('a@@iic.com.np')).toBe(false)
    expect(isAllowedEmail('stu dent@iic.com.np')).toBe(false)
    expect(isAllowedEmail('student@iic .com.np')).toBe(false)
  })

  it('validation message points at the required domain', () => {
    expect(emailValidationMessage('student@gmail.com')).toContain('@iic.com.np')
    expect(emailValidationMessage('student@iic.com.np')).toBeNull()
  })
})
