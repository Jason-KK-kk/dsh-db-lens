// 阶段3 闸两侧：限量（1000/1001 边界＋截对段）／超时（真中断/不误伤）／审计（留痕/脱敏/0600）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { runQuery, runQueryTimed, makeQueryHandler } from '../index.js'
import { loadLimits, DEFAULTS } from '../limits.js'
import { audit, readAuditTail } from '../audit.js'
import { PassThrough } from 'node:stream'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')
const seq = (n) => `WITH RECURSIVE s(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM s WHERE x<${n}) SELECT x FROM s`
const HEAVY = 'SELECT COUNT(*) AS c FROM orders a CROSS JOIN orders b CROSS JOIN orders c CROSS JOIN orders d'

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dblens-')), name)
}

test('限量边界：1000 行不截／1001 行截且保留前 1000（截尾不截头）', () => {
  const at = runQuery(seq(1000))
  assert.equal(at.rowCount, 1000)
  assert.equal(at.truncated, false)
  const over = runQuery(seq(1001))
  assert.equal(over.rowCount, 1000)
  assert.equal(over.truncated, true)
  assert.equal(over.rows[0].x, 1)
  assert.equal(over.rows[999].x, 1000)
  assert.ok(!over.rows.some((r) => r.x === 1001), '第 1001 行必须被截掉')
})

test('限量：cross join 9 万行截到 1000，保留段与自然顺序前 1000 一致', () => {
  const sql = 'SELECT a.id AS aid, b.id AS bid FROM orders a CROSS JOIN orders b'
  const r = runQuery(sql)
  assert.equal(r.rowCount, 1000)
  assert.equal(r.truncated, true)
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  const first1000 = db.prepare(sql + ' LIMIT 1000').all()
  db.close()
  assert.deepEqual(r.rows.map((x) => x.aid + ':' + x.bid), first1000.map((x) => x.aid + ':' + x.bid))
})

test('限量可配不可关：自定义 5 生效；0/-1/\"off\"/缺省一律回退 1000', () => {
  const r5 = runQuery(seq(10), [], SAMPLE, 5)
  assert.equal(r5.rowCount, 5)
  assert.equal(r5.truncated, true)
  for (const bad of [0, -1, 'off', null, undefined, NaN]) {
    const r = runQuery(seq(1001), [], SAMPLE, bad)
    assert.equal(r.maxRows, 1000, `非法值 ${bad} 应回退默认`)
    assert.equal(r.rowCount, 1000)
  }
  const cfg = tmpFile('limits.json')
  fs.writeFileSync(cfg, JSON.stringify({ maxRows: 0, timeoutMs: -5 }))
  assert.deepEqual(loadLimits(cfg), DEFAULTS)
  fs.writeFileSync(cfg, JSON.stringify({ maxRows: 7, timeoutMs: 2000 }))
  assert.deepEqual(loadLimits(cfg), { maxRows: 7, timeoutMs: 2000 })
  assert.deepEqual(loadLimits(cfg + '.missing'), DEFAULTS)
})

test('超时阳性：重查询 500ms 被真中断（远早于其自然耗时），库完好', async () => {
  const t0 = Date.now()
  await assert.rejects(
    runQueryTimed(HEAVY, [], SAMPLE, { maxRows: 1000, timeoutMs: 500 }),
    (e) => e.code === 'ETIMEOUT' && /超时/.test(e.message),
  )
  const elapsed = Date.now() - t0
  assert.ok(elapsed < 3000, `应在 ~500ms 中断，实际 ${elapsed}ms`)
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
  db.close()
})

test('超时阴性：快查询不被误伤，正常出数', async () => {
  const r = await runQueryTimed('SELECT COUNT(*) AS n FROM orders', [], SAMPLE, { maxRows: 1000, timeoutMs: 5000 })
  assert.equal(r.rows[0].n, 300)
  assert.ok(r.durationMs < 5000)
})

test('审计：查询/拒写/截断都留痕，敏感字面量脱敏，文件 0600', () => {
  const p = tmpFile('audit.ndjson')
  audit('query', { path: p, sql: 'SELECT 1', rowCount: 1, durationMs: 2 })
  audit('reject', { path: p, sql: 'DELETE FROM orders', reason: '不在白名单' })
  audit('truncate', { path: p, sql: 'SELECT big', rowCount: 1000, maxRows: 1000 })
  audit('query', { path: p, sql: "SELECT * FROM t WHERE password='supersecret123'", rowCount: 0 })
  const events = readAuditTail(50, { path: p })
  assert.deepEqual(events.map((e) => e.event), ['query', 'reject', 'truncate', 'query'])
  assert.equal(events[1].reason, '不在白名单')
  assert.equal(events[2].maxRows, 1000)
  const raw = fs.readFileSync(p, 'utf8')
  assert.ok(!raw.includes('supersecret123'), '敏感值不得落审计')
  assert.ok(raw.includes('<REDACTED>'))
  assert.equal(fs.statSync(p).mode & 0o777, 0o600)
})

function fakeReq(method, body) {
  const req = new PassThrough()
  req.method = method
  req.end(body ?? '')
  return req
}
function fakeRes() {
  return { status: null, payload: null, writeHead(s) { this.status = s }, end(b) { this.payload = JSON.parse(b) } }
}

test('handler 集成：截断 200 带明示／超时 408／拒写 403，三类都进审计', async () => {
  const p = tmpFile('audit.ndjson')
  const h = makeQueryHandler(SAMPLE, { auditPath: p, limits: { maxRows: 1000, timeoutMs: 500 } })
  const r1 = fakeRes()
  await h(fakeReq('POST', JSON.stringify({ sql: seq(1001) })), r1)
  assert.equal(r1.status, 200)
  assert.equal(r1.payload.truncated, true)
  assert.equal(r1.payload.rowCount, 1000)
  const r2 = fakeRes()
  await h(fakeReq('POST', JSON.stringify({ sql: HEAVY })), r2)
  assert.equal(r2.status, 408)
  const r3 = fakeRes()
  await h(fakeReq('POST', JSON.stringify({ sql: 'DELETE FROM orders' })), r3)
  assert.equal(r3.status, 403)
  const events = readAuditTail(50, { path: p })
  assert.deepEqual(events.map((e) => e.event), ['truncate', 'timeout', 'reject'])
})
