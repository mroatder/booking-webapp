import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

// ไฟล์แบบฟอร์มขอใช้รถ - dev ยืนยัน 2026-09-28: บังคับแนบ, สูงสุด 5 ไฟล์, ไฟล์ละไม่เกิน 10 MB, PDF/JPG/PNG
export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

// ตรวจชนิดไฟล์จาก "เนื้อไฟล์จริง" (magic bytes) ไม่เชื่อ Content-Type/นามสกุลที่ browser ส่งมา
// เพราะไฟล์จะถูกเปิดโดย Admin คนอื่น - กันไฟล์ HTML/สคริปต์ที่เปลี่ยนนามสกุลเป็น .pdf
const SIGNATURES = [
  { contentType: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { contentType: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { contentType: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
]

const STORED_NAME_PATTERN = /^[0-9a-f-]{36}\.(pdf|png|jpg)$/

export function detectType(buffer) {
  return SIGNATURES.find((sig) => sig.bytes.every((b, i) => buffer[i] === b)) ?? null
}

/**
 * busboy (ใต้ multer) ถอดชื่อไฟล์เป็น latin1 ตามสเปกเก่า - ชื่อไฟล์ภาษาไทยที่ browser ส่งเป็น UTF-8
 * จะเพี้ยน ถ้าทุกตัวอักษรอยู่ในช่วง byte เดียว (≤ 0xFF) ให้ลองตีความใหม่เป็น UTF-8
 */
export function decodeOriginalName(name) {
  if (![...name].every((ch) => ch.charCodeAt(0) <= 0xff)) return name
  const utf8 = Buffer.from(name, 'latin1').toString('utf8')
  return utf8.includes('�') ? name : utf8
}

function safeDisplayName(name) {
  // ตัด path และอักขระควบคุมออก - ใช้แสดงผล/ตั้งชื่อตอนดาวน์โหลดเท่านั้น ไม่เคยใช้เป็น path
  const base = decodeOriginalName(name).split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim()
  return (cleaned || 'file').slice(0, 255)
}

export function storedPath(storedName) {
  if (!STORED_NAME_PATTERN.test(storedName)) throw new AppError(ErrorCodes.NOT_FOUND, 404)
  return path.join(env.uploadDir, storedName)
}

/**
 * multer middleware - เก็บไฟล์ในหน่วยความจำก่อน (สูงสุด 5 × 10 MB) เพื่อตรวจ magic bytes
 * ก่อนเขียนลงดิสก์จริง และแปลง error ของ multer เป็น error code ของระบบ
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS, fields: 30 },
}).array('files', MAX_ATTACHMENTS)

export function uploadAttachments(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(ErrorCodes.ATTACHMENT_TOO_LARGE, 413))
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError(ErrorCodes.ATTACHMENT_COUNT_INVALID, 400))
      }
      return next(new AppError(ErrorCodes.VALIDATION_ERROR, 400))
    }
    next(err)
  })
}

/** ตรวจชนิดไฟล์ทั้งหมดก่อน (ไฟล์ไหนผิดก็ไม่เขียนสักไฟล์) แล้วค่อยเขียนลงดิสก์ด้วยชื่อสุ่ม */
export async function saveFiles(files) {
  const prepared = files.map((file) => {
    const type = detectType(file.buffer)
    if (!type) throw new AppError(ErrorCodes.ATTACHMENT_TYPE_INVALID, 400)
    return {
      buffer: file.buffer,
      originalName: safeDisplayName(file.originalname),
      storedName: `${randomUUID()}.${type.ext}`,
      contentType: type.contentType,
      size: file.size,
    }
  })

  await mkdir(env.uploadDir, { recursive: true })
  const written = []
  try {
    for (const f of prepared) {
      await writeFile(path.join(env.uploadDir, f.storedName), f.buffer, { flag: 'wx' })
      written.push(f.storedName)
    }
  } catch (err) {
    await removeFiles(written)
    throw err
  }
  return prepared.map(({ originalName, storedName, contentType, size }) => ({ originalName, storedName, contentType, size }))
}

/** ลบไฟล์บนดิสก์แบบไม่ throw - ใช้ตอน rollback หรือหลังลบแถวใน DB แล้ว */
export async function removeFiles(storedNames) {
  await Promise.all(storedNames.map((name) => unlink(storedPath(name)).catch(() => {})))
}
