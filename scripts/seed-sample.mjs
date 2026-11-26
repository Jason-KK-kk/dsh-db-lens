// 生成内置示例库 sample.sqlite：小型电商数据，确定性伪随机，可复跑重建。
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dbPath = path.join(root, 'sample.sqlite')
if (fs.existsSync(dbPath)) fs.rmSync(dbPath)

const db = new DatabaseSync(dbPath)
db.exec(`
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL,
  total REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_items_order ON order_items(order_id);
`)

// 线性同余伪随机（固定种子，重建结果一致）
let s = 42
const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴']
const givens = ['伟', '芳', '娜', '敏', '静', '磊', '军', '洋', '勇', '艳', '杰', '涛']
const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安']
const levels = ['normal', 'normal', 'normal', 'silver', 'gold']
const cats = ['数码', '家居', '食品', '图书', '服饰']
const prodNames = {
  数码: ['无线鼠标', '机械键盘', '蓝牙耳机', '充电宝', '智能手环'],
  家居: ['台灯', '收纳箱', '抱枕', '香薰机', '懒人沙发'],
  食品: ['坚果礼盒', '咖啡豆', '绿茶', '蜂蜜', '燕麦片'],
  图书: ['算法导论', 'SQL入门', '设计模式', '经济学讲义', '科幻短篇集'],
  服饰: ['T恤', '牛仔裤', '运动鞋', '棒球帽', '围巾'],
}
const statuses = ['paid', 'paid', 'paid', 'shipped', 'shipped', 'done', 'done', 'cancelled']
const day = (n) => `2026-${String(1 + (n % 11)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`

const insCustomer = db.prepare('INSERT INTO customers(name, city, level, created_at) VALUES (?,?,?,?)')
for (let i = 0; i < 120; i++) {
  insCustomer.run(pick(surnames) + pick(givens), pick(cities), pick(levels), day(i))
}

const insProduct = db.prepare('INSERT INTO products(name, category, price, stock) VALUES (?,?,?,?)')
for (const cat of cats) {
  for (const name of prodNames[cat]) {
    insProduct.run(name, cat, Math.round((10 + rnd() * 490) * 100) / 100, Math.floor(rnd() * 500))
  }
}

const insOrder = db.prepare('INSERT INTO orders(customer_id, status, total, created_at) VALUES (?,?,?,?)')
const insItem = db.prepare('INSERT INTO order_items(order_id, product_id, qty, unit_price) VALUES (?,?,?,?)')
const prices = db.prepare('SELECT id, price FROM products').all()
for (let i = 0; i < 300; i++) {
  const oid = Number(insOrder.run(1 + Math.floor(rnd() * 120), pick(statuses), 0, day(i + 7)).lastInsertRowid)
  let total = 0
  const nItems = 1 + Math.floor(rnd() * 3)
  for (let k = 0; k < nItems; k++) {
    const p = pick(prices)
    const qty = 1 + Math.floor(rnd() * 4)
    insItem.run(oid, p.id, qty, p.price)
    total += qty * p.price
  }
  db.prepare('UPDATE orders SET total = ? WHERE id = ?').run(Math.round(total * 100) / 100, oid)
}

const counts = {}
for (const t of ['customers', 'products', 'orders', 'order_items']) {
  counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
}
db.close()
console.log('sample.sqlite 建库完成:', JSON.stringify(counts))
