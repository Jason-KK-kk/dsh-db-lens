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
    '',
    schemaContext,
    '',
    `用户问题：${question}`,
  ].join('\n')
}

export function extractSql(text) {
  if (typeof text !== 'string') return ''
  let s = text.trim()
  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const m = s.match(/\b(WITH|SELECT|SHOW|EXPLAIN|PRAGMA)\b[\s\S]*/i)
  return m ? m[0].trim() : ''
}

// streamImpl 注入：真实＝ctx.llm.stream；单测＝mock 分片流（不烧 token）。
export async function generateSql({ streamImpl, provider, model, question, schema, timeoutMs = 30000 }) {
  const prompt = buildPrompt(question, buildSchemaContext(schema))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let text = ''
  try {
    const stream = streamImpl({
      provider, model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
    }
  } finally {
    clearTimeout(timer)
  }
  const sql = extractSql(text)
  if (!sql) throw new Error('模型未返回可用 SQL')
  return { sql, model: `${provider}/${model}` }
}
