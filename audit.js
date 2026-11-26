// 审计：NDJSON 追加留痕（查询/拒写/截断/超时），文件 0600。
// 脱敏：不记连接串/参数值；SQL 文本截 500 字并打掉 password/token 类字面量。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUDIT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit.ndjson')

function sanitizeSql(sql) {
  if (typeof sql !== 'string') return ''
  return sql
    .slice(0, 500)
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key)(\s*[=:]\s*)('[^']*'|"[^"]*"|\S+)/gi, '$1$2<REDACTED>')
}

export function audit(event, opts = {}) {
  const file = opts.path ?? AUDIT_PATH
  const entry = {
    ts: new Date().toISOString(),
    event,
    sql: sanitizeSql(opts.sql),
    ...(opts.rowCount != null ? { rowCount: opts.rowCount } : {}),
    ...(opts.maxRows != null ? { maxRows: opts.maxRows } : {}),
    ...(opts.durationMs != null ? { durationMs: opts.durationMs } : {}),
    ...(opts.reason ? { reason: String(opts.reason).slice(0, 300) } : {}),
    ...(opts.via ? { via: opts.via } : {}),
    ...(opts.conn ? { conn: opts.conn } : {}),
    ...(opts.engine ? { engine: opts.engine } : {}),
  }
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 })
  try { fs.chmodSync(file, 0o600) } catch { /* 已存在文件也收窄 */ }
}

export function readAuditTail(n = 50, opts = {}) {
  const file = opts.path ?? AUDIT_PATH
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const lines = text.split('\n').filter(Boolean)
  return lines.slice(-n).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
