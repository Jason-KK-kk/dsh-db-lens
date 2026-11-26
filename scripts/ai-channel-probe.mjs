// AI 通道实测：从本机 DSH web profile 读当前默认模型与 key 引用，发一次真实请求。
// 输出只含 HTTP 状态/模型/回答文本/用量，不含 key、不含完整连接串。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = os.homedir()
const patch = fs.readFileSync(path.join(home, '.dsh/profiles/web/cordis.patch.yml'), 'utf8')

// 当前默认模型（agent-default-model 段）
const dm = patch.match(/id: agent-default-model[\s\S]*?provider: (\S+)\s*\n\s*model: (\S+)/)
if (!dm) { console.log('FAIL: 未找到 agent-default-model 配置'); process.exit(1) }
const [, provider, model] = dm
console.log(`当前 DSH 默认模型: provider=${provider} model=${model}`)

// 该 provider 的 baseURL 与 apiKeyEnv
const provBlock = patch.match(new RegExp(`      ${provider}:\\n[\\s\\S]*?(?=\\n      [a-zA-Z]+:|\\n- id:)`))
const baseURL = provBlock[0].match(/baseURL: (\S+)/)[1]
const keyEnv = provBlock[0].match(/apiKeyEnv: (\S+)/)[1]
console.log(`baseURL 主机: ${new URL(baseURL).host} | keyEnv 名: ${keyEnv}`)

// key 引用值（只入内存，不打印）
const cred = fs.readFileSync(path.join(home, '.dsh/.credentials.yaml'), 'utf8')
const km = cred.match(new RegExp(`  ${keyEnv}:\\s*(\\S+)`))
if (!km) { console.log(`FAIL: refs 中无 ${keyEnv}`); process.exit(1) }
const key = km[1].replace(/^["']|["']$/g, '')
console.log(`key 引用长度: ${key.length}（值不打印）`)

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 30000)
try {
  const resp = await fetch(baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: '只回复两个字：收到' }], max_tokens: 16 }),
    signal: controller.signal,
  })
  console.log(`HTTP ${resp.status}`)
  const text = await resp.text()
  if (!resp.ok) {
    // 错误体可能回显请求信息，截断并打掉疑似 key 片段
    console.log('FAIL 响应(截断400):', text.slice(0, 400).replaceAll(key, '<REDACTED>'))
    process.exit(1)
  }
  const j = JSON.parse(text)
  console.log('返回模型:', j.model)
  console.log('回答:', j.choices?.[0]?.message?.content)
  console.log('用量:', JSON.stringify(j.usage))
  console.log('AI 通道实测: PASS')
} catch (e) {
  console.log('FAIL:', String(e).replaceAll(key, '<REDACTED>'))
  process.exit(1)
} finally {
  clearTimeout(timer)
}
