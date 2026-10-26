export class AppError extends Error {
  /**
   * @param {string} code - error code ที่ frontend จะใช้แปลเป็นข้อความ (ห้ามใส่ข้อความภาษาคนตรงนี้)
   * @param {number} statusCode - HTTP status code
   * @param {object} [details] - ข้อมูลเสริม (เช่น field ที่ผิด) ไม่ใช่ข้อความแสดงผล
   */
  constructor(code, statusCode = 400, details = undefined) {
    super(code)
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}
