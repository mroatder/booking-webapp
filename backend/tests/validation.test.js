import { describe, it, expect } from 'vitest'
import { textField, isValidPhone, isValidEmail, parseDate } from '../src/utils/validation.js'

describe('validation helpers', () => {
  it('textField trims, requires and limits length', () => {
    expect(textField('  a  ', { field: 'x', max: 5 })).toBe('a')
    expect(() => textField('  ', { field: 'x', max: 5 })).toThrow()
    expect(() => textField('123456', { field: 'x', max: 5 })).toThrow()
    expect(textField('', { field: 'x', max: 5, required: false })).toBeNull()
  })
  it('isValidPhone accepts real formats and rejects junk', () => {
    for (const ok of ['0812345678', '+66 81-234-5678', '02-123-4567 #101', '1234']) expect(isValidPhone(ok)).toBe(true)
    for (const bad of ['1', 'abc', '12', '081234567890123456789012345678901', null]) expect(isValidPhone(bad)).toBe(false)
  })
  it('isValidEmail / parseDate', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('a@b')).toBe(false)
    expect(parseDate('nonsense')).toBeNull()
    expect(parseDate('2030-01-02')).toBeInstanceOf(Date)
  })
})
