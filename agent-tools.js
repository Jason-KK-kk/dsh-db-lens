// agent 查数工具：与面板完全同一条护栏路（runQueryTimed：闸/readOnly/限量/超时/审计），无旁路。
// 定位：只读约束下的自主查数；人确认闸属面板问数流，工具靠只读护栏兜底。
import { runQueryTimed } from './index.js'
import { extractSchemaFor } from './drivers.js'
import { loadLimits } from './limits.js'
import { audit } from './audit.js'

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

export function makeDbTools(opts = {}) {
  const getConn = opts.getConn || (() => (opts.dbPath ? { type: 'sqlite', path: opts.dbPath } : undefined))
  const auditOpts = opts.auditPath ? { path: opts.auditPath } : {}

  const queryTool = {
    name: 'db_lens_query',
    description: '对内置示例 SQLite 库执行一条只读 SQL（仅 SELECT/WITH/SHOW/EXPLAIN/只读 PRAGMA）。写语句/DDL 一律拒绝并留审计；行数上限与超时强制生效（可配不可关）；每次调用留审计。先用 db_lens_schema 查看真实表结构，不要编造表名列名。',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: '一条只读 SQL 语句（单条，禁分号堆叠）' },
      },
      required: ['sql'],
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      if (typeof args?.sql !== 'string' || !args.sql.trim()) throw new Error('参数 sql 必须是非空字符串')
      const limits = opts.limits ?? loadLimits()
      const conn = getConn() || { type: 'sqlite' }
      const connMeta = { conn: conn.id || 'sample', engine: conn.type || 'sqlite' }
      try {
        const r = await runQueryTimed(args.sql, [], conn, limits)
        audit(r.truncated ? 'truncate' : 'query', {
          ...auditOpts, ...connMeta, sql: args.sql, rowCount: r.rowCount,
          ...(r.truncated ? { maxRows: r.maxRows } : {}),
          durationMs: r.durationMs, via: 'agent',
        })
        return JSON.stringify({
          columns: r.columns, rows: r.rows, rowCount: r.rowCount,
          truncated: r.truncated, maxRows: r.maxRows,
        })
      } catch (err) {
        const msg = err && err.message ? err.message : String(err)
        const isGate = err?.name === 'GateError'
        const isTimeout = err?.code === 'ETIMEOUT'
        audit(isGate ? 'reject' : isTimeout ? 'timeout' : 'error', { ...auditOpts, ...connMeta, sql: args.sql, reason: msg, via: 'agent' })
        throw new Error((isGate ? '只读护栏拒绝：' : isTimeout ? '超时中断：' : '查询失败：') + msg)
      }
    },
  }

  const schemaTool = {
    name: 'db_lens_schema',
    description: '查看内置示例 SQLite 库的真实结构（库→表→列，含类型/主键/行数）。只读，不执行任何 SQL。',
    parameters: { type: 'object', properties: {} },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute() {
      return JSON.stringify(await extractSchemaFor(getConn() || { type: 'sqlite' }))
    },
  }

  return [queryTool, schemaTool]
}
