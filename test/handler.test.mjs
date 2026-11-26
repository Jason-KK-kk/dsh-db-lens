// HTTP 接缝：mock req/res 验状态码路由（403 闸拒 / 200 通 / 405 / 400），不起真实服务。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeQueryHandler } from '../index.js'

const AUDIT_TMP = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dblens-h-')), 'audit.ndjson')
const handler = () => makeQueryHandler(undefined, { auditPath: AUDIT_TMP })

function fakeReq(method, body) {
  const req = new PassThrough()
  req.method = method
  if (body != null) req.end(body)
  else req.end()
  return req
}

function fakeRes() {
  return {
    status: null, payload: null,
    writeHead(s) { this.status = s },
    end(b) { this.payload = JSON.parse(b) },
  }
}

test('POST DELETE → 403 闸拒', async () => {
  const res = fakeRes()
  await handler()(fakeReq('POST', JSON.stringify({ sql: 'DELETE FROM orders' })), res)
  assert.equal(res.status, 403)
  assert.match(res.payload.error, /白名单/)
})

test('POST SELECT → 200 出数', async () => {
  const res = fakeRes()
  await handler()(fakeReq('POST', JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM orders' })), res)
  assert.equal(res.status, 200)
  assert.equal(res.payload.rows[0].n, 300)
})

test('GET → 405；坏 JSON → 400；SQL 语法错 → 400', async () => {
  const r1 = fakeRes()
  await handler()(fakeReq('GET'), r1)
  assert.equal(r1.status, 405)
  const r2 = fakeRes()
  await handler()(fakeReq('POST', '{bad'), r2)
  assert.equal(r2.status, 400)
  const r3 = fakeRes()
  await handler()(fakeReq('POST', JSON.stringify({ sql: 'SELECT * FROM no_such_table' })), r3)
  assert.equal(r3.status, 400)
})
