// 问数稳定性实测：对活路由 POST /dblens/generate 连跑 N 次，记录失败率与错误原文。
// 用法：node scripts/nl-repro.mjs <标签> <次数> [baseUrl]
// 只读探针：不执行任何 SQL（生成端点 executed:false），输出不含 key/连接串。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const label = process.argv[2] || 'run'
const runs = Number(process.argv[3] || 10)
const base = process.argv[4] || 'http://127.0.0.1:3080'

const QUESTIONS = [
  '我想看看orders表的数据',
  '每个城市客户数',
  '帮我查一下订单',
  '哪个产品卖得最好',
  '随便看看有什么数据',
  '订单金额最高的前十笔',
]

const results = []
for (let i = 1; i <= runs; i++) {
  const question = QUESTIONS[(i - 1) % QUESTIONS.length]
  const started = Date.now()
  let rec = { i, question, http: null, ms: 0, ok: false, sql: null, error: null }
  try {
    const r = await fetch(base + '/dblens/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(90000),
    })
    rec.http = r.status
    const j = await r.json()
    rec.ms = Date.now() - started
    if (r.ok && typeof j.sql === 'string' && j.sql.trim()) {
      rec.ok = true
      rec.sql = j.sql
      rec.model = j.model
      rec.executed = j.executed
    } else {
      rec.error = j.error || JSON.stringify(j).slice(0, 300)
    }
  } catch (e) {
    rec.ms = Date.now() - started
    rec.error = String(e && e.message ? e.message : e)
  }
  results.push(rec)
  console.log(`#${i} ${rec.ok ? 'OK ' : 'FAIL'} http=${rec.http} ${rec.ms}ms q="${question}" ${rec.ok ? rec.sql.replace(/\s+/g, ' ').slice(0, 90) : rec.error}`)
}

const fail = results.filter((r) => !r.ok)
const summary = {
  label, base, runs, ok: runs - fail.length, fail: fail.length,
  failRate: `${((fail.length / runs) * 100).toFixed(1)}%`,
  avgMs: Math.round(results.reduce((a, r) => a + r.ms, 0) / runs),
  maxMs: Math.max(...results.map((r) => r.ms)),
  errorKinds: [...new Set(fail.map((r) => r.error))],
}
console.log('\n=== 汇总 ===')
console.log(JSON.stringify(summary, null, 2))

const dir = path.join(ROOT, 'evidence')
fs.mkdirSync(dir, { recursive: true })
const txt = [
  `问数稳定性实测 · ${label}`,
  `时间: ${new Date().toISOString()}  路由: ${base}/dblens/generate`,
  `口径: 成功＝HTTP 200 且 sql 非空；失败＝非 200 或 sql 空或 fetch 抛错`,
  '',
  ...results.map((r) => `#${r.i} ${r.ok ? 'OK ' : 'FAIL'} http=${r.http} ${r.ms}ms q="${r.question}"\n    ${r.ok ? r.sql : r.error}`),
  '',
  '=== 汇总 ===',
  JSON.stringify(summary, null, 2),
].join('\n')
fs.writeFileSync(path.join(dir, `I1-${label}-活路由连跑.txt`), txt)
fs.writeFileSync(path.join(dir, `I1-${label}-活路由连跑.json`), JSON.stringify({ summary, results }, null, 2))
console.log(`\n落盘: evidence/I1-${label}-活路由连跑.txt / .json`)
process.exit(fail.length ? 1 : 0)
