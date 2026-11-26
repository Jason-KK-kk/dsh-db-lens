// node --test test/ —— 闸两侧对照：写语句/危险构造全拒（阳性），只读语句全通（阴性）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { assertReadOnly, GateError } from '../sql-guard.js'
import { runQuery } from '../index.js'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')

const REJECTS = [
  'DELETE FROM orders WHERE id = 1',
  'UPDATE products SET price = 0 WHERE id = 1',
  "INSERT INTO customers(name, city, created_at) VALUES ('x','y','z')",
  'DROP TABLE customers',
  'CREATE TABLE evil(x)',
  'ALTER TABLE orders ADD COLUMN hacked TEXT',
  'TRUNCATE TABLE orders',
  "REPLACE INTO customers(id, name, city, created_at) VALUES (1,'x','y','z')",
  'PRAGMA user_version = 99',
  'PRAGMA journal_mode = DELETE',
  'PRAGMA writable_schema = ON',
  'VACUUM',
  "ATTACH DATABASE '/tmp/evil.sqlite' AS evil",
  'BEGIN; DELETE FROM orders; COMMIT',
  'SELECT 1; DELETE FROM orders',
  '/* hi */ DELETE FROM orders',
  '-- comment\nDELETE FROM orders',
  'SELECT/*x*/1;--\nDROP TABLE customers',
  'PRAGMA mysterious_thing',
  '',
  '   ',
]

test(`阳性：${REJECTS.length} 种写/危险构造全被闸拒`, () => {
  for (const sql of REJECTS) {
    assert.throws(() => assertReadOnly(sql), GateError, `应拒: ${sql}`)
  }
})

const ACCEPTS = [
  'SELECT COUNT(*) AS n FROM orders',
  'select * from products where price > 100',
  'WITH big AS (SELECT * FROM orders WHERE total > 500) SELECT COUNT(*) AS n FROM big',
  'EXPLAIN SELECT * FROM orders',
  'EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 3',
  'PRAGMA table_info(orders)',
  "PRAGMA table_xinfo('orders')",
  'PRAGMA journal_mode',
  'PRAGMA main.table_list',
  'SELECT 1; ',
  "SELECT ';' AS semi",
  "SELECT 'a;--b' AS tricky FROM products LIMIT 1",
  'SHOW TABLES',
]

test(`阴性：${ACCEPTS.length} 种只读构造全过闸`, () => {
  for (const sql of ACCEPTS) {
    assert.doesNotThrow(() => assertReadOnly(sql), `应放行: ${sql}`)
  }
})

test('runQuery：SELECT 出数且与库内一致', () => {
  const r = runQuery('SELECT COUNT(*) AS n FROM orders')
  assert.equal(r.rows[0].n, 300)
  const top = runQuery('SELECT id, total FROM orders ORDER BY total DESC LIMIT 3')
  assert.equal(top.rowCount, 3)
  assert.ok(top.rows[0].total >= top.rows[1].total)
  assert.deepEqual(top.columns, ['id', 'total'])
})

test('runQuery：参数化防注入（参数只当数据）', () => {
  const evil = "x' OR '1'='1"
  const r = runQuery('SELECT COUNT(*) AS n FROM customers WHERE name = ?', [evil])
  assert.equal(r.rows[0].n, 0)
  const all = runQuery('SELECT COUNT(*) AS n FROM customers')
  assert.equal(all.rows[0].n, 120)
})

test('runQuery：写语句在闸层拒（GateError），库文件零改动', () => {
  assert.throws(() => runQuery('DELETE FROM orders WHERE id = 1'), GateError)
  assert.throws(() => runQuery('UPDATE products SET price = 0'), GateError)
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
  assert.equal(db.prepare('SELECT MIN(price) AS p FROM products').get().p > 0, true)
  db.close()
})

test('runQuery：空结果集也返回列名', () => {
  const r = runQuery('SELECT id, total FROM orders WHERE id = -1')
  assert.equal(r.rowCount, 0)
  assert.deepEqual(r.columns, ['id', 'total'])
})

test('runQuery：只读 PRAGMA 通、写 PRAGMA 拒', () => {
  const r = runQuery('PRAGMA table_info(orders)')
  assert.equal(r.rowCount, 5)
  assert.throws(() => runQuery('PRAGMA user_version = 7'), GateError)
})
