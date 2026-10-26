import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { detectType } from '../vehicle-requests/attachments.js'

/**
 * รูปลายเซ็น/ตราประทับของผู้อนุมัติ (PNG/JPG ≤ 1 MB) - ใช้ใส่ช่อง Approved by ใน PDF แบบฟอร์ม W-HR-009
 * (dev 2026-10-05: ตรา DocuWorks ใช้กับระบบไม่ได้ → บันทึกเป็นรูปแล้วอัปโหลดครั้งเดียว)
 * เก็บใน UPLOAD_DIR/signatures ชื่อสุ่ม - ไม่มี URL สาธารณะ เปิดผ่าน API ที่ตรวจสิทธิ์เท่านั้น
 */
const MAX_BYTES = 1024 * 1024
const NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg)$/
const dir = () => path.join(env.uploadDir, 'signatures')

export function signaturePath(name) {
  if (!NAME_PATTERN.test(name ?? '')) throw new AppError(ErrorCodes.NOT_FOUND, 404)
  return path.join(dir(), name)
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single('file')

export function uploadSignature(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(ErrorCodes.ATTACHMENT_TOO_LARGE, 413))
    }
    next(new AppError(ErrorCodes.VALIDATION_ERROR, 400))
  })
}

/** ตรวจชนิดจากเนื้อไฟล์ (รับแค่ PNG/JPG) แล้วเขียนลงดิสก์ คืนชื่อไฟล์ที่เก็บ */
export async function saveSignature(file) {
  if (!file) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const type = detectType(file.buffer)
  if (!type || type.ext === 'pdf') throw new AppError(ErrorCodes.ATTACHMENT_TYPE_INVALID, 400)
  await mkdir(dir(), { recursive: true })
  const name = `${randomUUID()}.${type.ext}`
  await writeFile(path.join(dir(), name), file.buffer, { flag: 'wx' })
  return name
}

export async function removeSignature(name) {
  if (!name) return
  await unlink(signaturePath(name)).catch(() => {})
}

export function signatureContentType(name) {
  return name.endsWith('.png') ? 'image/png' : 'image/jpeg'
}
