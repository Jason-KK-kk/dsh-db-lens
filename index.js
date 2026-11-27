// host 半边：多连接只读查数。SQLite 走子进程超时；MySQL/PG 走异步驱动＋READ ONLY 事务。
// 只读双层：白名单闸＋驱动层（sqlite readOnly / mysql·pg READ ONLY 事务＋只读用户）。
import { fileURLToPath } from 'node:url'
import { fork } from 'node:child_process'
import { assertReadOnly, GateError } from './sql-guard.js'
import { loadLimits, DEFAULTS } from './limits.js'
import { audit, readAuditTail } from './audit.js'
import { generateSql } from './nl2sql.js'
import { makeDbTools } from './agent-tools.js'
import { extractSchema, runQuery, extractSchemaFor, runQueryFor, testConnectionFor } from './drivers.js'
import { loadConnections, getActive, addConnection, setActive, sanitizeConn, validateConn, SAMPLE_CONN } from './connections.js'

// 兼容旧调用方（测试/worker 仍从 index 导入）
export { extractSchema, runQuery }

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

// 统一执行入口：conn 可为连接对象或 SQLite 路径字符串（兼容）。
// SQLite 同步驱动→子进程 SIGKILL 真超时；MySQL/PG 异步驱动→驱动内 READ ONLY＋超时。
export function runQueryTimed(sql, params = [], connOrPath = SAMPLE_CONN, limits = DEFAULTS) {
  assertReadOnly(sql)
  if (!Array.isArray(params)) throw new GateError('params 必须是数组')
  const conn = typeof connOrPath === 'string' ? { type: 'sqlite', path: connOrPath } : (connOrPath || SAMPLE_CONN)
  if (conn.type !== 'sqlite') {
    return Promise.resolve(runQueryFor(conn, sql, params, limits)).then((r) => ({ ...r, durationMs: 0 }))
  }
  const dbPath = conn.path
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./query-worker.js', import.meta.url)), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const started = Date.now()
    let settled = false
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      fn(arg)
    }
    const timer = setTimeout(() => {
      const err = new Error(`查询超时（>${limits.timeoutMs}ms），已中断`)
      err.code = 'ETIMEOUT'
      finish(reject, err)
    }, limits.timeoutMs)
    child.send({ sql, params, dbPath, maxRows: limits.maxRows })
    child.once('message', (msg) => {
      if (msg.ok) finish(resolve, { ...msg.result, durationMs: Date.now() - started })
      else {
        const err = new Error(msg.error)
        if (msg.gate) err.name = 'GateError'
        finish(reject, err)
      }
    })
    child.once('error', (e) => finish(reject, e))
    child.once('exit', (code, signal) => {
      if (!settled && signal !== 'SIGKILL') finish(reject, new Error(`查询进程异常退出 code=${code} signal=${signal}`))
    })
  })
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function makeSchemaHandler(connOrPath = SAMPLE_CONN) {
  const getConn = typeof connOrPath === 'function' ? connOrPath : () => (typeof connOrPath === 'string' ? { type: 'sqlite', path: connOrPath } : connOrPath)
  return async function handler(req, res) {
    try {
      sendJson(res, 200, await extractSchemaFor(getConn()))
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : String(err) })
    }
  }
}

export function makeQueryHandler(connOrPath = SAMPLE_CONN, opts = {}) {
  const getConn = typeof connOrPath === 'function' ? connOrPath : () => (typeof connOrPath === 'string' ? { type: 'sqlite', path: connOrPath } : connOrPath)
  const auditOpts = opts.auditPath ? { path: opts.auditPath } : {}
  return async function handler(req, res) {
    if (req.method !== 'POST') { sendJson(res, 405, { error: '仅 POST' }); return }
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { error: '请求体不是合法 JSON' })
      return
    }
    const sql = payload.sql
    const limits = opts.limits ?? loadLimits()
    const conn = getConn()
    const connMeta = { conn: conn.id || 'sample', engine: conn.type || 'sqlite' }
    try {
      const result = await runQueryTimed(sql, payload.params ?? [], conn, limits)
      audit(result.truncated ? 'truncate' : 'query', {
        ...auditOpts, ...connMeta, sql, rowCount: result.rowCount,
        ...(result.truncated ? { maxRows: result.maxRows } : {}),
        durationMs: result.durationMs,
      })
      sendJson(res, 200, result)
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      const isGate = err instanceof GateError || err?.name === 'GateError'
      const isTimeout = err && err.code === 'ETIMEOUT'
      audit(isGate ? 'reject' : isTimeout ? 'timeout' : 'error', { ...auditOpts, ...connMeta, sql, reason: msg })
      sendJson(res, isGate ? 403 : isTimeout ? 408 : 400, { error: msg })
    }
  }
}

// 生成端点：只生成 SQL，绝不执行、绝不写查询审计。执行须人确认后走 /dblens/query。
export function makeGenerateHandler(generate, connOrPath = SAMPLE_CONN) {
  const getConn = typeof connOrPath === 'function' ? connOrPath : () => (typeof connOrPath === 'string' ? { type: 'sqlite', path: connOrPath } : connOrPath)
  return async function handler(req, res) {
    if (req.method !== 'POST') { sendJson(res, 405, { error: '仅 POST' }); return }
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { error: '请求体不是合法 JSON' })
      return
    }
    if (typeof payload.question !== 'string' || !payload.question.trim()) {
      sendJson(res, 400, { error: 'question 不能为空' })
      return
    }
    const hasProvider = payload.provider != null
    const hasModel = payload.model != null
    if (hasProvider !== hasModel) {
      sendJson(res, 400, { error: 'provider 与 model 须同时提供' })
      return
    }
    let override
    if (hasProvider) {
      if (typeof payload.provider !== 'string' || !payload.provider.trim() || typeof payload.model !== 'string' || !payload.model.trim()) {
        sendJson(res, 400, { error: 'provider 与 model 须为非空字符串' })
        return
      }
      override = { provider: payload.provider, model: payload.model }
    }
    try {
      const schema = await extractSchemaFor(getConn())
      const out = await generate(payload.question, schema, override)
      sendJson(res, 200, { sql: out.sql, model: out.model, executed: false })
    } catch (err) {
      const code = err && err.code ? err.code : 'LLM_ERROR'
      sendJson(res, code === 'ETIMEOUT' ? 504 : 502, {
        error: '生成失败：' + (err && err.message ? err.message : String(err)),
        code,
        retryable: true,
      })
    }
  }
}

export function makeAuditHandler(opts = {}) {
  const auditOpts = opts.auditPath ? { path: opts.auditPath } : {}
  return function handler(req, res) {
    sendJson(res, 200, { events: readAuditTail(50, auditOpts) })
  }
}

export function makeConnectionsHandler(state) {
  return async function handler(req, res) {
    if (req.method === 'GET') {
      sendJson(res, 200, { connections: state.connections.map(sanitizeConn), activeId: state.activeId })
      return
    }
    if (req.method === 'POST') {
      let payload
      try { payload = JSON.parse(await readBody(req)) } catch { sendJson(res, 400, { error: '请求体不是合法 JSON' }); return }
      try {
        if (payload.action === 'select') {
          setActive(state, payload.id)
          sendJson(res, 200, { activeId: state.activeId })
        } else {
          const conn = addConnection(state, payload)
          sendJson(res, 200, sanitizeConn(conn))
        }
      } catch (err) {
        sendJson(res, 400, { error: err && err.message ? err.message : String(err) })
      }
      return
    }
    sendJson(res, 405, { error: '仅 GET/POST' })
  }
}

// 试连路由：只试连不查数、不落盘、不进查询审计。表单全量或 {id} 试已存连接；响应不含密码。
export function makeTestConnectionHandler(state) {
  return async function handler(req, res) {
    if (req.method !== 'POST') { sendJson(res, 405, { error: '仅 POST' }); return }
    let payload
    try { payload = JSON.parse(await readBody(req)) } catch { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return }
    let conn
    if (payload && typeof payload.id === 'string' && payload.id) {
      conn = state.connections.find((c) => c.id === payload.id)
      if (!conn) { sendJson(res, 400, { ok: false, error: '连接不存在: ' + payload.id }); return }
    } else {
      const err = validateConn(payload)
      if (err) { sendJson(res, 400, { ok: false, error: err }); return }
      conn = payload
    }
    try {
      sendJson(res, 200, { ok: true, ...(await testConnectionFor(conn)) })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err && err.message ? err.message : String(err) })
    }
  }
}

// 模型目录：照 dsh-api-session-controller 范式 listProviders→listModels；单 provider 失败隔离。
// 目录不含当前默认模型时把默认置顶补入（只补默认这一条，不硬造其余模型）。
export function makeModelsHandler(llm, defaultModel) {
  return async function handler(req, res) {
    if (req.method !== 'GET') { sendJson(res, 405, { error: '仅 GET' }); return }
    const sel = defaultModel.currentSelection()
    const models = []
    const failed = []
    for (const p of llm.listProviders()) {
      try {
        for (const m of await llm.listModels(p.id)) {
          models.push({ provider: p.id, id: m.id, name: m.name || m.id, ...(m.description ? { description: m.description } : {}) })
        }
      } catch { failed.push(p.id) }
    }
    if (!models.some((m) => m.provider === sel.provider && m.id === sel.model)) {
      models.unshift({ provider: sel.provider, id: sel.model, name: sel.model })
    }
    sendJson(res, 200, { models, default: { provider: sel.provider, model: sel.model }, failedProviders: failed })
  }
}

export function apply(ctx) {
  const state = loadConnections()
  const getConn = () => getActive(state)
  ctx.inject(['webServer'], (scoped) => {
    const routes = [
      ['/dblens/schema', makeSchemaHandler(getConn)],
      ['/dblens/query', makeQueryHandler(getConn)],
      ['/dblens/audit', makeAuditHandler()],
      ['/dblens/connections', makeConnectionsHandler(state)],
      ['/dblens/test-connection', makeTestConnectionHandler(state)],
    ]
    for (const [p, handler] of routes) {
      scoped.effect(() => scoped.webServer.register({ kind: 'exact', path: p, handler }), `db-lens: ${p}`)
    }
  })
  ctx.inject(['webServer', 'llm', 'agentDefaultModel'], (scoped) => {
    const generate = (question, schema, override) => {
      const sel = scoped.agentDefaultModel.currentSelection()
      return generateSql({
        streamImpl: (opts) => scoped.llm.stream(opts),
        provider: override?.provider || sel.provider, model: override?.model || sel.model, question, schema,
      })
    }
    scoped.effect(
      () => scoped.webServer.register({ kind: 'exact', path: '/dblens/generate', handler: makeGenerateHandler(generate, getConn) }),
      'db-lens: generate route',
    )
    scoped.effect(
      () => scoped.webServer.register({ kind: 'exact', path: '/dblens/models', handler: makeModelsHandler(scoped.llm, scoped.agentDefaultModel) }),
      'db-lens: models route',
    )
  })
  ctx.inject(['tools'], (scoped) => {
    for (const tool of makeDbTools({ getConn })) {
      scoped.effect(() => scoped.tools.register(tool), `db-lens: tool ${tool.name}`)
    }
  })
}
