export const ALLOWED_DOMAIN = 'iic.edu.np'

/**
 * Returns true only for a single-part local address @ exactly iic.edu.np,
 * case-insensitively. Rejects lookalike domains, trailing junk, whitespace,
 * and multi-@ addresses.
 */
export function isAllowedEmail(email: string): boolean {
  const trimmed = email.trim()
  if (trimmed.length < 3 || trimmed.length > 254) return false
  if (/\s/.test(trimmed)) return false
  const parts = trimmed.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || !domain) return false
  return domain.toLowerCase() === ALLOWED_DOMAIN
}

export function emailValidationMessage(email: string): string | null {
  if (!email.trim()) return 'Enter your iic.edu.np email address.'
  if (!isAllowedEmail(email)) {
    return `Only addresses ending in @${ALLOWED_DOMAIN} are allowed (e.g. student@${ALLOWED_DOMAIN}).`
  }
  return null
}
