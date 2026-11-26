// I 批回归：NL 问数偶发失败的真因＝把「模型正在思考」算进总预算而 abort，
// 且 abort/error 的在带 finish 被吞掉、统一误报「模型未返回可用 SQL」。
// 证据：evidence/I-根因定位.md（首正文最长 87s＞旧 30s 预算；失败恰 30010ms）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { buildPrompt, buildSchemaContext, extractSql, generateSql } from '../nl2sql.js'
import { extractSchema, makeGenerateHandler } from '../index.js'
import { assertReadOnly } from '../sql-guard.js'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')
const SCHEMA = extractSchema(SAMPLE)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ABORTED = { type: 'finish', reason: { kind: 'aborted', failure: { message: 'pi-ai stream aborted', code: 'ABORTED' } } }

// 信号感知 mock：与真适配器一致——abort 后停止产出并发在带 aborted finish。
function reasoningStream({ ticks, gapMs, sql = 'SELECT 1' }) {
  return async function* (opts) {
    for (let i = 0; i < ticks; i++) {
      if (opts.signal.aborted) { yield ABORTED; return }
      yield { type: 'reasoning-delta', index: 0, text: '想' }
      await sleep(gapMs)
    }
    if (opts.signal.aborted) { yield ABORTED; return }
    yield { type: 'text-delta', index: 0, text: sql }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
function stallingStream() {
  return async function* (opts) {
    yield { type: 'reasoning-delta', index: 0, text: '想' }
    await new Promise((r) => opts.signal.addEventListener('abort', r, { once: true }))
    yield ABORTED
  }
}
function onceStream(chunks) {
  return async function* () { for (const c of chunks) yield c }
}
const base = { provider: 'mock', model: 'm', question: '随便看看有什么数据', schema: SCHEMA }

test('长思考不算失败：reasoning 持续产出超过旧总预算，仍应拿到 SQL', async () => {
  const out = await generateSql({ ...base, streamImpl: reasoningStream({ ticks: 15, gapMs: 10 }), timeoutMs: 40, maxTotalMs: 3000 })
  assert.equal(out.sql, 'SELECT 1')
})

test('空闲超时如实报超时（ETIMEOUT），不再误报「模型未返回可用 SQL」', async () => {
  await assert.rejects(
    () => generateSql({ ...base, streamImpl: stallingStream(), timeoutMs: 30, maxTotalMs: 3000 }),
    (e) => {
      assert.equal(e.code, 'ETIMEOUT')
      assert.match(e.message, /超时/)
      assert.doesNotMatch(e.message, /模型未返回可用 SQL/)
      return true
    },
  )
})

test('总上限兜底：持续产出但超过 maxTotalMs 仍中断并报 ETIMEOUT', async () => {
  await assert.rejects(
    () => generateSql({ ...base, streamImpl: reasoningStream({ ticks: 100, gapMs: 10 }), timeoutMs: 1000, maxTotalMs: 60 }),
    (e) => { assert.equal(e.code, 'ETIMEOUT'); return true },
  )
})

test('provider 错误如实透出原文与 code，不吞成「未返回可用 SQL」', async () => {
  await assert.rejects(
    () => generateSql({
      ...base,
      streamImpl: onceStream([{ type: 'finish', reason: { kind: 'error', failure: { message: 'Incorrect API key provided', code: 'AUTH', status: 401 } } }]),
    }),
    (e) => {
      assert.equal(e.code, 'AUTH')
      assert.match(e.message, /Incorrect API key provided/)
      assert.match(e.message, /401/)
      return true
    },
  )
})

test('只输出推理没给 SQL：报 NO_SQL 且提示把问题说具体', async () => {
  await assert.rejects(
    () => generateSql({ ...base, streamImpl: onceStream([{ type: 'reasoning-delta', index: 0, text: '想了很久' }, { type: 'finish', reason: { kind: 'stop' } }]) }),
    (e) => { assert.equal(e.code, 'NO_SQL'); assert.match(e.message, /具体/); return true },
  )
})

test('装配鲁棒：适配器只发 block-end（无 text-delta）也提得出 SQL', async () => {
  const out = await generateSql({
    ...base,
    streamImpl: onceStream([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'SELECT 42' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]),
  })
  assert.equal(out.sql, 'SELECT 42')
})

test('装配不重复计字：既有 delta 又有 block-end 时只算一份', async () => {
  const out = await generateSql({
    ...base,
    streamImpl: onceStream([
      { type: 'text-delta', index: 0, text: 'SELECT ' },
      { type: 'text-delta', index: 0, text: '42' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'SELECT 42' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]),
  })
  assert.equal(out.sql, 'SELECT 42')
})

test('extractSql：~~~ 围栏与多围栏（首个是说明）都提得出', () => {
  assert.equal(extractSql('~~~sql\nSELECT 1\n~~~'), 'SELECT 1')
  assert.equal(extractSql('```text\n这是说明\n```\n```sql\nSELECT 2\n```'), 'SELECT 2')
})

test('不削弱护栏：围栏里夹带写语句时整段保留，交给只读闸拒', () => {
  const sql = extractSql('```sql\nSELECT 1;\nDELETE FROM orders;\n```')
  assert.match(sql, /DELETE FROM orders/)
  assert.throws(() => assertReadOnly(sql), (e) => e.name === 'GateError')
})

test('一次自动重试：首次没给 SQL，第二次给出即成功', async () => {
  let attempts = 0
  const out = await generateSql({
    ...base,
    streamImpl: () => {
      attempts++
      return attempts === 1
        ? onceStream([{ type: 'text-delta', index: 0, text: '我需要先了解一下你的表结构' }, { type: 'finish', reason: { kind: 'stop' } }])()
        : onceStream([{ type: 'text-delta', index: 0, text: 'SELECT 7' }, { type: 'finish', reason: { kind: 'stop' } }])()
    },
  })
  assert.equal(out.sql, 'SELECT 7')
  assert.equal(attempts, 2)
})

test('超时不重试：避免把等待翻倍，只试一次并如实报 ETIMEOUT', async () => {
  let attempts = 0
  await assert.rejects(
    () => generateSql({
      ...base, timeoutMs: 30, maxTotalMs: 3000,
      streamImpl: (opts) => { attempts++; return stallingStream()(opts) },
    }),
    (e) => { assert.equal(e.code, 'ETIMEOUT'); return true },
  )
  assert.equal(attempts, 1)
})

test('prompt 压缩思考：要求直接给 SQL、模糊问题给默认查法', () => {
  const p = buildPrompt('随便看看有什么数据', buildSchemaContext(SCHEMA))
  assert.match(p, /只输出一条 SELECT/)
  assert.match(p, /不要长篇思考/)
  assert.match(p, /LIMIT/)
})

function fakeReq(body) {
  const req = new PassThrough()
  req.method = 'POST'
  req.end(JSON.stringify(body))
  return req
}
function fakeRes() {
  return { status: null, payload: null, writeHead(s) { this.status = s }, end(b) { this.payload = JSON.parse(b) } }
}

test('生成端点：超时回 504＋code/retryable，便于前端给重试提示', async () => {
  const gen = makeGenerateHandler(async () => {
    const e = new Error('生成超时（20000ms 无响应），已中断')
    e.code = 'ETIMEOUT'
    throw e
  }, SAMPLE)
  const r = fakeRes()
  await gen(fakeReq({ question: '随便看看有什么数据' }), r)
  assert.equal(r.status, 504)
  assert.equal(r.payload.code, 'ETIMEOUT')
  assert.equal(r.payload.retryable, true)
  assert.match(r.payload.error, /超时/)
})