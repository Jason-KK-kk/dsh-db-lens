// 阶段5：agent 工具旁路断言——工具入口与面板同护栏（拒写/限量/超时/审计），无旁路。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { makeDbTools } from '../agent-tools.js'
import { readAuditTail } from '../audit.js'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')
const HEAVY = 'SELECT COUNT(*) AS c FROM orders a CROSS JOIN orders b CROSS JOIN orders c CROSS JOIN orders d'

function tmpAudit() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dblens-at-')), 'audit.ndjson')
}
function tools(opts = {}) {
  const [query, schema] = makeDbTools({ dbPath: SAMPLE, ...opts })
  return { query, schema }
}

test('工具定义：只读语义写进描述，sql 参数必填，输出 schema 合法', () => {
  const { query, schema } = tools()
  assert.equal(query.name, 'db_lens_query')
  assert.match(query.description, /只读/)
  assert.match(query.description, /拒绝/)
  assert.deepEqual(query.parameters.required, ['sql'])
  assert.equal(query.parameters.properties.sql.type, 'string')
  assert.equal(query.output.schema.type, 'string')
  assert.equal(typeof query.output.render, 'function')
  assert.deepEqual(query.output.render({}, 'x'), [{ type: 'text', text: 'x' }])
  assert.equal(schema.name, 'db_lens_schema')
})

test('旁路阳性：工具入口 UPDATE/DELETE/DDL/堆叠 全拒＋留拒写审计（via=agent）', async () => {
  const p = tmpAudit()
  const { query } = tools({ auditPath: p })
  for (const sql of [
    'UPDATE products SET price = 0 WHERE id = 1',
    'DELETE FROM orders WHERE id = 1',
    'DROP TABLE customers',
    'SELECT 1; DELETE FROM orders',
  ]) {
    await assert.rejects(query.execute({ sql }), /只读护栏拒绝/, sql)
  }
  const events = readAuditTail(50, { path: p })
  assert.equal(events.length, 4)
  assert.ok(events.every((e) => e.event === 'reject' && e.via === 'agent'))
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 120)
  db.close()
})

test('旁路阴性：工具 SELECT 出数与库一致＋留查询审计（via=agent）', async () => {
  const p = tmpAudit()
  const { query } = tools({ auditPath: p })
  const out = JSON.parse(await query.execute({ sql: 'SELECT COUNT(*) AS n FROM orders' }))
  assert.equal(out.rows[0].n, 300)
  assert.equal(out.truncated, false)
  const events = readAuditTail(50, { path: p })
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'query')
  assert.equal(events[0].via, 'agent')
  assert.equal(events[0].rowCount, 1, 'COUNT 查询返回 1 行，300 是行内值')
})

test('工具限量同护栏：9 万行 cross join 截到 1000＋截断审计', async () => {
  const p = tmpAudit()
  const { query } = tools({ auditPath: p })
  const out = JSON.parse(await query.execute({ sql: 'SELECT a.id AS aid, b.id AS bid FROM orders a CROSS JOIN orders b' }))
  assert.equal(out.rowCount, 1000)
  assert.equal(out.truncated, true)
  assert.equal(out.maxRows, 1000)
  const events = readAuditTail(50, { path: p })
  assert.equal(events[0].event, 'truncate')
  assert.equal(events[0].via, 'agent')
})

test('工具超时同护栏：重查询 500ms 真中断＋超时审计', async () => {
  const p = tmpAudit()
  const { query } = tools({ auditPath: p, limits: { maxRows: 1000, timeoutMs: 500 } })
  await assert.rejects(query.execute({ sql: HEAVY }), /超时中断/)
  const events = readAuditTail(50, { path: p })
  assert.equal(events[0].event, 'timeout')
  assert.equal(events[0].via, 'agent')
})

test('schema 工具：返回真实结构，零查询审计', async () => {
  const p = tmpAudit()
  const { schema } = tools({ auditPath: p })
  const out = JSON.parse(await schema.execute({}))
  assert.equal(out.tables.length, 4)
  assert.equal(out.readOnly, true)
  assert.equal(fs.existsSync(p), false)
})

test('坏参数：sql 缺失/空串/非字符串 拒且不执行', async () => {
  const p = tmpAudit()
  const { query } = tools({ auditPath: p })
  for (const args of [{}, { sql: '' }, { sql: '   ' }, { sql: 42 }, null]) {
    await assert.rejects(query.execute(args), /sql 必须是非空字符串/)
  }
  assert.equal(fs.existsSync(p), false)
})
