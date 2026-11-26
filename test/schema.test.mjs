// node --test test/schema.test.mjs
// 闸两侧：只读连接 SELECT/只读PRAGMA 绿，DELETE/UPDATE/DDL 红（驱动层拒写）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { extractSchema } from '../index.js'

const SAMPLE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sample.sqlite')

test('schema 树与库内真实结构一致（orders 逐列核对）', () => {
  const schema = extractSchema(SAMPLE)
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  const direct = db.prepare('SELECT name, type, pk, "notnull" FROM pragma_table_xinfo(?) WHERE hidden=0 ORDER BY cid').all('orders')
  db.close()
  const orders = schema.tables.find((t) => t.name === 'orders')
  assert.ok(orders, 'orders 表在树里')
  assert.equal(orders.columns.length, direct.length)
  direct.forEach((c, i) => {
    assert.equal(orders.columns[i].name, c.name)
    assert.equal(orders.columns[i].type, c.type)
    assert.equal(orders.columns[i].pk, c.pk > 0)
    assert.equal(orders.columns[i].notnull, c.notnull === 1)
  })
  assert.equal(schema.readOnly, true)
  assert.equal(schema.tables.length, 4)
})

test('行数与库内 COUNT 一致', () => {
  const schema = extractSchema(SAMPLE)
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  for (const t of schema.tables) {
    assert.equal(t.rowCount, db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get().n, t.name)
  }
  db.close()
})

test('阴性：只读连接拒 DELETE/UPDATE/DDL/写PRAGMA', () => {
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  for (const sql of [
    "DELETE FROM orders WHERE id = 1",
    "UPDATE products SET price = 0 WHERE id = 1",
    "DROP TABLE customers",
    "CREATE TABLE evil(x)",
    "INSERT INTO customers(name, city, created_at) VALUES ('x','y','z')",
    "PRAGMA user_version = 99",
  ]) {
    assert.throws(() => db.exec(sql), /readonly|attempt to write/i, sql)
  }
  db.close()
})

test('阳性：只读连接 SELECT/只读PRAGMA/EXPLAIN 正常', () => {
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 300)
  assert.ok(db.prepare('PRAGMA table_info(orders)').all().length > 0)
  assert.ok(db.prepare('EXPLAIN SELECT * FROM orders').all().length > 0)
  db.close()
})

test('文件未被测试改动：customers 仍 120 行且无 evil 表', () => {
  const db = new DatabaseSync(SAMPLE, { readOnly: true })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 120)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_list WHERE name='evil'").get().n, 0)
  db.close()
})
