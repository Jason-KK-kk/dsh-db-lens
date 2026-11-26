// 查询子进程：跑同步查询；主进程到点 SIGKILL 真杀（worker.terminate 杀不掉 C++ 同步调用，实测弃用）。
// readOnly 连接无写事务，被杀不产生半写。
import { runQuery } from './index.js'

process.on('message', (data) => {
  try {
    const result = runQuery(data.sql, data.params, data.dbPath, data.maxRows)
    process.send({ ok: true, result }, () => process.exit(0))
  } catch (e) {
    process.send({ ok: false, error: e && e.message ? e.message : String(e), gate: e && e.name === 'GateError' }, () => process.exit(0))
  }
})
