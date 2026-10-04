import { describe, expect, it } from 'vitest'
import { isAllowedEmail, emailValidationMessage } from './domain'

describe('isAllowedEmail', () => {
  it('accepts plain and uppercased student addresses', () => {
    expect(isAllowedEmail('student@iic.edu.np')).toBe(true)
    expect(isAllowedEmail('STUDENT@IIC.EDU.NP')).toBe(true)
    expect(isAllowedEmail('  Student@iic.edu.np  ')).toBe(true)
    expect(isAllowedEmail('first.last+tag@iic.edu.np')).toBe(true)
  })

  it('rejects other domains', () => {
    expect(isAllowedEmail('student@gmail.com')).toBe(false)
    expect(isAllowedEmail('student@fakeiic.com.np')).toBe(false)
    expect(isAllowedEmail('student@iic.edu.np.attacker.com')).toBe(false)
    expect(isAllowedEmail('student@sub.iic.edu.np')).toBe(false)
    expect(isAllowedEmail('student@iic.edu.n')).toBe(false)
    expect(isAllowedEmail('student@iic.edu.np ')).toBe(true) // trimmed — allowed
  })

  it('rejects malformed input', () => {
    expect(isAllowedEmail('')).toBe(false)
    expect(isAllowedEmail('@iic.edu.np')).toBe(false)
    expect(isAllowedEmail('student@')).toBe(false)
    expect(isAllowedEmail('a@@iic.edu.np')).toBe(false)
    expect(isAllowedEmail('stu dent@iic.edu.np')).toBe(false)
    expect(isAllowedEmail('student@iic .edu.np')).toBe(false)
  })

  it('validation message points at the required domain', () => {
    expect(emailValidationMessage('student@gmail.com')).toContain('@iic.edu.np')
    expect(emailValidationMessage('student@iic.edu.np')).toBeNull()
  })
})
