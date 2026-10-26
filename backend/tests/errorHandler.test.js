import { describe, it, expect, vi } from 'vitest'
import { AppError } from '../src/errors/AppError.js'
import { ErrorCodes } from '../src/errors/codes.js'
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js'

function mockRes() {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('errorHandler', () => {
  it('responds with the AppError status code and error code', () => {
    const res = mockRes()
    const err = new AppError(ErrorCodes.ROOM_BOOKING_CONFLICT, 409)

    errorHandler(err, {}, res, () => {})

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      errorCode: ErrorCodes.ROOM_BOOKING_CONFLICT,
      details: undefined,
    })
  })

  it('falls back to 500 INTERNAL_ERROR for unknown errors', () => {
    const res = mockRes()
    errorHandler(new Error('boom'), {}, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ errorCode: ErrorCodes.INTERNAL_ERROR })
  })
})

describe('notFoundHandler', () => {
  it('passes a 404 NOT_FOUND AppError to next()', () => {
    const next = vi.fn()
    notFoundHandler({}, {}, next)

    expect(next).toHaveBeenCalledTimes(1)
    const err = next.mock.calls[0][0]
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe(ErrorCodes.NOT_FOUND)
    expect(err.statusCode).toBe(404)
  })
})
