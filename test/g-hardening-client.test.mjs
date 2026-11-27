// G 批 client 闸：①网格 a11y（th 排序/td 全值 tabIndex+role+keydown）②问数严格模式开关。
// 先红：旧 client 网格纯鼠标可达、AskCard 无开关。存在性闸＋最小 hooks 运行时 mount 真实组件源码
// （照 enhance-e-client.test.mjs 约定：new Function 只编译本仓库 client.js 自身源码）。
// 真实 DOM/键盘/截图证据另见 evidence/N-*。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fs.readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
const css = (src.match(/const CSS = `([\s\S]*?)`/) || [])[1] || ''
const body = (name) => {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}'))
  assert.ok(m, 'client.js 里找不到 ' + name)
  return m[0]
}

test('存在性：settings 路由＋严格模式文案＋网格 tabIndex/role 在 client', () => {
  assert.ok(src.includes('/dblens/settings'), '缺 settings 路由')
  assert.ok(src.includes('严格模式'), '缺严格模式文案')
  assert.match(src, /tabIndex/, '网格应可键盘聚焦')
})

test('CSS：focus-visible 焦点环规则覆盖全组件（含 th/td）', () => {
  assert.match(css, /\.dblens :focus-visible\{outline:2px solid var\(--jade\)/)
})

// ── 最小 hooks 运行时 ─────────────────────────────────────────────────
const eq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
function makeHooks() {
  const slots = []
  let cursor = 0
  const api = {
    dirty: false, pending: [],
    reset() { cursor = 0 },
    useState(init) {
      const i = cursor++
      if (!(i in slots)) slots[i] = { v: typeof init === 'function' ? init() : init }
      const s = slots[i]
      return [s.v, (nv) => { const next = typeof nv === 'function' ? nv(s.v) : nv; if (next !== s.v) { s.v = next; api.dirty = true } }]
    },
    useCallback(fn, deps) {
      const i = cursor++
      if (!(i in slots) || !eq(slots[i].deps, deps)) slots[i] = { deps, fn }
      return slots[i].fn
    },
    useMemo(fn, deps) {
      const i = cursor++
      if (!(i in slots) || !eq(slots[i].deps, deps)) slots[i] = { deps, v: fn() }
      return slots[i].v
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (!(i in slots) || !eq(slots[i].deps, deps)) { slots[i] = { deps }; api.pending.push(fn) }
    },
  }
  return api
}
const Chev = () => ({ type: 'svg', props: { className: 'chev' }, kids: [] })

function makeEnv(fetchImpl) {
  const stores = new Map()
  const root = makeHooks()
  let current = root
  let tree = null
  const docListeners = {}
  const fakeDocument = {
    addEventListener: (t, f) => { (docListeners[t] ||= []).push(f) },
    removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter((x) => x !== f) },
    fire: (t, ev) => { for (const f of docListeners[t] || []) f(ev) },
    createElement: () => ({ style: {} }),
    body: { appendChild() {} },
  }
  const h = (type, props, ...kids) => {
    const p = props || {}
    const flat = kids.flat(Infinity).filter((k) => k != null && k !== false)
    if (typeof type === 'function') {
      const id = (type.name || 'anon') + ':' + (p.key ?? '')
      if (!stores.has(id)) stores.set(id, makeHooks())
      const st = stores.get(id)
      const prev = current
      current = st
      st.reset()
      const out = type({ ...p, children: flat.length === 1 ? flat[0] : flat })
      current = prev
      return out
    }
    return { type, props: p, kids: flat }
  }
  const hooks = {
    useState: (i) => current.useState(i),
    useCallback: (f, d) => current.useCallback(f, d),
    useMemo: (f, d) => current.useMemo(f, d),
    useEffect: (f, d) => current.useEffect(f, d),
  }
  const compiled = new Map()
  const DEPS = {
    csvCell: [], sortRows: [], toCsv: ['csvCell'],
    Notice: ['h'], Card: ['h', 'Chev'],
    CellPop: ['h', 'useState', 'useEffect', 'useCallback', 'document', 'window'],
    ResultCard: ['h', 'useState', 'useEffect', 'useMemo', 'useCallback', 'Card', 'Notice', 'CellPop', 'sortRows', 'toCsv'],
    AskCard: ['h', 'useState', 'useEffect', 'useCallback', 'Card', 'Notice', 'fetch', 'GEN_EP', 'MODELS_EP', 'SETTINGS_EP'],
  }
  const COMPONENTS = ['Notice', 'Card', 'CellPop', 'ResultCard', 'AskCard']
  const compile = (name) => {
    if (!compiled.has(name)) {
      const vals = {
        h, Chev, fetch: fetchImpl, document: fakeDocument, window: { innerWidth: 1600, innerHeight: 900 },
        GEN_EP: '/dblens/generate', MODELS_EP: '/dblens/models', SETTINGS_EP: '/dblens/settings', ...hooks,
      }
      for (const d of DEPS[name]) if (COMPONENTS.includes(d) || ['csvCell', 'sortRows', 'toCsv'].includes(d)) vals[d] = compile(d)
      const args = DEPS[name]
      compiled.set(name, new Function(...args, body(name) + '\nreturn ' + name)(...args.map((a) => vals[a])))
    }
    return compiled.get(name)
  }
  return {
    h, compile, doc: fakeDocument,
    async settle(render) {
      for (let guard = 0; guard < 80; guard++) {
        for (const st of stores.values()) st.dirty = false
        root.dirty = false
        root.reset()
        current = root
        tree = render(h)
        const pend = [...root.pending.splice(0)]
        for (const st of stores.values()) pend.push(...st.pending.splice(0))
        for (const fn of pend) fn()
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))
        let dirty = root.dirty
        for (const st of stores.values()) if (st.dirty) dirty = true
        if (!dirty) return tree
      }
      throw new Error('渲染不收敛')
    },
    tree: () => tree,
  }
}
const find = (node, pred) => {
  if (!node || typeof node !== 'object') return null
  if (pred(node)) return node
  for (const k of node.kids || []) { const hit = find(k, pred); if (hit) return hit }
  return null
}
const findAll = (node, pred, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  for (const k of node.kids || []) findAll(k, pred, out)
  return out
}
const byClass = (cls) => (n) => String(n.props.className || '').split(' ').includes(cls)
const noticeOf = (kind) => (n) => byClass('notice')(n) && byClass(kind)(n)
const noticeText = (n) => {
  let s = ''
  const walk = (x) => { if (typeof x === 'string') s += x; else if (x && typeof x === 'object') (x.kids || []).forEach(walk) }
  walk(n)
  return s
}
const keyEv = (key) => ({ key, type: 'keydown', preventDefault() {}, currentTarget: { getBoundingClientRect: () => ({ right: 100, bottom: 50 }) } })

// ── 网格 a11y ─────────────────────────────────────────────────────────
const RESULT = {
  columns: ['id', 'total'],
  rows: [{ id: 1, total: 30 }, { id: 2, total: 10 }, { id: 3, total: 20 }],
  rowCount: 3, truncated: false, maxRows: 1000, durationMs: 1,
}
const resultProps = { result: RESULT, open: true, onToggle() {} }
const colTh = (n) => n.type === 'th' && !byClass('rownum')(n)
const valTd = (n) => n.type === 'td' && !byClass('rownum')(n)

test('a11y：列头 tabIndex/role/aria-sort，Enter 升序 Space 降序（真排序）', async () => {
  const env = makeEnv(async () => ({ ok: true, json: async () => ({}) }))
  const R = env.compile('ResultCard')
  const render = (h) => h(R, resultProps)
  await env.settle(render)
  const ths = findAll(env.tree(), colTh)
  assert.equal(ths.length, 2)
  for (const th of ths) {
    assert.equal(th.props.tabIndex, 0, '列头应可聚焦')
    assert.equal(th.props.role, 'button', '列头应有 button 角色')
    assert.equal(typeof th.props.onKeyDown, 'function', '列头应有 keydown')
  }
  const totalTh = ths[1]
  totalTh.props.onKeyDown(keyEv('Enter'))
  await env.settle(render)
  let rows = findAll(env.tree(), valTd)
  assert.equal(rows[1].kids[0], '10', 'Enter 升序后首行 total=10')
  assert.equal(findAll(env.tree(), colTh)[1].props['aria-sort'], 'ascending')
  findAll(env.tree(), colTh)[1].props.onKeyDown(keyEv(' '))
  await env.settle(render)
  rows = findAll(env.tree(), valTd)
  assert.equal(rows[1].kids[0], '30', 'Space 降序后首行 total=30')
  assert.equal(findAll(env.tree(), colTh)[1].props['aria-sort'], 'descending')
})

test('a11y：单元格 tabIndex/role，Enter/Space 开全值弹层，Esc 关；行号列不可聚焦', async () => {
  const env = makeEnv(async () => ({ ok: true, json: async () => ({}) }))
  const R = env.compile('ResultCard')
  const render = (h) => h(R, resultProps)
  await env.settle(render)
  const tds = findAll(env.tree(), valTd)
  for (const td of tds) {
    assert.equal(td.props.tabIndex, 0, '单元格应可聚焦')
    assert.equal(td.props.role, 'button', '单元格应有 button 角色')
    assert.equal(typeof td.props.onKeyDown, 'function', '单元格应有 keydown')
  }
  assert.ok(findAll(env.tree(), (n) => (n.type === 'td' || n.type === 'th') && byClass('rownum')(n)).every((n) => n.props.tabIndex == null), '行号列无交互不应可聚焦')
  tds[1].props.onKeyDown(keyEv('Enter'))
  await env.settle(render)
  const pop = find(env.tree(), byClass('cellpop'))
  assert.ok(pop, 'Enter 应开全值弹层')
  assert.equal(find(pop, (n) => n.type === 'pre').kids[0], '30')
  env.doc.fire('keydown', { key: 'Escape' })
  await env.settle(render)
  assert.equal(find(env.tree(), byClass('cellpop')), null, 'Esc 应关弹层')
  findAll(env.tree(), valTd)[3].props.onKeyDown(keyEv(' '))
  await env.settle(render)
  assert.ok(find(env.tree(), byClass('cellpop')), 'Space 也应开弹层')
})

// ── 问数严格模式开关 ──────────────────────────────────────────────────
const MODELS_REPLY = { models: [{ provider: 'p1', id: 'm1', name: 'M1' }], default: { provider: 'p1', model: 'm1' }, failedProviders: [] }
function askFetch({ settings = { strictNl: true }, settingsOk = true, postOk = true, calls = [] }) {
  return async (url, opts) => {
    calls.push({ url, opts })
    if (url === '/dblens/models') return { ok: true, json: async () => MODELS_REPLY }
    if (url === '/dblens/settings' && (!opts || opts.method !== 'POST')) {
      return settingsOk ? { ok: true, json: async () => settings } : { ok: false, status: 500, json: async () => ({ error: 'down' }) }
    }
    if (url === '/dblens/settings') {
      return postOk ? { ok: true, json: async () => JSON.parse(opts.body) } : { ok: false, status: 500, json: async () => ({ error: 'save failed' }) }
    }
    if (url === '/dblens/generate') return { ok: true, json: async () => ({ sql: 'SELECT 1', model: 'p1/m1', executed: false }) }
    throw new Error('unexpected fetch ' + url)
  }
}
const askProps = (onExec) => ({ onExec, busy: false, open: true, onToggle() {} })
const strictBox = (n) => n.type === 'input' && n.props.type === 'checkbox' && /严格模式/.test(n.props['aria-label'] || '')
async function askGen(env, render) {
  find(env.tree(), (n) => n.type === 'textarea' && n.props['aria-label'] === '自然语言问题').props.onChange({ target: { value: 'q' } })
  await env.settle(render)
  find(env.tree(), (n) => n.type === 'button' && (n.kids || []).some((k) => k === '生成 SQL')).props.onClick()
  await env.settle(render)
}

test('严格默认开：读 settings；生成后出确认闸、零自动执行（现状不回归）', async () => {
  const calls = []
  const execs = []
  const env = makeEnv(askFetch({ calls }))
  const A = env.compile('AskCard')
  const render = (h) => h(A, askProps((sql) => execs.push(sql)))
  await env.settle(render)
  assert.ok(calls.some((c) => c.url === '/dblens/settings'), '应读 settings')
  const box = find(env.tree(), strictBox)
  assert.ok(box, '应有严格模式开关')
  assert.equal(box.props.checked, true, '默认严格开')
  await askGen(env, render)
  assert.ok(find(env.tree(), byClass('gate')), '严格开应出确认闸')
  assert.deepEqual(execs, [], '严格开不得自动执行')
})

test('开关关：POST 持久化＋明示文案；生成后自动执行（走同一 onExec 护栏入口）', async () => {
  const calls = []
  const execs = []
  const env = makeEnv(askFetch({ calls }))
  const A = env.compile('AskCard')
  const render = (h) => h(A, askProps((sql) => execs.push(sql)))
  await env.settle(render)
  find(env.tree(), strictBox).props.onChange({ target: { checked: false } })
  await env.settle(render)
  const posted = calls.filter((c) => c.url === '/dblens/settings' && c.opts && c.opts.method === 'POST')
  assert.equal(posted.length, 1)
  assert.deepEqual(JSON.parse(posted[0].opts.body), { strictNl: false }, '应持久化 false')
  assert.equal(find(env.tree(), strictBox).props.checked, false)
  const note = find(env.tree(), noticeOf('info'))
  assert.ok(note, '关态应有明示 notice')
  assert.match(noticeText(note), /自动执行/, '文案应说明自动执行')
  assert.match(noticeText(note), /只读/, '文案应说明仍只读')
  await askGen(env, render)
  assert.deepEqual(execs, ['SELECT 1'], '关态生成后应自动执行生成的 SQL')
  assert.equal(find(env.tree(), byClass('gate')), null, '关态不再出确认闸')
  assert.ok(find(env.tree(), (n) => byClass('chip')(n) && (n.kids || []).includes('已执行')), '应显已执行')
})

test('settings 读取失败：安全回退严格开，生成后仍出确认闸', async () => {
  const execs = []
  const env = makeEnv(askFetch({ settingsOk: false }))
  const A = env.compile('AskCard')
  const render = (h) => h(A, askProps((sql) => execs.push(sql)))
  await env.settle(render)
  assert.equal(find(env.tree(), strictBox).props.checked, true, '读失败默认严格开')
  await askGen(env, render)
  assert.ok(find(env.tree(), byClass('gate')), '回退后应出确认闸')
  assert.deepEqual(execs, [])
})

test('开关保存失败：状态不变＋红提醒（不装成功）', async () => {
  const env = makeEnv(askFetch({ postOk: false }))
  const A = env.compile('AskCard')
  const render = (h) => h(A, askProps(() => {}))
  await env.settle(render)
  find(env.tree(), strictBox).props.onChange({ target: { checked: false } })
  await env.settle(render)
  assert.equal(find(env.tree(), strictBox).props.checked, true, '保存失败不得翻状态')
  const bad = find(env.tree(), noticeOf('bad'))
  assert.ok(bad, '保存失败应有红提醒')
})

test('关→开回切：恢复确认闸（往返持久化）', async () => {
  const calls = []
  const execs = []
  const env = makeEnv(askFetch({ calls }))
  const A = env.compile('AskCard')
  const render = (h) => h(A, askProps((sql) => execs.push(sql)))
  await env.settle(render)
  find(env.tree(), strictBox).props.onChange({ target: { checked: false } })
  await env.settle(render)
  find(env.tree(), strictBox).props.onChange({ target: { checked: true } })
  await env.settle(render)
  const posts = calls.filter((c) => c.url === '/dblens/settings' && c.opts && c.opts.method === 'POST').map((c) => JSON.parse(c.opts.body))
  assert.deepEqual(posts, [{ strictNl: false }, { strictNl: true }])
  await askGen(env, render)
  assert.ok(find(env.tree(), byClass('gate')), '回切严格开应恢复确认闸')
  assert.deepEqual(execs, [])
})
