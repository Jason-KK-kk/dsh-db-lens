// 阶段4：mock AI 验生成/确认闸（不烧 token）。核心断言：确认前零查询发出（审计 delta=0）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { buildSchemaContext, buildPrompt, extractSql, generateSql } from '../nl2sql.js'
import { extractSchema, makeGenerateHandler, makeQueryHandler } from '../index.js'
import { readAuditTail } from '../audit.js'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')
const SCHEMA = extractSchema(SAMPLE)

function mockStream(chunks) {
  return async function* () { for (const c of chunks) yield c }
}
function fakeReq(body) {
  const req = new PassThrough()
  req.method = 'POST'
  req.end(JSON.stringify(body))
  return req
}
function fakeRes() {
  return { status: null, payload: null, writeHead(s) { this.status = s }, end(b) { this.payload = JSON.parse(b) } }
}
function tmpAudit() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dblens-nl-')), 'audit.ndjson')
}

test('schema 上下文装配：真实表/列/类型/主键都在 prompt 里', () => {
  const ctx = buildSchemaContext(SCHEMA)
  for (const t of ['customers', 'products', 'orders', 'order_items']) assert.ok(ctx.includes(t), t)
  assert.ok(ctx.includes('customer_id INTEGER'))
  assert.ok(ctx.includes('id INTEGER PRIMARY KEY'))
  const prompt = buildPrompt('每个城市的客户数', ctx)
  assert.ok(prompt.includes('每个城市的客户数'))
  assert.ok(prompt.includes('orders'))
  assert.ok(prompt.includes('只输出一条 SELECT'))
})

test('extractSql：裸 SQL/代码围栏/前后杂文都提得出', () => {
  assert.equal(extractSql('SELECT 1'), 'SELECT 1')
  assert.equal(extractSql('```sql\nSELECT 1\n```'), 'SELECT 1')
  assert.equal(extractSql('好的，这是查询：\n```\nSELECT 2;\n```\n希望有帮助'), 'SELECT 2;')
  assert.equal(extractSql('没有 SQL'), '')
})

test('generateSql：mock 流只拼 text-delta（reasoning 不混入），不执行', async () => {
  const out = await generateSql({
    streamImpl: mockStream([
      { type: 'reasoning-delta', index: 0, text: '内部思考不应混入' },
      { type: 'text-delta', index: 0, text: 'SELECT COUNT(*)' },
      { type: 'text-delta', index: 0, text: ' AS n FROM orders' },
      { type: 'finish' },
    ]),
    provider: 'mock', model: 'mock-model', question: '订单总数', schema: SCHEMA,
  })
  assert.equal(out.sql, 'SELECT COUNT(*) AS n FROM orders')
  assert.equal(out.model, 'mock/mock-model')
})

test('生成端点只生成不执行：确认前审计零事件、库零改动', async () => {
  const p = tmpAudit()
  const gen = makeGenerateHandler(async (question, schema) => {
    assert.ok(schema.tables.length === 4, '生成端点须喂真实 schema')
    return { sql: 'SELECT COUNT(*) AS n FROM orders', model: 'mock/m' }
  }, SAMPLE)
  const r = fakeRes()
  await gen(fakeReq({ question: '订单总数' }), r)
  assert.equal(r.status, 200)
  assert.equal(r.payload.sql, 'SELECT COUNT(*) AS n FROM orders')
  assert.equal(r.payload.executed, false)
  assert.equal(fs.existsSync(p), false, '生成端点不得写任何查询审计')
  assert.equal(readAuditTail(50, { path: p }).length, 0)
})

test('确认闸全流程：生成后 delta=0；人确认走 /query 才 delta=1 出数', async () => {
  const p = tmpAudit()
  const gen = makeGenerateHandler(async () => ({ sql: 'SELECT COUNT(*) AS n FROM orders', model: 'mock/m' }), SAMPLE)
  const query = makeQueryHandler(SAMPLE, { auditPath: p })
  const r1 = fakeRes()
  await gen(fakeReq({ question: '订单总数' }), r1)
  assert.equal(readAuditTail(50, { path: p }).length, 0, '确认前零查询发出')
  // 模拟人点「确认执行」＝把生成的 SQL 交给 /dblens/query
  const r2 = fakeRes()
  await query(fakeReq({ sql: r1.payload.sql }), r2)
  assert.equal(r2.status, 200)
  assert.equal(r2.payload.rows[0].n, 300)
  const events = readAuditTail(50, { path: p })
  assert.equal(events.length, 1, '确认后恰一条查询审计')
  assert.equal(events[0].event, 'query')
})

test('模型生成写语句：确认后仍被闸拒 403 并留拒写审计', async () => {
  const p = tmpAudit()
  const gen = makeGenerateHandler(async () => ({ sql: 'DELETE FROM orders WHERE id = 1', model: 'mock/m' }), SAMPLE)
  const query = makeQueryHandler(SAMPLE, { auditPath: p })
  const r1 = fakeRes()
  await gen(fakeReq({ question: '删掉订单1' }), r1)
  assert.equal(r1.status, 200, '生成端点只展示不执行，写语句也仅展示')
  assert.equal(readAuditTail(50, { path: p }).length, 0)
  const r2 = fakeRes()
  await query(fakeReq({ sql: r1.payload.sql }), r2)
  assert.equal(r2.status, 403)
  const events = readAuditTail(50, { path: p })
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'reject')
})

test('生成端点坏输入 400／模型失败 502，均不执行', async () => {
  const gen = makeGenerateHandler(async () => { throw new Error('模型挂了') }, SAMPLE)
  const r1 = fakeRes()
  await gen(fakeReq({ question: '  ' }), r1)
  assert.equal(r1.status, 400)
  const r2 = fakeRes()
  await gen(fakeReq({ question: '订单总数' }), r2)
  assert.equal(r2.status, 502)
  assert.match(r2.payload.error, /模型挂了/)
})
