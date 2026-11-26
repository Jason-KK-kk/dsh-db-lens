// 临时容器种子：建表插数＋建只读用户 reader（GRANT SELECT）。仅本机验收用，验毕清理。
// 口令走环境变量，不落仓库：ROOT_PASS（容器 root/postgres 口令）、READER_PASS（只读用户口令）。
// 用法：ROOT_PASS=... READER_PASS=... node scripts/seed-containers.mjs
import mysql from 'mysql2/promise'
import pg from 'pg'

const ROOT_PASS = process.env.ROOT_PASS
const READER_PASS = process.env.READER_PASS
if (!ROOT_PASS || !READER_PASS) {
  console.error('请设置环境变量 ROOT_PASS 与 READER_PASS（口令不入仓库）')
  process.exit(1)
}
const MYSQL = { host: '127.0.0.1', port: 13306, user: 'root', password: ROOT_PASS, database: 'testdb' }
const PG = { host: '127.0.0.1', port: 15432, user: 'postgres', password: ROOT_PASS, database: 'testdb' }

async function waitMysql() {
  for (let i = 0; i < 60; i++) {
    try { const c = await mysql.createConnection({ ...MYSQL, connectTimeout: 2000 }); await c.ping(); return c }
    catch { await new Promise((r) => setTimeout(r, 2000)) }
  }
  throw new Error('MySQL 60 次重试仍未就绪')
}

const cities = ['北京', '上海', '广州', '深圳', '杭州']
const DDL = `
CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL, city VARCHAR(20) NOT NULL);
CREATE TABLE products (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL, price DECIMAL(10,2) NOT NULL);
CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT NOT NULL, total DECIMAL(10,2) NOT NULL);
`
function seedRows() {
  const customers = [], products = [], orders = []
  for (let i = 1; i <= 60; i++) customers.push([i, '客户' + i, cities[i % 5]])
  for (let i = 1; i <= 20; i++) products.push([i, '商品' + i, (i * 12.5)])
  for (let i = 1; i <= 150; i++) orders.push([i, (i % 60) + 1, (i * 7.75)])
  return { customers, products, orders }
}

// MySQL
const mc = await waitMysql()
for (const stmt of DDL.split(';').map((s) => s.trim()).filter(Boolean)) await mc.query(stmt)
const { customers, products, orders } = seedRows()
await mc.query('INSERT INTO customers VALUES ?', [customers])
await mc.query('INSERT INTO products VALUES ?', [products])
await mc.query('INSERT INTO orders VALUES ?', [orders])
await mc.query('CREATE USER IF NOT EXISTS \'reader\'@\'%\' IDENTIFIED BY ?', [READER_PASS])
await mc.query('GRANT SELECT ON testdb.* TO \'reader\'@\'%\'')
await mc.query('FLUSH PRIVILEGES')
const [mn] = await mc.query('SELECT COUNT(*) AS n FROM orders')
console.log('MySQL 种子完成 orders=', mn[0].n, '只读用户 reader 已建')
await mc.end()

// PG
const pc = new pg.Client(PG)
await pc.connect()
for (const stmt of DDL.split(';').map((s) => s.trim()).filter(Boolean)) await pc.query(stmt)
for (const r of customers) await pc.query('INSERT INTO customers VALUES ($1,$2,$3)', r)
for (const r of products) await pc.query('INSERT INTO products VALUES ($1,$2,$3)', r)
for (const r of orders) await pc.query('INSERT INTO orders VALUES ($1,$2,$3)', r)
await pc.query('DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=\'reader\') THEN CREATE ROLE reader LOGIN PASSWORD \'' + READER_PASS.replace(/'/g, "''") + '\'; END IF; END $$')
await pc.query('GRANT CONNECT ON DATABASE testdb TO reader')
await pc.query('GRANT USAGE ON SCHEMA public TO reader')
await pc.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader')
const pn = await pc.query('SELECT COUNT(*) AS n FROM orders')
console.log('PG 种子完成 orders=', pn.rows[0].n, '只读用户 reader 已建')
await pc.end()
