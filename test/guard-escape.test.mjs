// G 批词法门：PG E'...' 反斜杠转义＋dollar-quoted（$$/$tag$）识别。
// 先红：旧词法器不认 dollar 串/E 转义 ⇒ 串内注释标记被当注释剥掉、藏住堆叠分号（漏报）；
// 合法 E/dollar 串内分号被误判堆叠（误报）。双层断言：闸拒＋引擎层 readOnly 兑底（库零改动）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertReadOnly, stripComments, GateError } from '../sql-guard.js'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')

// 绕过样本：PG 语义下是「SELECT＋堆叠写」，旧词法器剥注释后只剩 SELECT 会放行。
const BYPASSES = [
  'SELECT $$ /* $$; DELETE FROM orders; -- */',
  'SELECT $tag$ /* $tag$; UPDATE products SET price = 0; -- */',
  "SELECT E'a\\' /* ' ; DELETE FROM orders; -- */",
  'SELECT $$a$$; DROP TABLE customers',
  "SELECT E'a;b'; DELETE FROM orders",
  'SELECT $a$x$a$; DELETE FROM orders; --$a$',
]

test(`阳性：${BYPASSES.length} 种转义/dollar 绕过全被闸拒（GateError）`, () => {
  for (const sql of BYPASSES) {
    assert.throws(() => assertReadOnly(sql), GateError, `应拒: ${sql}`)
  }
})

test('阳性绕过双层兑底：即便闸漏，readOnly 引擎层零写、库完好', () => {
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  try {
    for (const sql of BYPASSES) {
      // SQLite 对 PG 语法或报错或解成无害 SELECT；无论哪种都不得执行出写。
      try { db.prepare(sql).all() } catch { /* 引擎拒＝也安全 */ }
    }
    assert.throws(() => db.prepare('DELETE FROM orders').run(), /readonly|attempt to write/i)
    assert.throws(() => db.prepare('UPDATE products SET price = 0').run(), /readonly|attempt to write/i)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
    assert.ok(db.prepare('SELECT MIN(price) AS p FROM products').get().p > 0)
  } finally { db.close() }
})

// 合法单语句：转义引号/分号/注释标记都在串内，PG 语义下无堆叠，必须放行。
const LEGIT = [
  "SELECT E'a\\'b;c' AS s",
  'SELECT $$a;b$$ AS s',
  'SELECT $tag$hello;world$tag$ AS s',
  'SELECT $$--x /* y */$$ AS s',
  "SELECT E'a\\\\' AS s",
  "SELECT 'a;b' || $$c;d$$ AS s",
  "SELECT E'\\';DROP' AS s",
  'SELECT $a$x$aa$;y$a$ AS s',
  "SELECT e'it\\'s;fine' AS s",
]

test(`阴性：${LEGIT.length} 种合法 E/dollar 单语句全过闸（不误报）`, () => {
  for (const sql of LEGIT) {
    assert.doesNotThrow(() => assertReadOnly(sql), `应放行: ${sql}`)
  }
})

test('stripComments：dollar/E 串内的注释标记与转义原样保留（执行文本不被改写）', () => {
  assert.equal(stripComments('SELECT $$--x /* y */$$ AS s'), 'SELECT $$--x /* y */$$ AS s')
  assert.equal(stripComments("SELECT E'a\\'b;c' AS s"), "SELECT E'a\\'b;c' AS s")
  assert.equal(stripComments('SELECT $t$--a$t$ AS s -- real'), 'SELECT $t$--a$t$ AS s \n')
})

test('边界：$1 参数占位不触发 dollar 识别；标识符尾 E 不触发 E 串', () => {
  assert.doesNotThrow(() => assertReadOnly('SELECT $1 AS v'))
  assert.throws(() => assertReadOnly("SELECT someE'a'; DELETE FROM orders"), GateError)
})

test('边界：E 转义吞掉分号的方言歧义样本——闸按 PG 语义放行，引擎层零写兑底', () => {
  // PG：\' 转义 ⇒ 全在串内＝单语句；MySQL NO_BACKSLASH_ESCAPES 下会成堆叠 ⇒ 靠 READ ONLY 兑底。
  const sql = "SELECT E'x\\'; DELETE FROM orders; SELECT E'y'"
  assert.doesNotThrow(() => assertReadOnly(sql))
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  try {
    try { db.prepare(sql).all() } catch { /* 引擎拒＝也安全 */ }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
  } finally { db.close() }
})

test('边界：未闭合 dollar 串＝余下全在串内（无堆叠），闸放行后引擎层零写', () => {
  assert.doesNotThrow(() => assertReadOnly('SELECT $$unclosed ; DELETE FROM orders'))
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  try {
    try { db.prepare('SELECT $$unclosed ; DELETE FROM orders').all() } catch { /* 引擎拒＝也安全 */ }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
  } finally { db.close() }
})
