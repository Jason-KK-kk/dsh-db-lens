// G 批严格模式开关·后端闸：默认严格开；只有显式 false 才关；非法值回退开。
// 开关只影响 NL 人确认层——只读/限量/超时/审计不受其影响（写仍 403）。
// 先红：loadStrictNl/saveStrictNl/makeSettingsHandler 尚不存在。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { loadStrictNl, saveStrictNl, loadLimits } from '../limits.js'
import { makeSettingsHandler, makeQueryHandler } from '../index.js'
import { SAMPLE_CONN } from '../connections.js'

const tmpFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dblens-g-')), name)
function fakeReq(method, body) {
  const req = new PassThrough()
  req.method = method
  req.end(body != null ? body : '')
  return req
}
function fakeRes() {
  return { status: null, payload: null, writeHead(s) { this.status = s }, end(b) { this.payload = JSON.parse(b) } }
}
const post = (h, obj) => { const r = fakeRes(); return h(fakeReq('POST', JSON.stringify(obj)), r).then(() => r) }
const get = (h) => { const r = fakeRes(); return h(fakeReq('GET'), r).then(() => r) }

test('loadStrictNl：无文件/坏文件＝true（默认严格开）', () => {
  assert.equal(loadStrictNl(tmpFile('none.json')), true)
  const bad = tmpFile('bad.json')
  fs.writeFileSync(bad, '{oops')
  assert.equal(loadStrictNl(bad), true)
})

test('loadStrictNl：只有显式布尔 false 才关；非法值一律回退开', () => {
  const cfg = tmpFile('limits.json')
  for (const [raw, want] of [[false, false], [true, true], ['false', true], ['off', true], [0, true], [null, true]]) {
    fs.writeFileSync(cfg, JSON.stringify({ strictNl: raw }))
    assert.equal(loadStrictNl(cfg), want, `strictNl=${JSON.stringify(raw)} 应得 ${want}`)
  }
  fs.writeFileSync(cfg, JSON.stringify({ maxRows: 7 }))
  assert.equal(loadStrictNl(cfg), true, '缺省＝严格开')
})

test('saveStrictNl：落盘 0600、保留限量/超时键、布尔校验', () => {
  const cfg = tmpFile('limits.json')
  fs.writeFileSync(cfg, JSON.stringify({ maxRows: 7, timeoutMs: 2000 }))
  saveStrictNl(false, cfg)
  assert.equal(loadStrictNl(cfg), false)
  assert.deepEqual(loadLimits(cfg), { maxRows: 7, timeoutMs: 2000 }, '限量/超时配置不得被开关写坏')
  assert.equal(fs.statSync(cfg).mode & 0o777, 0o600, '配置文件必须 0600')
  saveStrictNl(true, cfg)
  assert.equal(loadStrictNl(cfg), true)
  assert.throws(() => saveStrictNl('off', cfg), /布尔|boolean/)
  assert.throws(() => saveStrictNl(0, cfg), /布尔|boolean/)
})

test('settings 路由：GET 读状态；POST 布尔持久化并回读；非法 400；其余 405', async () => {
  const cfg = tmpFile('limits.json')
  const h = makeSettingsHandler({ configPath: cfg })
  assert.deepEqual((await get(h)).payload, { strictNl: true })
  const r = await post(h, { strictNl: false })
  assert.equal(r.status, 200)
  assert.deepEqual(r.payload, { strictNl: false })
  assert.equal(loadStrictNl(cfg), false, '应已持久化')
  assert.deepEqual((await get(h)).payload, { strictNl: false })
  await post(h, { strictNl: true })
  assert.equal(loadStrictNl(cfg), true)
  for (const bad of [{ strictNl: 'off' }, { strictNl: 0 }, {}, { strictNl: null }]) {
    const rb = await post(h, bad)
    assert.equal(rb.status, 400, `非法 payload 应 400: ${JSON.stringify(bad)}`)
  }
  const r405 = fakeRes()
  await h(fakeReq('PUT', '{}'), r405)
  assert.equal(r405.status, 405)
})

test('护栏不可关：strictNl=false 时写语句仍 403＋审计 reject（开关不碰查询路径）', async () => {
  const cfg = tmpFile('limits.json')
  const auditPath = tmpFile('audit.ndjson')
  saveStrictNl(false, cfg)
  const qh = makeQueryHandler(SAMPLE_CONN, { auditPath, limits: loadLimits(cfg) })
  const r = await post(qh, { sql: 'DELETE FROM orders WHERE id = 1' })
  assert.equal(r.status, 403)
  const events = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(events.at(-1).event, 'reject')
  const ok = await post(qh, { sql: 'SELECT COUNT(*) AS n FROM orders' })
  assert.equal(ok.status, 200)
  assert.equal(ok.payload.rows[0].n, 300)
})
