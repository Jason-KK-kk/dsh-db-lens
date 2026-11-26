// client 半边：侧栏「数据库透镜」＋中央面板 schema 树（库→表→列，类型/主键）。
// 数据：同源 host 路由 /dblens/schema。结构照港股壳（slots 注册，无构建步骤）。
window.__ModuleLoader__.load({
  id: '@local/dsh-db-lens',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const PANEL_ID = 'db-lens'
    const SCHEMA_EP = '/dblens/schema'
    const QUERY_EP = '/dblens/query'
    const AUDIT_EP = '/dblens/audit'
    const CONN_EP = '/dblens/connections'

    const CSS = `
.dbl-panel{font:13px/1.6 -apple-system,system-ui,sans-serif;padding:16px;color:#ddd;max-width:860px}
.dbl-title{font-size:16px;font-weight:600;margin-bottom:4px}
.dbl-sub{color:#888;font-size:12px;margin-bottom:12px}
.dbl-badge{display:inline-block;padding:0 6px;border-radius:4px;font-size:11px;margin-left:6px}
.dbl-ro{background:#12351f;color:#5ad07f}
.dbl-db{font-weight:600;padding:6px 8px;background:#1d2733;border-radius:6px;display:flex;align-items:center;gap:8px}
.dbl-table{margin:6px 0 0 14px;border-left:2px solid #2c3e50;padding-left:10px}
.dbl-tname{cursor:pointer;user-select:none;padding:3px 6px;border-radius:4px;display:flex;align-items:center;gap:8px}
.dbl-tname:hover{background:#22303f}
.dbl-count{color:#8aa0b5;font-size:12px}
.dbl-cols{margin:2px 0 6px 22px;border-collapse:collapse;width:100%}
.dbl-cols th{color:#7d8fa3;font-weight:500;text-align:left;padding:2px 10px 2px 0;font-size:12px;border-bottom:1px solid #2c3e50}
.dbl-cols td{padding:2px 10px 2px 0;border-bottom:1px solid #202b38;font-family:ui-monospace,monospace;font-size:12px}
.dbl-type{color:#7fb3d8}
.dbl-pk{background:#4a3413;color:#e8b64c}
.dbl-nn{color:#95a5a6;font-size:11px}
.dbl-empty{padding:24px;text-align:center;color:#888}
.dbl-err{color:#e07b6a;padding:12px;background:#3a2320;border-radius:6px}
.dbl-refresh{background:#2c3e50;color:#cdd8e2;border:none;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px}
.dbl-refresh:hover{background:#3a5068}
.dbl-arrow{color:#66808f;width:12px;display:inline-block}
.dbl-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#5aa2c8}
.dbl-qbox{margin-top:18px;border-top:1px solid #2c3e50;padding-top:12px}
.dbl-qtitle{font-weight:600;margin-bottom:6px}
.dbl-sql{width:100%;box-sizing:border-box;min-height:64px;background:#141c26;color:#d5e2ee;border:1px solid #2c3e50;border-radius:6px;padding:8px;font:12px/1.5 ui-monospace,monospace;resize:vertical}
.dbl-qbar{display:flex;gap:8px;align-items:center;margin:8px 0}
.dbl-run{background:#2c6e91;color:#fff;border:none;border-radius:4px;padding:4px 16px;cursor:pointer;font-size:13px}
.dbl-run:hover{background:#3a86ad}
.dbl-run:disabled{opacity:.5;cursor:default}
.dbl-csv{background:#1f4d2e;color:#c9e8d2;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px}
.dbl-csv:hover{background:#2a6a3f}
.dbl-qerr{color:#e88a76;background:#3a2320;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:12px}
.dbl-qmeta{color:#8aa0b5;font-size:12px}
.dbl-results{border-collapse:collapse;width:100%;margin-top:6px}
.dbl-results th{color:#a8c0d5;text-align:left;padding:4px 10px 4px 6px;border-bottom:2px solid #2c3e50;cursor:pointer;user-select:none;white-space:nowrap;font-size:12px}
.dbl-results th:hover{background:#22303f}
.dbl-results td{padding:3px 10px 3px 6px;border-bottom:1px solid #202b38;font-family:ui-monospace,monospace;font-size:12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbl-results tr:hover td{background:#1a2530}
.dbl-sort{color:#5aa2c8;font-size:10px}
.dbl-trunc{color:#e8b64c;background:#4a3413;border-radius:6px;padding:6px 10px;margin:6px 0;font-size:12px}
.dbl-audit{margin-top:16px;border-top:1px solid #2c3e50;padding-top:10px}
.dbl-audit-head{display:flex;gap:8px;align-items:center;font-weight:600}
.dbl-audit-list{margin-top:6px;border-collapse:collapse;width:100%}
.dbl-audit-list th{color:#7d8fa3;text-align:left;font-size:11px;font-weight:500;padding:2px 8px 2px 0;border-bottom:1px solid #2c3e50}
.dbl-audit-list td{font-size:11px;font-family:ui-monospace,monospace;padding:2px 8px 2px 0;border-bottom:1px solid #202b38;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbl-ev-query{color:#5ad07f}.dbl-ev-reject{color:#e07b6a}.dbl-ev-truncate{color:#e8b64c}.dbl-ev-timeout{color:#e8b64c}.dbl-ev-error{color:#95a5a6}
.dbl-conn{margin-bottom:12px;padding:10px;background:#1a2530;border-radius:6px}
.dbl-conn-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dbl-select{background:#141c26;color:#d5e2ee;border:1px solid #2c3e50;border-radius:4px;padding:3px 8px;font-size:12px}
.dbl-conn-form{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dbl-inp{background:#141c26;color:#d5e2ee;border:1px solid #2c3e50;border-radius:4px;padding:3px 8px;font-size:12px;width:120px}
.dbl-conn-msg{font-size:12px;margin-top:6px}
.dbl-ok{color:#5ad07f}.dbl-bad{color:#e07b6a}
`

    function ColumnTable(props) {
      return h('table', { className: 'dbl-cols' },
        h('thead', null, h('tr', null,
          h('th', null, '列'), h('th', null, '类型'), h('th', null, '约束')))
        ,
        h('tbody', null, props.columns.map((c) => h('tr', { key: c.name },
          h('td', null, c.name),
          h('td', { className: 'dbl-type' }, c.type || '—'),
          h('td', null,
            c.pk ? h('span', { className: 'dbl-badge dbl-pk' }, '主键') : null,
            c.notnull && !c.pk ? h('span', { className: 'dbl-nn' }, 'NOT NULL') : null,
            c.default != null ? h('span', { className: 'dbl-nn' }, ' 默认 ' + c.default) : null),
        ))))
    }

    function TableNode(props) {
      const t = props.t
      const [open, setOpen] = useState(false)
      return h('div', { className: 'dbl-table' },
        h('div', { className: 'dbl-tname', onClick: () => setOpen(!open) },
          h('span', { className: 'dbl-arrow' }, open ? '▾' : '▸'),
          h('span', null, t.name),
          h('span', { className: 'dbl-count' }, t.rowCount + ' 行 · ' + t.columns.length + ' 列')),
        open ? h(ColumnTable, { columns: t.columns }) : null)
    }

    function csvCell(v) {
      if (v == null) return ''
      const s = String(v)
      return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s
    }

    function toCsv(columns, rows) {
      const lines = [columns.map(csvCell).join(',')]
      for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','))
      return '\uFEFF' + lines.join('\r\n')
    }

    function sortRows(rows, sort) {
      if (!sort) return rows
      const { col, dir } = sort
      const copy = rows.slice()
      copy.sort((a, b) => {
        const x = a[col]; const y = b[col]
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh')
        return dir === 'asc' ? cmp : -cmp
      })
      return copy
    }

    function QueryBox(props) {
      const { sql, setSql, result, qerr, busy, onExec } = props
      const [sort, setSort] = useState(null)
      const run = useCallback(() => onExec(sql), [sql, onExec])

      const exportCsv = useCallback(() => {
        if (!result) return
        const blob = new Blob([toCsv(result.columns, sortRows(result.rows, sort))], { type: 'text/csv;charset=utf-8' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'db-lens-result.csv'
        a.click()
        URL.revokeObjectURL(a.href)
      }, [result, sort])

      const clickSort = (col) => setSort((s) =>
        s && s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })

      return h('div', { className: 'dbl-qbox' },
        h('div', { className: 'dbl-qtitle' }, '只读查询（仅 SELECT/SHOW/EXPLAIN/只读 PRAGMA）'),
        h('textarea', { className: 'dbl-sql', value: sql, onChange: (e) => setSql(e.target.value), spellCheck: false }),
        h('div', { className: 'dbl-qbar' },
          h('button', { className: 'dbl-run', onClick: run, disabled: busy }, busy ? '执行中…' : '执行'),
          result ? h('button', { className: 'dbl-csv', onClick: exportCsv }, '导出 CSV（' + result.rowCount + ' 行）') : null),
        qerr ? h('div', { className: 'dbl-qerr' }, qerr) : null)
    }

    function ResultView(props) {
      const { result } = props
      const [sort, setSort] = useState(null)
      if (!result) return null
      const clickSort = (col) => setSort((s) =>
        s && s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
      const rows = sortRows(result.rows, sort)
      return h('div', null,
        result.truncated
          ? h('div', { className: 'dbl-trunc' }, '⚠ 已截断至 ' + result.maxRows + ' 行（保留前 ' + result.maxRows + ' 行；行数上限可配不可关）')
          : null,
        h('div', { className: 'dbl-qmeta' }, '返回 ' + result.rowCount + ' 行（点列头排序）'),
        h('table', { className: 'dbl-results' },
          h('thead', null, h('tr', null, result.columns.map((c) => h('th', {
            key: c, onClick: () => clickSort(c),
          }, c, sort && sort.col === c ? h('span', { className: 'dbl-sort' }, sort.dir === 'asc' ? ' ▲' : ' ▼') : null)))),
          h('tbody', null, rows.map((r, i) => h('tr', { key: i },
            result.columns.map((c) => h('td', { key: c, title: r[c] == null ? '' : String(r[c]) },
              r[c] == null ? h('span', { style: { color: '#5a6a7a' } }, 'NULL') : String(r[c]))))))
        ))
    }

    const GEN_EP = '/dblens/generate'

    function NlBox(props) {
      const { onExec, busy } = props
      const [question, setQuestion] = useState('')
      const [genSql, setGenSql] = useState(null)
      const [genModel, setGenModel] = useState(null)
      const [genErr, setGenErr] = useState(null)
      const [generating, setGenerating] = useState(false)

      const generate = useCallback(async () => {
        setGenerating(true)
        setGenErr(null)
        setGenSql(null)
        try {
          const r = await fetch(GEN_EP, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question }),
          })
          const j = await r.json()
          if (!r.ok) { setGenErr(j.error || 'HTTP ' + r.status); return }
          setGenSql(j.sql)
          setGenModel(j.model)
        } catch (e) {
          setGenErr('连接失败：' + (e && e.message ? e.message : String(e)))
        } finally {
          setGenerating(false)
        }
      }, [question])

      return h('div', { className: 'dbl-qbox' },
        h('div', { className: 'dbl-qtitle' }, '自然语言问数（生成后须人确认才执行）'),
        h('textarea', {
          className: 'dbl-sql', style: { minHeight: '40px' },
          placeholder: '用一句话描述想查什么，例如：每个城市的客户数是多少',
          value: question, onChange: (e) => setQuestion(e.target.value), spellCheck: false,
        }),
        h('div', { className: 'dbl-qbar' },
          h('button', { className: 'dbl-run', onClick: generate, disabled: generating || !question.trim() },
            generating ? '生成中…' : '生成 SQL')),
        genErr ? h('div', { className: 'dbl-qerr' }, genErr) : null,
        genSql != null ? h('div', null,
          h('div', { className: 'dbl-trunc' }, '已生成（' + genModel + '）——尚未执行任何查询；确认无误后点「确认执行」，走同一只读护栏'),
          h('textarea', { className: 'dbl-sql', value: genSql, onChange: (e) => setGenSql(e.target.value), spellCheck: false }),
          h('div', { className: 'dbl-qbar' },
            h('button', { className: 'dbl-run', onClick: () => onExec(genSql), disabled: busy }, '确认执行'),
            h('button', { className: 'dbl-refresh', onClick: () => { setGenSql(null); setGenModel(null) } }, '取消'))) : null)
    }

    const EV_LABEL = { query: '查询', reject: '拒写', truncate: '截断', timeout: '超时', error: '错误' }

    function AuditBox() {
      const [open, setOpen] = useState(false)
      const [events, setEvents] = useState(null)
      const load = useCallback(async () => {
        try {
          const r = await fetch(AUDIT_EP)
          const j = await r.json()
          setEvents(j.events || [])
        } catch { setEvents([]) }
      }, [])
      useEffect(() => { if (open) load() }, [open, load])
      return h('div', { className: 'dbl-audit' },
        h('div', { className: 'dbl-audit-head' },
          h('span', null, '审计日志（脱敏留痕・最近 50 条）'),
          h('button', { className: 'dbl-refresh', onClick: () => setOpen(!open) }, open ? '收起' : '查看'),
          open ? h('button', { className: 'dbl-refresh', onClick: load }, '刷新') : null),
        open && events ? h('table', { className: 'dbl-audit-list' },
          h('thead', null, h('tr', null,
            h('th', null, '时间'), h('th', null, '事件'), h('th', null, '行数'), h('th', null, 'SQL/原因'))),
          h('tbody', null, events.slice().reverse().map((e, i) => h('tr', { key: i },
            h('td', null, (e.ts || '').replace('T', ' ').slice(0, 19)),
            h('td', { className: 'dbl-ev-' + e.event }, EV_LABEL[e.event] || e.event),
            h('td', null, e.rowCount != null ? String(e.rowCount) : '—'),
            h('td', { title: e.reason || e.sql || '' }, e.reason || e.sql || ''))))) : null)
    }

    function ConnBox(props) {
      const { onChanged } = props
      const [conns, setConns] = useState([])
      const [activeId, setActiveId] = useState('sample')
      const [showForm, setShowForm] = useState(false)
      const [msg, setMsg] = useState(null)
      const [form, setForm] = useState({ type: 'mysql', name: '', host: '127.0.0.1', port: '3306', user: '', password: '', database: '', path: '' })

      const load = useCallback(async () => {
        try {
          const r = await fetch(CONN_EP)
          const j = await r.json()
          setConns(j.connections || [])
          setActiveId(j.activeId || 'sample')
        } catch { /* 忽略 */ }
      }, [])
      useEffect(() => { load() }, [load])

      const select = useCallback(async (id) => {
        setMsg(null)
        const r = await fetch(CONN_EP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select', id }) })
        const j = await r.json()
        if (!r.ok) { setMsg({ ok: false, text: j.error || '切换失败' }); return }
        setActiveId(j.activeId)
        setMsg({ ok: true, text: '已切换连接' })
        onChanged()
      }, [onChanged])

      const add = useCallback(async () => {
        setMsg(null)
        const payload = { type: form.type, name: form.name || (form.type + ' 连接') }
        if (form.type === 'sqlite') payload.path = form.path
        else { payload.host = form.host; payload.port = parseInt(form.port, 10); payload.user = form.user; payload.password = form.password; payload.database = form.database }
        const r = await fetch(CONN_EP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json()
        if (!r.ok) { setMsg({ ok: false, text: j.error || '添加失败' }); return }
        setMsg({ ok: true, text: '已添加 ' + j.name })
        setShowForm(false)
        load()
      }, [form, load])

      const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
      const inp = (k, ph, type) => h('input', { className: 'dbl-inp', placeholder: ph, type: type || 'text', value: form[k], onChange: set(k) })

      return h('div', { className: 'dbl-conn' },
        h('div', { className: 'dbl-conn-row' },
          h('span', null, '连接：'),
          h('select', { className: 'dbl-select', value: activeId, onChange: (e) => select(e.target.value) },
            conns.map((c) => h('option', { key: c.id, value: c.id }, c.name + '（' + c.type + '）'))),
          h('button', { className: 'dbl-refresh', onClick: () => setShowForm(!showForm) }, showForm ? '收起' : '＋ 添加连接')),
        showForm ? h('div', { className: 'dbl-conn-form' },
          h('select', { className: 'dbl-select', value: form.type, onChange: (e) => setForm((f) => ({ ...f, type: e.target.value, port: e.target.value === 'pg' ? '5432' : '3306' })) },
            h('option', { value: 'mysql' }, 'MySQL'), h('option', { value: 'pg' }, 'PostgreSQL'), h('option', { value: 'sqlite' }, 'SQLite')),
          inp('name', '连接名'),
          form.type === 'sqlite'
            ? inp('path', 'SQLite 文件路径')
            : [inp('host', '主机'), inp('port', '端口'), inp('user', '用户名'), inp('password', '密码', 'password'), inp('database', '数据库名')],
          h('button', { className: 'dbl-run', onClick: add }, '保存')) : null,
        msg ? h('div', { className: 'dbl-conn-msg ' + (msg.ok ? 'dbl-ok' : 'dbl-bad') }, msg.text) : null)
    }

    function Panel() {
      const [schema, setSchema] = useState(null)
      const [error, setError] = useState(null)
      const [sqlInput, setSqlInput] = useState('SELECT id, customer_id, status, total, created_at\nFROM orders\nORDER BY total DESC')
      const [exec, setExec] = useState({ result: null, qerr: null, busy: false })

      const execSql = useCallback(async (sql) => {
        setExec({ result: null, qerr: null, busy: true })
        try {
          const r = await fetch(QUERY_EP, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sql }),
          })
          const j = await r.json()
          if (!r.ok) {
            setExec({ result: null, busy: false, qerr: (r.status === 403 ? '已拒绝（只读白名单）：' : r.status === 408 ? '已超时中断：' : '查询失败：') + (j.error || 'HTTP ' + r.status) })
            return
          }
          setExec({ result: j, qerr: null, busy: false })
        } catch (e) {
          setExec({ result: null, busy: false, qerr: '连接失败：' + (e && e.message ? e.message : String(e)) })
        }
      }, [])
      const load = useCallback(async () => {
        try {
          const r = await fetch(SCHEMA_EP)
          const j = await r.json()
          if (!r.ok) { setError('schema 获取失败 HTTP ' + r.status + ': ' + (j.error || '')); return }
          setSchema(j)
          setError(null)
        } catch (e) {
          setError('连接失败：' + (e && e.message ? e.message : String(e)))
        }
      }, [])
      useEffect(() => { load() }, [load])

      let body
      if (error) body = h('div', { className: 'dbl-err' }, error)
      else if (!schema) body = h('div', { className: 'dbl-empty' }, '正在加载 schema…')
      else if (!schema.tables.length) body = h('div', { className: 'dbl-empty' }, '库里没有用户表')
      else body = h('div', null,
        h('div', { className: 'dbl-db' }, '🗄 ' + schema.database,
          h('span', { className: 'dbl-badge dbl-ro' }, '只读'),
          h('span', { className: 'dbl-count' }, schema.engine)),
        schema.tables.map((t) => h(TableNode, { key: t.name, t })))

      return h('div', { className: 'dbl-panel' },
        h('style', null, CSS),
        h('div', { className: 'dbl-title' }, '数据库透镜'),
        h('div', { className: 'dbl-sub' },
          '只读・限量・留痕的查数窗口（SQLite/MySQL/PostgreSQL） ',
          h('button', { className: 'dbl-refresh', onClick: load }, '刷新')),
        h(ConnBox, { onChanged: () => { setExec({ result: null, qerr: null, busy: false }); load() } }),
        body,
        h(QueryBox, { sql: sqlInput, setSql: setSqlInput, result: exec.result, qerr: exec.qerr, busy: exec.busy, onExec: execSql }),
        h(NlBox, { onExec: execSql, busy: exec.busy }),
        h(ResultView, { result: exec.result }),
        h(AuditBox))
    }

    function SidebarIcon() {
      return h('div', { className: 'dbl-icon', title: '数据库透镜' }, '库')
    }

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 22,
          label: () => '数据库透镜',
        }, SidebarIcon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, Panel))
      },
    }
  },
})
