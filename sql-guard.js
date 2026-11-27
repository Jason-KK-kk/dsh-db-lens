// SQL 白名单闸（第一道；第二道＝DatabaseSync readOnly 驱动层拒写）。
// 放行：SELECT / WITH…SELECT / SHOW / EXPLAIN / SQLite 只读 PRAGMA 白名单。
// 拒绝：其余一切（写语句、DDL、写 PRAGMA、多语句堆叠、未知 PRAGMA）。
export class GateError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GateError'
  }
}

const READ_PRAGMAS = new Set([
  'table_info', 'table_xinfo', 'table_list', 'index_list', 'index_info', 'index_xinfo',
  'foreign_key_list', 'database_list', 'encoding', 'freelist_count', 'page_count',
  'page_size', 'journal_mode', 'user_version', 'schema_version', 'integrity_check',
  'quick_check', 'compile_options',
])

// 字面量识别（stripComments 与堆叠检测共用）：普通引号（双写转义）、[括号]、
// PG E'...'（反斜杠转义）、dollar-quoted $$/$tag$（内容全字面，注释标记不生效）。
// 返回字面量结束后一位；非字面量起点返回 -1；未闭合返回 length（余下按串内，引擎层兜底拒）。
function literalEnd(sql, i) {
  const c = sql[i]
  if ((c === 'E' || c === 'e') && sql[i + 1] === "'" && (i === 0 || !/[A-Za-z0-9_$]/.test(sql[i - 1]))) {
    for (let j = i + 2; j < sql.length; j++) {
      if (sql[j] === '\\') { j++; continue }
      if (sql[j] === "'") {
        if (sql[j + 1] === "'") { j++; continue }
        return j + 1
      }
    }
    return sql.length
  }
  if (c === '$') {
    const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
    if (!m) return -1
    const close = sql.indexOf(m[0], i + m[0].length)
    return close === -1 ? sql.length : close + m[0].length
  }
  if (c === "'" || c === '"' || c === '`') {
    for (let j = i + 1; j < sql.length; j++) {
      if (sql[j] === c) {
        if (sql[j + 1] === c) { j++; continue }
        return j + 1
      }
    }
    return sql.length
  }
  if (c === '[') {
    for (let j = i + 1; j < sql.length; j++) {
      if (sql[j] === ']') {
        if (sql[j + 1] === ']') { j++; continue }
        return j + 1
      }
    }
    return sql.length
  }
  return -1
}

// 去掉 -- 与 /* */ 注释；字面量内内容原样保留（含转义；执行文本不被改写）。
export function stripComments(sql) {
  let out = ''
  for (let i = 0; i < sql.length; i++) {
    const end = literalEnd(sql, i)
    if (end !== -1) { out += sql.slice(i, end); i = end - 1; continue }
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i++
      out += ' '
      continue
    }
    out += c
  }
  return out
}

function hasSemicolonOutsideQuotes(sql) {
  for (let i = 0; i < sql.length; i++) {
    const end = literalEnd(sql, i)
    if (end !== -1) { i = end - 1; continue }
    if (sql[i] === ';') return true
  }
  return false
}

export function assertReadOnly(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new GateError('SQL 为空')
  let clean = stripComments(sql).trim()
  while (clean.endsWith(';')) clean = clean.slice(0, -1).trimEnd()
  if (!clean) throw new GateError('SQL 为空')
  if (hasSemicolonOutsideQuotes(clean)) throw new GateError('只允许单条语句（检测到分号堆叠）')

  const head = clean.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
  if (!head) throw new GateError('无法识别语句类型')

  if (head === 'PRAGMA') {
    const m = clean.match(/^PRAGMA\s+(?:[A-Za-z_]+\.)?([A-Za-z_]+)\s*(\(|=|$)/i)
    if (!m) throw new GateError('无法解析 PRAGMA，按拒绝处理')
    const name = m[1].toLowerCase()
    if (m[2] === '=') throw new GateError(`PRAGMA ${name} 是写设置，只读模式拒绝`)
    if (!READ_PRAGMAS.has(name)) throw new GateError(`PRAGMA ${name} 不在只读白名单`)
    return clean
  }

  if (['SELECT', 'WITH', 'SHOW', 'EXPLAIN'].includes(head)) return clean
  throw new GateError(`${head} 不在只读白名单（仅 SELECT/SHOW/EXPLAIN/只读 PRAGMA）`)
}
