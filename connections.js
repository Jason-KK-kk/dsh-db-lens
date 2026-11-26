// 连接管理：connections.json（0600，.gitignore 排除）。内置示例 SQLite 恒在、默认选中。
// 密码只存文件、绝不进日志/聊天/API 返回（sanitize 打码）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const CONN_PATH = path.join(DIR, 'connections.json')
const SAMPLE_PATH = path.join(DIR, 'sample.sqlite')

export const SAMPLE_CONN = { id: 'sample', name: '内置示例 SQLite', type: 'sqlite', path: SAMPLE_PATH, builtin: true }

export function loadConnections(file = CONN_PATH) {
  let stored = { connections: [], activeId: 'sample' }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (Array.isArray(raw.connections)) stored = raw
  } catch { /* 无文件/坏文件＝只有内置 */ }
  const connections = [SAMPLE_CONN, ...stored.connections.filter((c) => c && c.id !== 'sample')]
  return { connections, activeId: stored.activeId || 'sample' }
}

export function saveConnections(data, file = CONN_PATH) {
  const custom = data.connections.filter((c) => !c.builtin)
  fs.writeFileSync(file, JSON.stringify({ connections: custom, activeId: data.activeId }, null, 2), { mode: 0o600 })
  try { fs.chmodSync(file, 0o600) } catch { /* 收窄已存在文件 */ }
}

export function getActive(state) {
  return state.connections.find((c) => c.id === state.activeId) || SAMPLE_CONN
}

export function sanitizeConn(c) {
  const { password, ...rest } = c
  return password != null ? { ...rest, password: '******' } : rest
}

export function validateConn(input) {
  if (!input || typeof input !== 'object') return '连接配置必须是对象'
  if (!input.name || typeof input.name !== 'string') return '缺少连接名称 name'
  if (input.type === 'sqlite') {
    if (!input.path || typeof input.path !== 'string') return 'SQLite 需要文件路径 path'
    return null
  }
  if (input.type === 'mysql' || input.type === 'pg') {
    if (!input.host || typeof input.host !== 'string') return '缺少主机 host'
    if (!input.database || typeof input.database !== 'string') return '缺少数据库名 database'
    if (!input.user || typeof input.user !== 'string') return '缺少用户名 user'
    if (input.port != null && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) return '端口 port 不合法'
    return null
  }
  return 'type 必须是 sqlite/mysql/pg'
}

export function addConnection(state, input, file = CONN_PATH) {
  const err = validateConn(input)
  if (err) throw new Error(err)
  const conn = { ...input, id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
  if (conn.type === 'mysql' && conn.port == null) conn.port = 3306
  if (conn.type === 'pg' && conn.port == null) conn.port = 5432
  state.connections.push(conn)
  saveConnections(state, file)
  return conn
}

export function setActive(state, id, file = CONN_PATH) {
  if (!state.connections.some((c) => c.id === id)) throw new Error('连接不存在: ' + id)
  state.activeId = id
  saveConnections(state, file)
}
