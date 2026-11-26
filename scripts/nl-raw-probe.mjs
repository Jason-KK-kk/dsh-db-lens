// 原始流探针：用与插件完全相同的 prompt 直连 provider 流式接口，
// 测量首字节/首推理/首正文/总耗时，并落盘模型原始正文与 finish_reason。
// 用法：node scripts/nl-raw-probe.mjs <标签> [问题] [重复次数]
// 输出不含 key（统一替换 <REDACTED>）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPrompt, buildSchemaContext, extractSql } from '../nl2sql.js'
import { extractSchema } from '../drivers.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const label = process.argv[2] || 'raw'
const question = process.argv[3] || '随便看看有什么数据'
const reps = Number(process.argv[4] || 3)

const home = os.homedir()
const patch = fs.readFileSync(path.join(home, '.dsh/profiles/web/cordis.patch.yml'), 'utf8')
const dm = patch.match(/id: agent-default-model[\s\S]*?provider: (\S+)\s*\n\s*model: (\S+)/)
const [, provider, model] = dm
const pb = patch.match(new RegExp(`      ${provider}:\\n[\\s\\S]*?(?=\\n      [a-zA-Z]+:|\\n- id:)`))[0]
const baseURL = pb.match(/baseURL: (\S+)/)[1]
const keyEnv = pb.match(/apiKeyEnv: (\S+)/)[1]
const cred = fs.readFileSync(path.join(home, '.dsh/.credentials.yaml'), 'utf8')
const key = cred.match(new RegExp(`  ${keyEnv}:\\s*(\\S+)`))[1].replace(/^["']|["']$/g, '')
const red = (s) => String(s).replaceAll(key, '<REDACTED>')

const schema = extractSchema(path.join(ROOT, 'sample.sqlite'))
const prompt = buildPrompt(question, buildSchemaContext(schema))
console.log(`provider=${provider} model=${model} 问题="${question}" 重复=${reps}`)
console.log(`prompt 字节=${Buffer.byteLength(prompt)}（key 不打印）`)

const runs = []
for (let i = 1; i <= reps; i++) {
  const t0 = Date.now()
  const rec = { i, ttfbMs: null, firstReasoningMs: null, firstContentMs: null, totalMs: null, content: '', reasoningChars: 0, finishReason: null, http: null, error: null }
  try {
    const resp = await fetch(baseURL + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(180000),
    })
    rec.http = resp.status
    if (!resp.ok) { rec.error = red(await resp.text()).slice(0, 400); runs.push(rec); console.log(`#${i} HTTP ${resp.status} ${rec.error}`); continue }
    const dec = new TextDecoder()
    let buf = ''
    for await (const b of resp.body) {
      if (rec.ttfbMs == null) rec.ttfbMs = Date.now() - t0
      buf += dec.decode(b, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        let j
        try { j = JSON.parse(data) } catch { continue }
        const d = j.choices?.[0]?.delta
        if (j.choices?.[0]?.finish_reason) rec.finishReason = j.choices[0].finish_reason
        if (d?.reasoning_content) {
          if (rec.firstReasoningMs == null) rec.firstReasoningMs = Date.now() - t0
          rec.reasoningChars += d.reasoning_content.length
        }
        if (d?.content) {
          if (rec.firstContentMs == null) rec.firstContentMs = Date.now() - t0
          rec.content += d.content
        }
      }
    }
    rec.totalMs = Date.now() - t0
  } catch (e) {
    rec.totalMs = Date.now() - t0
    rec.error = red(e && e.message ? e.message : e)
  }
  rec.extracted = extractSql(rec.content)
  runs.push(rec)
  console.log(`#${i} http=${rec.http} ttfb=${rec.ttfbMs}ms 首推理=${rec.firstReasoningMs}ms 首正文=${rec.firstContentMs}ms 总=${rec.totalMs}ms 推理字数=${rec.reasoningChars} finish=${rec.finishReason} extract=${rec.extracted ? 'OK' : '空'}${rec.error ? ' err=' + rec.error : ''}`)
  console.log(`    原始正文: ${JSON.stringify(rec.content.slice(0, 300))}`)
}

const dir = path.join(ROOT, 'evidence')
fs.mkdirSync(dir, { recursive: true })
const over30 = runs.filter((r) => (r.firstContentMs ?? r.totalMs) > 30000).length
const summary = { label, provider, model, question, reps, over30sToFirstContent: over30, runs: runs.map((r) => ({ ...r, content: r.content.slice(0, 500) })) }
fs.writeFileSync(path.join(dir, `I2-${label}-原始流探针.json`), red(JSON.stringify(summary, null, 2)))
console.log(`\n首正文>30s 次数: ${over30}/${reps}\n落盘: evidence/I2-${label}-原始流探针.json`)
