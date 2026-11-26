// 驱动抽象：sqlite（node:sqlite 同步＋子进程超时）/ mysql（mysql2）/ pg（pg），均纯 JS 免编译。
// 只读双层：白名单闸（index 调用前）＋驱动层（sqlite readOnly 标志；mysql/pg READ ONLY 事务＋只读用户）。
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { assertReadOnly, GateError } from './sql-guard.js'
import { DEFAULTS } from './limits.js'

const SAMPLE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample.sqlite')

function normBigInt(v) {
  if (typeof v === 'bigint') {
    return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString()
  }
  return v
}
function normRow(r) {
  const o = {}
  for (const [k, v] of Object.entries(r)) o[k] = normBigInt(v)
  return o
}

// ---------- SQLite（原阶段1-5 实现，保持不变） ----------
export function extractSchema(dbPath = SAMPLE_PATH) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const tables = db
      .prepare("SELECT name FROM pragma_table_list WHERE schema='main' AND type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map(({ name }) => {
        const columns = db.prepare('SELECT name, type, pk, "notnull", dflt_value FROM pragma_table_xinfo(?) WHERE hidden = 0 ORDER BY cid').all(name)
        const rowCount = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n
        return {
          name, rowCount,
          columns: columns.map((c) => ({ name: c.name, type: c.type || '', pk: c.pk > 0, notnull: c.notnull === 1, default: c.dflt_value })),
        }
      })
    return { database: path.basename(dbPath), engine: 'sqlite', readOnly: true, tables }
  } finally {
    db.close()
  }
}

export function runQuery(sql, params = [], dbPath = SAMPLE_PATH, maxRows = DEFAULTS.maxRows) {
  const clean = assertReadOnly(sql)
  if (!Array.isArray(params)) throw new GateError('params 必须是数组')
  const cap = Number.isInteger(maxRows) && maxRows >= 1 ? maxRows : DEFAULTS.maxRows
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const stmt = db.prepare(clean)
    stmt.setReadBigInts(true)
    const rows = []
    let truncated = false
    for (const r of stmt.iterate(...params)) {
      if (rows.length >= cap) { truncated = true; break }
      rows.push(normRow(r))
    }
    const columns = rows.length ? Object.keys(rows[0]) : stmt.columns().map((c) => c.name)
    return { columns, rows, rowCount: rows.length, truncated, maxRows: cap }
  } finally {
    db.close()
  }
}

// ---------- MySQL / PG 共用：异步＋READ ONLY 事务＋Promise.race 超时 ----------
function withTimeout(promise, ms, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`查询超时（>${ms}ms），已中断`)
      err.code = 'ETIMEOUT'
      try { onTimeout() } catch { /* 连接已关 */ }
      reject(err)
    }, ms)
    promise.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
  })
}

async function runAsync(conn, sql, params, limits, dialect) {
  const clean = assertReadOnly(sql)
  if (!Array.isArray(params)) throw new GateError('params 必须是数组')
  const cap = Number.isInteger(limits.maxRows) && limits.maxRows >= 1 ? limits.maxRows : DEFAULTS.maxRows
  const timeoutMs = limits.timeoutMs ?? DEFAULTS.timeoutMs
  let client, end
  if (dialect === 'mysql') {
    const mysql = await import('mysql2/promise')
    client = await mysql.createConnection({
      host: conn.host, port: conn.port || 3306, user: conn.user, password: conn.password ?? '',
      database: conn.database, connectTimeout: 5000,
    })
    end = () => client.destroy()
    await client.query('START TRANSACTION READ ONLY')
  } else {
    const pg = await import('pg')
    client = new pg.default.Client({
      host: conn.host, port: conn.port || 5432, user: conn.user, password: conn.password ?? '',
      database: conn.database, connectionTimeoutMillis: 5000,
    })
    await client.connect()
    end = () => client.end().catch(() => {})
    await client.query('BEGIN READ ONLY')
    await client.query(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`)
  }
  try {
    // LIMIT 下推：SELECT/WITH 包一层子查询取 cap+1 行，DB 侧即止，避免物化全量（超大结果内存风险）。
    const head = clean.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
    const execSql = (head === 'SELECT' || head === 'WITH')
      ? `SELECT * FROM (${clean}) AS _dblens LIMIT ${cap + 1}`
      : clean
    const rowsRaw = await withTimeout(
      (async () => {
        const res = await client.query(execSql, params)
        return dialect === 'mysql' ? res[0] : res.rows
      })(),
      timeoutMs, end,
    )
    const all = Array.isArray(rowsRaw) ? rowsRaw.map(normRow) : []
    const truncated = all.length > cap
    const rows = truncated ? all.slice(0, cap) : all
    const columns = rows.length ? Object.keys(rows[0]) : []
    return { columns, rows, rowCount: rows.length, truncated, maxRows: cap }
  } finally {
    try { await end() } catch { /* 已关 */ }
  }
}

async function schemaAsync(conn, dialect) {
  let client, end, tables
  if (dialect === 'mysql') {
    const mysql = await import('mysql2/promise')
    client = await mysql.createConnection({
      host: conn.host, port: conn.port || 3306, user: conn.user, password: conn.password ?? '',
      database: conn.database, connectTimeout: 5000,
    })
    end = () => client.destroy()
    const [tRows] = await client.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
      [conn.database, 'BASE TABLE'])
    tables = []
    for (const t of tRows) {
      const [cRows] = await client.query(
        'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, COLUMN_KEY AS k, IS_NULLABLE AS nn FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
        [conn.database, t.name])
      const [nRows] = await client.query(`SELECT COUNT(*) AS n FROM \`${t.name.replaceAll('`', '``')}\``)
      tables.push({
        name: t.name, rowCount: Number(nRows[0].n),
        columns: cRows.map((c) => ({ name: c.name, type: c.type, pk: c.k === 'PRI', notnull: c.nn === 'NO', default: null })),
      })
    }
  } else {
    const pg = await import('pg')
    client = new pg.default.Client({
      host: conn.host, port: conn.port || 5432, user: conn.user, password: conn.password ?? '',
      database: conn.database, connectionTimeoutMillis: 5000,
    })
    await client.connect()
    end = () => client.end().catch(() => {})
    const tRes = await client.query(
      "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    tables = []
    for (const t of tRes.rows) {
      const cRes = await client.query(
        `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
                COALESCE(i.indisprimary, false) AS pk, a.attnotnull AS nn
         FROM pg_attribute a
         LEFT JOIN pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey) AND i.indisprimary
         WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`, [t.name])
      const nRes = await client.query(`SELECT COUNT(*) AS n FROM "${t.name.replaceAll('"', '""')}"`)
      tables.push({
        name: t.name, rowCount: Number(nRes.rows[0].n),
        columns: cRes.rows.map((c) => ({ name: c.name, type: c.type, pk: c.pk === true, notnull: c.nn === true, default: null })),
      })
    }
  }
  try {
    return { database: conn.database, engine: dialect, readOnly: true, tables }
  } finally {
    try { await end() } catch { /* 已关 */ }
  }
}

// ---------- 统一入口（按 conn.type 分派） ----------
export function extractSchemaFor(conn) {
  if (!conn || conn.type === 'sqlite') return extractSchema(conn?.path || SAMPLE_PATH)
  if (conn.type === 'mysql') return schemaAsync(conn, 'mysql')
  if (conn.type === 'pg') return schemaAsync(conn, 'pg')
  throw new Error('未知连接类型: ' + conn.type)
}

export function runQueryFor(conn, sql, params = [], limits = DEFAULTS) {
  if (!conn || conn.type === 'sqlite') {
    // SQLite 同步：由 index.runQueryTimed 包子进程超时；此处直接同步执行
    return runQuery(sql, params, conn?.path || SAMPLE_PATH, limits.maxRows)
  }
  if (conn.type === 'mysql') return runAsync(conn, sql, params, limits, 'mysql')
  if (conn.type === 'pg') return runAsync(conn, sql, params, limits, 'pg')
  throw new Error('未知连接类型: ' + conn.type)
}
