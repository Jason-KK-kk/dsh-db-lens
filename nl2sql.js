// 自然语言→SQL：只生成不执行。schema 上下文来自库内真实结构，防编表名。
// 执行永远走 /dblens/query 同一护栏，且必须人点确认（client 侧闸）。
export function buildSchemaContext(schema) {
  const lines = [`数据库: ${schema.database}（SQLite，只读）`]
  for (const t of schema.tables) {
    const cols = t.columns.map((c) => `${c.name} ${c.type}${c.pk ? ' PRIMARY KEY' : ''}${c.notnull && !c.pk ? ' NOT NULL' : ''}`).join(', ')
    lines.push(`表 ${t.name}(${cols}) -- ${t.rowCount} 行`)
  }
  return lines.join('\n')
}

export function buildPrompt(question, schemaContext) {
  return [
    '你是 SQLite 查询生成器。根据下面的真实库结构，把用户问题转成一条只读 SQL。',
    '规则：只输出一条 SELECT（或 WITH…SELECT）语句本身；不要解释、不要 markdown 代码围栏；只用结构中存在的表和列；不要生成任何写语句。',
    '直接给出 SQL，不要长篇思考、不要反问；问题模糊时选最相关的表，用 SELECT * FROM 该表 LIMIT 10 这类默认查法。',
    '',
    schemaContext,
    '',
    `用户问题：${question}`,
  ].join('\n')
}

const SQL_HEAD = /\b(WITH|SELECT|SHOW|EXPLAIN|PRAGMA)\b[\s\S]*/i

export function extractSql(text) {
  if (typeof text !== 'string') return ''
  // 多围栏时取第一个真含 SQL 的块，避免被前置说明块骗走。
  for (const f of text.matchAll(/(?:```|~~~)[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)(?:```|~~~)/g)) {
    const m = f[1].match(SQL_HEAD)
    if (m) return m[0].trim()
  }
  const m = text.trim().match(SQL_HEAD)
  return m ? m[0].trim() : ''
}

// timeoutMs＝空闲上限（无任何 chunk 才算卡死）；maxTotalMs＝总上限兜底。
// 推理模型的思考时间不算失败：旧实现用 30s 总预算，实测首正文最长 87s，故误 abort。
async function attemptOnce({ streamImpl, provider, model, prompt, timeoutMs, maxTotalMs }) {
  const controller = new AbortController()
  let timedOut = null
  let idleTimer
  const armIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { timedOut = 'idle'; controller.abort() }, timeoutMs)
  }
  const totalTimer = setTimeout(() => { timedOut = 'total'; controller.abort() }, maxTotalMs)
  const parts = new Map()
  let finish = null
  try {
    armIdle()
    const stream = streamImpl({
      provider, model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      armIdle()
      if (chunk.type === 'text-delta') parts.set(chunk.index, (parts.get(chunk.index) || '') + chunk.text)
      else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && !parts.has(chunk.index)) parts.set(chunk.index, chunk.block.text)
      else if (chunk.type === 'finish') finish = chunk.reason
    }
  } finally {
    clearTimeout(idleTimer)
    clearTimeout(totalTimer)
  }

  if (timedOut) {
    const detail = timedOut === 'idle' ? `${timeoutMs}ms 无响应` : `超过总上限 ${maxTotalMs}ms`
    const err = new Error(`生成超时（${detail}），已中断；请重试或把问题说得更具体`)
    err.code = 'ETIMEOUT'
    throw err
  }
  // 适配器把中断/错误归一为在带 finish，不抛异常；不看它就会误报「未返回可用 SQL」。
  if (finish?.kind === 'aborted' || finish?.kind === 'error') {
    const f = finish.failure || {}
    const label = finish.kind === 'aborted' ? '生成被中断' : '模型通道错误'
    const err = new Error(`${label}：${f.message || '未知原因'}${f.status ? `（HTTP ${f.status}）` : ''}；请重试`)
    err.code = f.code || (finish.kind === 'aborted' ? 'ABORTED' : 'LLM_ERROR')
    throw err
  }
  const sql = extractSql([...parts.values()].join(''))
  if (!sql) {
    const err = new Error('模型未返回 SQL（只输出了推理或说明）；请把问题说得更具体后重试')
    err.code = 'NO_SQL'
    throw err
  }
  return { sql, model: `${provider}/${model}` }
}

// streamImpl 注入：真实＝ctx.llm.stream；单测＝mock 分片流（不烧 token）。
// 非超时失败自动重试一次；超时不重试，避免把等待翻倍。
export async function generateSql({ streamImpl, provider, model, question, schema, timeoutMs = 20000, maxTotalMs = 180000 }) {
  const args = { streamImpl, provider, model, prompt: buildPrompt(question, buildSchemaContext(schema)), timeoutMs, maxTotalMs }
  try {
    return await attemptOnce(args)
  } catch (err) {
    if (err.code === 'ETIMEOUT') throw err
    return await attemptOnce(args)
  }
}
