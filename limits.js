// 限量/超时配置：默认 1000 行 / 10s；可配不可关（非法值一律回退默认，不存在关闭态）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULTS = { maxRows: 1000, timeoutMs: 10000 }
const CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'limits.json')

export function loadLimits(configPath = CONFIG_PATH) {
  let raw = {}
  try { raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { /* 无文件/坏文件＝默认 */ }
  const maxRows = Number.isInteger(raw.maxRows) && raw.maxRows >= 1 ? raw.maxRows : DEFAULTS.maxRows
  const timeoutMs = Number.isInteger(raw.timeoutMs) && raw.timeoutMs >= 100 ? raw.timeoutMs : DEFAULTS.timeoutMs
  return { maxRows, timeoutMs }
}
