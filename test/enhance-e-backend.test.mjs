// E 批后端闸：测试连接（只试连不查数）＋模型目录路由＋generate 模型覆盖。
// 先红：drivers.testConnectionFor / index.makeTestConnectionHandler / makeModelsHandler 尚不存在。
// HTTP 接缝照 handler.test.mjs 约定（mock req/res）；llm 服务面用假件（DSH 运行期才注入，单测不可免）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testConnectionFor } from '../drivers.js'
import { makeTestConnectionHandler, makeModelsHandler, makeGenerateHandler } from '../index.js'
import { SAMPLE_CONN } from '../connections.js'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_PATH = path.join(DIR, '..', 'sample.sqlite')

function fakeReq(method, body) {
  const req = new PassThrough()
  req.method = method
  req.end(body != null ? body : '')
  return req
}
function fakeRes() {
  return {
    status: null, payload: null, raw: null,
    writeHead(s) { this.status = s },
    end(b) { this.raw = b; this.payload = JSON.parse(b) },
  }
}
const post = (h, obj) => { const r = fakeRes(); return h(fakeReq('POST', JSON.stringify(obj)), r).then(() => r) }

// ── 试连驱动：只建连不查数 ────────────────────────────────────────────
test('试连 sqlite：示例库通；坏路径拒且报错可读', async () => {
  const ok = await testConnectionFor({ type: 'sqlite', path: SAMPLE_PATH })
  assert.equal(ok.engine, 'sqlite')
  await assert.rejects(testConnectionFor({ type: 'sqlite', path: '/no/such/file.sqlite' }), /open|unable|ENOENT/i)
})

test('试连 mysql/pg：不可达端口拒（真网络阴性，无需活库）', async () => {
  for (const type of ['mysql', 'pg']) {
    await assert.rejects(
      testConnectionFor({ type, host: '127.0.0.1', port: 1, user: 'x', password: 'x', database: 'd' }),
      (e) => { assert.ok(e && e.message, '应有可读报错'); return true },
    )
  }
})

test('试连：未知类型拒', async () => {
  await assert.rejects(testConnectionFor({ type: 'oracle' }), /未知连接类型/)
})

// ── 试连路由 ─────────────────────────────────────────────────────────
test('试连路由：表单 sqlite 通 200 ok:true；响应绝不回传密码', async () => {
  const h = makeTestConnectionHandler({ connections: [SAMPLE_CONN], activeId: 'sample' })
  const r = await post(h, { type: 'sqlite', name: 't', path: SAMPLE_PATH, password: 'unit-test-pass' })
  assert.equal(r.status, 200)
  assert.equal(r.payload.ok, true)
  assert.equal(r.payload.engine, 'sqlite')
  assert.equal(r.raw.includes('unit-test-pass'), false, '响应不得含密码')
})

test('试连路由：按 id 试已存连接；不存在 id 400', async () => {
  const h = makeTestConnectionHandler({ connections: [SAMPLE_CONN], activeId: 'sample' })
  const r = await post(h, { id: 'sample' })
  assert.equal(r.status, 200)
  assert.equal(r.payload.ok, true)
  const r2 = await post(h, { id: 'nope' })
  assert.equal(r2.status, 400)
  assert.match(r2.payload.error, /不存在/)
})

test('试连路由：校验失败 400 可读；坏 JSON 400；GET 405', async () => {
  const h = makeTestConnectionHandler({ connections: [SAMPLE_CONN], activeId: 'sample' })
  const r = await post(h, { type: 'mysql', name: 'x' })
  assert.equal(r.status, 400)
  assert.match(r.payload.error, /host/)
  const r2 = fakeRes()
  await h(fakeReq('POST', '{bad'), r2)
  assert.equal(r2.status, 400)
  const r3 = fakeRes()
  await h(fakeReq('GET'), r3)
  assert.equal(r3.status, 405)
})

test('试连路由：连接失败 500 ok:false＋原因（不可达端口）', async () => {
  const h = makeTestConnectionHandler({ connections: [SAMPLE_CONN], activeId: 'sample' })
  const r = await post(h, { type: 'mysql', name: 'x', host: '127.0.0.1', port: 1, user: 'u', password: 'unit-test-pass', database: 'd' })
  assert.equal(r.status, 500)
  assert.equal(r.payload.ok, false)
  assert.ok(r.payload.error.length > 0)
  assert.equal(r.raw.includes('unit-test-pass'), false)
})

// ── 模型目录路由 ─────────────────────────────────────────────────────
const fakeLlm = (catalog, failFor = []) => ({
  listProviders: () => Object.keys(catalog).concat(failFor).map((id) => ({ id, name: id.toUpperCase() })),
  listModels: async (p) => {
    if (failFor.includes(p)) throw new Error('catalog down')
    return catalog[p]
  },
})
const fakeDefault = (provider, model) => ({ currentSelection: () => ({ provider, model }) })

test('模型目录：聚合各 provider 模型＋默认选中；单 provider 失败隔离不拖垮', async () => {
  const h = makeModelsHandler(fakeLlm({ p1: [{ id: 'm1', name: 'M1' }, { id: 'm2', name: 'M2', description: 'd2' }] }, ['p2']), fakeDefault('p1', 'm1'))
  const r = fakeRes()
  await h(fakeReq('GET'), r)
  assert.equal(r.status, 200)
  assert.deepEqual(r.payload.default, { provider: 'p1', model: 'm1' })
  assert.equal(r.payload.models.length, 2)
  assert.deepEqual(r.payload.models[0], { provider: 'p1', id: 'm1', name: 'M1' })
  assert.equal(r.payload.models[1].description, 'd2')
  assert.deepEqual(r.payload.failedProviders, ['p2'])
})

test('模型目录：目录不含默认模型时默认仍置顶可选（不硬造其余模型）', async () => {
  const h = makeModelsHandler(fakeLlm({}), fakeDefault('beiyong', 'qwen3.8-max'))
  const r = fakeRes()
  await h(fakeReq('GET'), r)
  assert.equal(r.payload.models.length, 1)
  assert.deepEqual(r.payload.models[0], { provider: 'beiyong', id: 'qwen3.8-max', name: 'qwen3.8-max' })
  assert.deepEqual(r.payload.default, { provider: 'beiyong', model: 'qwen3.8-max' })
})

test('模型目录：仅 GET', async () => {
  const h = makeModelsHandler(fakeLlm({}), fakeDefault('p', 'm'))
  const r = fakeRes()
  await h(fakeReq('POST', '{}'), r)
  assert.equal(r.status, 405)
})

// ── generate 模型覆盖 ────────────────────────────────────────────────
test('generate：payload provider/model 透传给生成器；缺省不传覆盖', async () => {
  const seen = []
  const gen = async (q, s, override) => { seen.push(override); return { sql: 'SELECT 1', model: 'x/y' } }
  const h = makeGenerateHandler(gen)
  const r = await post(h, { question: 'q', provider: 'px', model: 'mx' })
  assert.equal(r.status, 200)
  assert.deepEqual(seen[0], { provider: 'px', model: 'mx' })
  const r2 = await post(h, { question: 'q' })
  assert.equal(r2.status, 200)
  assert.equal(seen[1], undefined)
})

test('generate：provider/model 只给一半 → 400（不静默半覆盖）', async () => {
  const h = makeGenerateHandler(async () => ({ sql: 'SELECT 1', model: 'x/y' }))
  const r = await post(h, { question: 'q', provider: 'px' })
  assert.equal(r.status, 400)
  const r2 = await post(h, { question: 'q', model: '' })
  assert.equal(r2.status, 400)
})
