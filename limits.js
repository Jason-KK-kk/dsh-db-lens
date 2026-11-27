// 限量/超时配置：默认 1000 行 / 10s；可配不可关（非法值一律回退默认，不存在关闭态）。
// strictNl＝问数严格模式（生成 SQL 须人确认）：默认开，只有显式布尔 false 才关；
// 只影响 NL 人确认这一层，只读/限量/超时/审计不受其影响。同存 limits.json（0600）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULTS = { maxRows: 1000, timeoutMs: 10000 }
const CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'limits.json')

function readRaw(configPath) {
  try {
    const v = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}

export function loadLimits(configPath = CONFIG_PATH) {
  const raw = readRaw(configPath)
  const maxRows = Number.isInteger(raw.maxRows) && raw.maxRows >= 1 ? raw.maxRows : DEFAULTS.maxRows
  const timeoutMs = Number.isInteger(raw.timeoutMs) && raw.timeoutMs >= 100 ? raw.timeoutMs : DEFAULTS.timeoutMs
  return { maxRows, timeoutMs }
}

export function loadStrictNl(configPath = CONFIG_PATH) {
  return readRaw(configPath).strictNl === false ? false : true
}

export function saveStrictNl(value, configPath = CONFIG_PATH) {
  if (typeof value !== 'boolean') throw new Error('strictNl 必须是布尔值（true/false）')
  const raw = readRaw(configPath)
  raw.strictNl = value
  fs.writeFileSync(configPath, JSON.stringify(raw), { mode: 0o600 })
  try { fs.chmodSync(configPath, 0o600) } catch { /* 收窄已存在文件 */ }
}
