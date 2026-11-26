// 阶段6：连接管理纯函数单测（0600/脱敏/校验/增选）＋驱动闸拒写（闸先于连接，无需活库）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConnections, saveConnections, getActive, sanitizeConn, validateConn, addConnection, setActive, SAMPLE_CONN } from '../connections.js'
import { runQueryFor, extractSchemaFor } from '../drivers.js'

function tmpFile() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dblens-conn-')), 'connections.json') }

test('内置示例恒在且默认选中；坏文件回退内置', () => {
  const f = tmpFile()
  const s = loadConnections(f)
  assert.equal(s.connections.length, 1)
  assert.equal(s.connections[0].id, 'sample')
  assert.equal(s.activeId, 'sample')
  assert.equal(getActive(s).type, 'sqlite')
  fs.writeFileSync(f, '{bad json')
  assert.equal(loadConnections(f).connections.length, 1)
})

test('sanitize 打码密码，绝不回传明文', () => {
  const c = { id: 'x', type: 'mysql', host: 'h', user: 'u', password: 'supersecret', database: 'd' }
  const s = sanitizeConn(c)
  assert.equal(s.password, '******')
  assert.equal(JSON.stringify(s).includes('supersecret'), false)
  assert.equal(s.host, 'h')
})

test('validate：缺字段/坏端口/未知类型 拒', () => {
  assert.match(validateConn({}), /name/)
  assert.match(validateConn({ name: 'x', type: 'sqlite' }), /path/)
  assert.match(validateConn({ name: 'x', type: 'mysql' }), /host/)
  assert.match(validateConn({ name: 'x', type: 'mysql', host: 'h', database: 'd', user: 'u', port: 99999 }), /port/)
  assert.match(validateConn({ name: 'x', type: 'oracle' }), /type/)
  assert.equal(validateConn({ name: 'x', type: 'sqlite', path: '/a.db' }), null)
  assert.equal(validateConn({ name: 'x', type: 'pg', host: 'h', database: 'd', user: 'u' }), null)
})

test('增/选连接落盘 0600，密码只存文件不进 sanitize', () => {
  const f = tmpFile()
  const s = loadConnections(f)
  const c = addConnection(s, { name: 'my', type: 'mysql', host: '127.0.0.1', user: 'reader', password: 'unit-test-pass', database: 'testdb' }, f)
  assert.equal(c.port, 3306)
  assert.equal(fs.statSync(f).mode & 0o777, 0o600)
  const raw = fs.readFileSync(f, 'utf8')
  assert.ok(raw.includes('unit-test-pass'), '密码存文件')
  assert.equal(s.connections.length, 2)
  setActive(s, c.id, f)
  assert.equal(getActive(loadConnections(f)).id, c.id)
  assert.throws(() => setActive(s, 'nope', f), /不存在/)
})

test('驱动闸拒写：mysql/pg 写语句在连接前即被闸拒（无需活库）', async () => {
  for (const type of ['mysql', 'pg']) {
    const conn = { type, host: '127.0.0.1', port: 1, user: 'x', password: 'x', database: 'd' }
    await assert.rejects(runQueryFor(conn, 'DELETE FROM t WHERE id=1', [], { maxRows: 1000, timeoutMs: 1000 }), /白名单/)
    await assert.rejects(runQueryFor(conn, 'UPDATE t SET x=1', [], { maxRows: 1000, timeoutMs: 1000 }), /白名单/)
    await assert.rejects(runQueryFor(conn, 'DROP TABLE t', [], { maxRows: 1000, timeoutMs: 1000 }), /白名单/)
  }
})

test('未知连接类型拒', () => {
  assert.throws(() => extractSchemaFor({ type: 'oracle' }), /未知连接类型/)
})
