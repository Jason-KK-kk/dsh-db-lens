// E 批 client 闸：常显滚动条／测试连接＋提醒／全展开全折叠／问数模型下拉。
// 先红：旧 client.js 无这些行为。存在性闸＋最小 hooks 运行时 mount 真实组件源码
// （每组件独立 hooks store，模拟 React 按实例保 state；fetch 用假件＝HTTP 接缝不可免）。
// new Function 只编译本仓库 client.js 自身源码（照 client-visual.test.mjs 约定），无外部输入。
// 真实 DOM/截图证据另见 evidence/L-*。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fs.readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
const css = (src.match(/const CSS = `([\s\S]*?)`/) || [])[1] || ''
const body = (name) => {
  const m = src.match(new RegExp('function ' + name + '\\(props\\) \\{[\\s\\S]*?\\n    \\}'))
  assert.ok(m, 'client.js 里找不到 ' + name)
  return m[0]
}

// ── 存在性闸 ─────────────────────────────────────────────────────────
test('视觉：.scroll 改 scrollbar-width:auto 让 webkit 12px 常显规则生效（thin 会被 Chrome 忽略）', () => {
  assert.match(css, /\.dblens \.scroll\{scrollbar-width:auto/, '.scroll 应 scrollbar-width:auto')
  assert.doesNotMatch(css, /scrollbar-width:thin/, 'thin 会使 ::-webkit-scrollbar 失效')
  assert.match(css, /\.dblens \.scroll::-webkit-scrollbar\{width:12px;height:12px\}/, '12px 常显规则应保留')
})

test('功能：测试连接路由＋按钮文案在 client', () => {
  assert.ok(src.includes('/dblens/test-connection'), '缺试连路由')
  assert.ok(src.includes('测试连接'), '缺测试连接按钮')
})

test('功能：模型目录路由＋问数模型下拉在 client', () => {
  assert.ok(src.includes('/dblens/models'), '缺模型目录路由')
  assert.ok(src.includes('问数模型'), '缺模型下拉 aria-label')
})

// ── 最小 hooks 运行时（每组件一个 store，key 区分实例） ───────────────
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
    useEffect: (f, d) => current.useEffect(f, d),
  }
  const compiled = new Map()
  const DEPS = {
    Notice: ['h'], RailSec: ['h', 'Chev'], Card: ['h', 'Chev'],
    TableNode: ['h', 'useState', 'Chev'],
    SchemaSec: ['h', 'useState', 'RailSec', 'TableNode', 'Notice', 'Chev'],
    ConnSec: ['h', 'useState', 'useEffect', 'useCallback', 'RailSec', 'Notice', 'fetch', 'CONN_EP', 'TEST_EP'],
    AskCard: ['h', 'useState', 'useEffect', 'useCallback', 'Card', 'Notice', 'fetch', 'GEN_EP', 'MODELS_EP'],
  }
  const compile = (name) => {
    if (!compiled.has(name)) {
      const vals = { h, Chev, fetch: fetchImpl, CONN_EP: '/dblens/connections', TEST_EP: '/dblens/test-connection', GEN_EP: '/dblens/generate', MODELS_EP: '/dblens/models', ...hooks }
      for (const d of DEPS[name]) if (['Notice', 'RailSec', 'Card', 'TableNode'].includes(d)) vals[d] = compile(d)
      const args = DEPS[name]
      compiled.set(name, new Function(...args, body(name) + '\nreturn ' + name)(...args.map((a) => vals[a])))
    }
    return compiled.get(name)
  }
  return {
    h, compile,
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
const btnWith = (text) => (n) => n.type === 'button' && (n.kids || []).some((k) => k === text)
const noticeOf = (kind) => (n) => byClass('notice')(n) && byClass(kind)(n)
const noticeText = (n) => {
  let s = ''
  const walk = (x) => { if (typeof x === 'string') s += x; else if (x && typeof x === 'object') (x.kids || []).forEach(walk) }
  walk(n)
  return s
}

const TABLES = [
  { name: 'customers', rowCount: 120, columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'city', type: 'TEXT' }] },
  { name: 'orders', rowCount: 300, columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'total', type: 'REAL' }] },
  { name: 'order_items', rowCount: 573, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
]
const SCHEMA = { database: 'sample.sqlite', engine: 'sqlite', readOnly: true, tables: TABLES }
const schemaProps = { schema: SCHEMA, error: null, open: true, onToggle() {} }

// ── 全展开/全折叠 ────────────────────────────────────────────────────
test('批量：初始全折叠＋「全部展开」；点一下全展开改「全部折叠」；再点全折叠', async () => {
  const env = makeEnv(async () => ({ ok: true, json: async () => ({}) }))
  const S = env.compile('SchemaSec')
  const render = (h) => h(S, schemaProps)
  await env.settle(render)
  assert.ok(findAll(env.tree(), byClass('tnode')).every((n) => n.props['data-open'] === '0'), '初始应全折叠')
  let btn = find(env.tree(), btnWith('全部展开'))
  assert.ok(btn, '应有「全部展开」按钮')
  btn.props.onClick()
  await env.settle(render)
  assert.ok(findAll(env.tree(), byClass('tnode')).every((n) => n.props['data-open'] === '1'), '批量展开后应全开')
  btn = find(env.tree(), btnWith('全部折叠'))
  assert.ok(btn, '展开后按钮应改「全部折叠」')
  btn.props.onClick()
  await env.settle(render)
  assert.ok(findAll(env.tree(), byClass('tnode')).every((n) => n.props['data-open'] === '0'), '再点应全折叠')
})

test('批量：过滤态只作用于过滤结果；批量后单表 caret 仍可折叠（D 修不回归）', async () => {
  const env = makeEnv(async () => ({ ok: true, json: async () => ({}) }))
  const S = env.compile('SchemaSec')
  const render = (h) => h(S, schemaProps)
  await env.settle(render)
  const inp = find(env.tree(), (n) => n.type === 'input' && n.props['aria-label'] === '过滤表或列')
  inp.props.onChange({ target: { value: 'orde' } })
  await env.settle(render)
  let names = findAll(env.tree(), byClass('tnode')).map((n) => find(n, byClass('tn')).kids[0])
  assert.deepEqual(names, ['orders', 'order_items'], '过滤后只挂匹配表')
  find(env.tree(), btnWith('全部展开')).props.onClick()
  await env.settle(render)
  assert.ok(findAll(env.tree(), byClass('tnode')).every((n) => n.props['data-open'] === '1'), '过滤态批量展开只开匹配表')
  const orders = findAll(env.tree(), byClass('tnode')).find((n) => find(n, byClass('tn')).kids[0] === 'orders')
  find(orders, byClass('trow')).props.onClick()
  await env.settle(render)
  const orders2 = findAll(env.tree(), byClass('tnode')).find((n) => find(n, byClass('tn')).kids[0] === 'orders')
  assert.equal(orders2.props['data-open'], '0', '批量展开后单表 caret 仍应能折叠')
  find(env.tree(), btnWith('全部折叠')).props.onClick()
  await env.settle(render)
  assert.ok(findAll(env.tree(), byClass('tnode')).every((n) => n.props['data-open'] === '0'), '过滤态批量折叠')
  inp.props.onChange({ target: { value: '' } })
  await env.settle(render)
  assert.equal(findAll(env.tree(), byClass('tnode')).length, 3, '清空过滤恢复全表')
  assert.ok(findAll(env.tree(), byClass('tnode')).every((n) => n.props['data-open'] === '0'), '清空过滤回全折叠初态')
})

test('批量：无匹配表时按钮禁用', async () => {
  const env = makeEnv(async () => ({ ok: true, json: async () => ({}) }))
  const S = env.compile('SchemaSec')
  const render = (h) => h(S, { ...schemaProps, schema: { ...SCHEMA, tables: [] } })
  await env.settle(render)
  const btn = find(env.tree(), btnWith('全部展开'))
  assert.ok(btn, '空库也应有按钮')
  assert.equal(btn.props.disabled, true, '无表时批量按钮应禁用')
})

// ── 测试连接＋保存/切换提醒 ──────────────────────────────────────────
const CONN_LIST = { connections: [{ id: 'sample', name: '内置示例', type: 'sqlite' }, { id: 'c1', name: 'My', type: 'mysql', database: 'testdb' }], activeId: 'sample' }
function connFetch(testReply, calls) {
  return async (url, opts) => {
    calls.push({ url, opts })
    if (url === '/dblens/connections' && (!opts || opts.method !== 'POST')) return { ok: true, json: async () => CONN_LIST }
    if (url === '/dblens/connections') return { ok: true, json: async () => ({ activeId: JSON.parse(opts.body).id }) }
    if (url === '/dblens/test-connection') return testReply(JSON.parse(opts.body))
    throw new Error('unexpected fetch ' + url)
  }
}
test('切换连接：成功试连后绿提醒含「连接正常」；试连按 id 发出', async () => {
  const calls = []
  const env = makeEnv(connFetch(async () => ({ ok: true, json: async () => ({ ok: true, engine: 'mysql', database: 'testdb' }) }), calls))
  const C = env.compile('ConnSec')
  const render = (h) => h(C, { open: true, onToggle() {}, onChanged() {}, refreshKey: 0 })
  await env.settle(render)
  const sel = find(env.tree(), (n) => n.type === 'select' && n.props['aria-label'] === '选择连接')
  sel.props.onChange({ target: { value: 'c1' } })
  await env.settle(render)
  const ok = find(env.tree(), noticeOf('ok'))
  assert.ok(ok, '切换＋试连成功应有绿 notice')
  assert.match(noticeText(ok), /已切换/)
  assert.match(noticeText(ok), /连接正常/)
  const t = calls.find((c) => c.url === '/dblens/test-connection')
  assert.deepEqual(JSON.parse(t.opts.body), { id: 'c1' }, '切换后应按 id 试连')
})

test('切换连接：试连失败红提醒含原因（坏连接不装成功）', async () => {
  const calls = []
  const env = makeEnv(connFetch(async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: 'connect ECONNREFUSED 127.0.0.1:1' }) }), calls))
  const C = env.compile('ConnSec')
  const render = (h) => h(C, { open: true, onToggle() {}, onChanged() {}, refreshKey: 0 })
  await env.settle(render)
  find(env.tree(), (n) => n.type === 'select' && n.props['aria-label'] === '选择连接').props.onChange({ target: { value: 'c1' } })
  await env.settle(render)
  const bad = find(env.tree(), noticeOf('bad'))
  assert.ok(bad, '试连失败应有红 notice')
  assert.match(noticeText(bad), /连接失败/)
  assert.match(noticeText(bad), /ECONNREFUSED/, '红提醒应带可读原因')
})

test('表单测试连接：不保存先试连（payload 为表单全量），成功绿提醒', async () => {
  const calls = []
  const env = makeEnv(connFetch(async (p) => ({ ok: true, json: async () => ({ ok: true, engine: p.type, database: p.database }) }), calls))
  const C = env.compile('ConnSec')
  const render = (h) => h(C, { open: true, onToggle() {}, onChanged() {}, refreshKey: 0 })
  await env.settle(render)
  find(env.tree(), (n) => n.type === 'button' && n.props.title === '添加连接').props.onClick()
  await env.settle(render)
  const setInp = (ph, v) => find(env.tree(), (n) => n.type === 'input' && n.props.placeholder === ph).props.onChange({ target: { value: v } })
  setInp('连接名', 'probe')
  setInp('主机', '127.0.0.1')
  setInp('端口', '3306')
  setInp('只读用户名', 'reader')
  setInp('密码', 'unit-test-pass')
  setInp('数据库名', 'testdb')
  await env.settle(render)
  const btn = find(env.tree(), btnWith('测试连接'))
  assert.ok(btn, '表单应有测试连接按钮')
  btn.props.onClick()
  await env.settle(render)
  const t = calls.find((c) => c.url === '/dblens/test-connection')
  assert.ok(t, '应发试连请求')
  const sent = JSON.parse(t.opts.body)
  assert.equal(sent.type, 'mysql')
  assert.equal(sent.host, '127.0.0.1')
  assert.equal(sent.password, 'unit-test-pass', '表单试连应带表单密码（仅本机路由）')
  assert.equal(calls.some((c) => c.url === '/dblens/connections' && c.opts && c.opts.method === 'POST'), false, '试连不得保存连接')
  const ok = find(env.tree(), noticeOf('ok'))
  assert.ok(ok && /连接成功/.test(noticeText(ok)), '试连成功应绿提醒')
})

// ── 问数模型下拉 ─────────────────────────────────────────────────────
test('模型下拉：默认选中 DSH 默认模型；改选后 generate 传所选 provider/model', async () => {
  const genCalls = []
  const env = makeEnv(async (url, opts) => {
    if (url === '/dblens/models') {
      return { ok: true, json: async () => ({ models: [{ provider: 'p1', id: 'm1', name: 'M1' }, { provider: 'p1', id: 'm2', name: 'M2' }], default: { provider: 'p1', model: 'm1' }, failedProviders: [] }) }
    }
    if (url === '/dblens/generate') {
      const b = JSON.parse(opts.body)
      genCalls.push(b)
      return { ok: true, json: async () => ({ sql: 'SELECT 1', model: b.provider + '/' + b.model, executed: false }) }
    }
    throw new Error('unexpected fetch ' + url)
  })
  const A = env.compile('AskCard')
  const render = (h) => h(A, { onExec() {}, busy: false, open: true, onToggle() {} })
  await env.settle(render)
  const sel = find(env.tree(), (n) => n.type === 'select' && n.props['aria-label'] === '问数模型')
  assert.ok(sel, '应有问数模型下拉')
  assert.equal(sel.props.value, 'p1/m1', '默认应选中 DSH 默认模型')
  assert.equal(findAll(sel, (n) => n.type === 'option').length, 2)
  sel.props.onChange({ target: { value: 'p1/m2' } })
  await env.settle(render)
  find(env.tree(), (n) => n.type === 'textarea' && n.props['aria-label'] === '自然语言问题').props.onChange({ target: { value: 'q' } })
  await env.settle(render)
  find(env.tree(), btnWith('生成 SQL')).props.onClick()
  await env.settle(render)
  assert.equal(genCalls.length, 1)
  assert.equal(genCalls[0].provider, 'p1')
  assert.equal(genCalls[0].model, 'm2', 'generate 应传所选模型')
  assert.ok(find(env.tree(), (n) => byClass('model')(n) && n.kids[0] === 'p1/m2'), '确认闸应显所选模型')
})

test('模型下拉：目录不可用时不硬造——回退默认且明示', async () => {
  const env = makeEnv(async (url) => {
    if (url === '/dblens/models') return { ok: false, status: 500, json: async () => ({ error: 'down' }) }
    throw new Error('unexpected fetch ' + url)
  })
  const A = env.compile('AskCard')
  await env.settle((h) => h(A, { onExec() {}, busy: false, open: true, onToggle() {} }))
  const note = find(env.tree(), noticeOf('info'))
  assert.ok(note, '目录失败应有 info notice 明示')
  assert.match(noticeText(note), /默认|不可用/, '应说明回退默认模型')
})
