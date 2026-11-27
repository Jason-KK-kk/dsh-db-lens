// 视觉迁正式·回归闸（存在性）：断言注入 CSS 的视觉原语＋组件结构＋真路由＋护栏语义，
// 且不含原型专用脚本。迁移前必须先红（旧 client.js 无滚动容器/固定表头/卡片/护栏条）。
// 行为级证据（computed style/交互）另见真浏览器多状态验收 evidence/J-*。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fs.readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
const cssMatch = src.match(/const CSS = `([\s\S]*?)`/)
const css = cssMatch ? cssMatch[1] : ''

test('CSS 可提取（const CSS 模板串存在）', () => {
  assert.ok(css.length > 0, 'client.js 应含 const CSS 模板串')
})

test('视觉：结果表独立滚动容器（overflow:auto + max-height）', () => {
  assert.match(css, /\.grid-scroll\{[^}]*overflow:auto/, '缺独立滚动容器 overflow:auto')
  assert.match(css, /\.grid-scroll\{[^}]*max-height/, '缺滚动容器 max-height 边界')
})

test('视觉：固定表头（thead th position:sticky）', () => {
  assert.match(css, /\.grid thead th\{[^}]*position:sticky/, '表头未 sticky')
})

test('视觉：冻结行号槽（rownum sticky left）', () => {
  assert.match(css, /\.grid \.rownum\{[^}]*position:sticky/, '行号槽未冻结')
  assert.match(css, /\.grid \.rownum\{[^}]*left:0/, '行号槽未 sticky left')
})

test('视觉：四卡可折叠（data-open=0 隐藏 body）', () => {
  assert.match(css, /\.card\[data-open="0"\] \.card-body\{display:none\}/, '卡片折叠态未隐藏 body')
})

test('视觉：护栏状态条（rail-meter + 琥珀/红态）', () => {
  assert.match(css, /\.rail-meter\{/, '缺护栏状态条')
  assert.match(css, /\.meter-seg\.warn/, '缺截断琥珀态')
  assert.match(css, /\.meter-seg\.bad/, '缺拒写红态')
})

test('视觉：常显双向滚动条（12px 轨道，不依赖覆盖式）', () => {
  assert.match(css, /::-webkit-scrollbar\{width:12px;height:12px\}/, '缺常显双向滚动条')
})

test('视觉：单元格全值弹层（cellpop）', () => {
  assert.match(css, /\.cellpop\{/, '缺单元格全值弹层')
})

test('视觉：全宽双栏（左导轨 rail + 右工作区 work），去掉 860 死宽', () => {
  assert.match(css, /\.rail\{/, '缺左导轨')
  assert.match(css, /\.work\{/, '缺右工作区')
  assert.doesNotMatch(css, /max-width:860px/, '旧 860px 死宽未去除')
})

test('视觉：根填 DSH main slot（flex:1 + min-height:0）', () => {
  assert.match(css, /\.dblens\{[^}]*flex:1/, '根未 flex:1 填充')
  assert.match(css, /\.dblens\{[^}]*min-height:0/, '根未 min-height:0')
})

test('视觉：左栏分区可折叠＋schema 过滤＋结果底部行数统计', () => {
  assert.match(css, /\.rail-sec\[data-open="0"\]/, '左栏分区无折叠态')
  assert.match(src, /过滤表/, '缺 schema 过滤框')
  assert.match(css, /\.grid-foot\{/, '缺结果底部行数统计')
})

test('🔴 CSS 全部 scoped 到面板根，不污染 DSH host', () => {
  assert.match(css, /\.dblens\{[^}]*--jade/, 'token 应定义在 .dblens 根而非 :root')
  assert.doesNotMatch(css, /:root\{/, '不得用全局 :root')
  assert.doesNotMatch(css, /(^|\})\s*(html|body)\s*[,{]/, '不得全局改 html/body')
})

test('功能：接真路由（schema/query/generate/connections/audit）', () => {
  for (const ep of ['/dblens/schema', '/dblens/query', '/dblens/generate', '/dblens/connections', '/dblens/audit'])
    assert.ok(src.includes(ep), '缺少真路由 ' + ep)
})

test('功能：只读白名单＋问数确认闸（生成零查询）＋截断＋CSV＋排序保留', () => {
  assert.match(src, /SELECT/, '缺只读白名单文案')
  assert.match(src, /确认执行/, '缺问数确认闸')
  assert.match(src, /尚未发出任何查询|生成阶段零查询/, '缺生成零查询明示')
  assert.match(src, /truncated/, '缺截断处理')
  assert.match(src, /toCsv|导出 CSV/, '缺 CSV 导出')
  assert.match(src, /sortRows|clickSort/, '缺列头排序')
})

test('功能：NL 失败用 code/retryable/HTTP504 准确提示', () => {
  assert.match(src, /retryable/, '未消费 retryable')
  assert.match(src, /ETIMEOUT|504/, '未区分超时 504')
})

test('🔴 不带原型专用脚本（状态切换器/强制主题/mock/hash 视图）', () => {
  for (const bad of ['proto-switch', 'proto-note', 'applyView', 'lens-data', 'location.hash', 'hashchange'])
    assert.ok(!src.includes(bad), '残留原型专用：' + bad)
  assert.ok(!/const VIEWS\s*=/.test(src), '残留原型 VIEWS 状态切换器')
})

// ── schema 树折叠行为闸 ────────────────────────────────────────────────
// 本机无 react 依赖（DSH 运行时才注入），故用最小 hooks 运行时跑 client.js 里真实的
// TableNode 源码：只实现 useState + 渲染期 setState 重渲染，够驱动折叠开关。
// 真实 DOM/computed style 证据另见 evidence/K-*（真浏览器过滤后点 caret）。
const hStub = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(Infinity).filter((k) => k != null && k !== false) })
const ChevStub = () => hStub('svg', { className: 'chev' })
const TABLE = { name: 'order_items', rowCount: 573, columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'order_id', type: 'INTEGER' }] }

function mountTableNode(initialF) {
  const body = src.match(/function TableNode\(props\) \{[\s\S]*?\n    \}/)
  assert.ok(body, 'client.js 里找不到 TableNode 函数体')
  const hooks = []
  let cursor = 0
  let dirty = false
  let renders = 0
  let f = ''
  let tree
  const useState = (init) => {
    const i = cursor++
    if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
    return [hooks[i], (v) => {
      const next = typeof v === 'function' ? v(hooks[i]) : v
      if (next !== hooks[i]) { hooks[i] = next; dirty = true }
    }]
  }
  const TableNode = new Function('h', 'useState', 'Chev', body[0] + '\nreturn TableNode')(hStub, useState, ChevStub)
  const settle = () => {
    do {
      dirty = false
      cursor = 0
      tree = TableNode({ t: TABLE, f })
      if (++renders > 50) throw new Error('TableNode 渲染不收敛（渲染期 setState 死循环）')
    } while (dirty)
  }
  const find = (node, cls) => {
    if (!node || typeof node !== 'object') return null
    if (String(node.props.className || '').split(' ').includes(cls)) return node
    for (const k of node.kids) { const hit = find(k, cls); if (hit) return hit }
    return null
  }
  settle()
  const api = {
    node: () => find(tree, 'tnode'),
    row: () => find(tree, 'trow'),
    clickRow() { find(tree, 'trow').props.onClick(); settle() },
    setFilter(next) { f = next; settle() },
  }
  if (initialF) api.setFilter(initialF)
  return api
}

test('schema 折叠：无过滤时点表头能展开再折叠（阴性对照）', () => {
  const m = mountTableNode('')
  assert.equal(m.node().props['data-open'], '0', '初始应折叠')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '1', '无过滤点一下应展开')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '0', '无过滤再点应折叠')
})

test('🔴 schema 折叠：过滤态下点 caret 必须能折叠，再点能展开', () => {
  const m = mountTableNode('orde')
  assert.equal(m.node().props['data-open'], '1', '过滤命中应自动展开')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '0', '过滤态点 caret 折叠失效（data-open 仍为 1）')
  assert.equal(m.row().props['aria-expanded'], false, '折叠后 aria-expanded 应为 false')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '1', '过滤态再点 caret 应重新展开')
  assert.equal(m.row().props['aria-expanded'], true, '展开后 aria-expanded 应为 true')
})

test('schema 折叠：过滤中折叠后改过滤词不被强行掰回展开', () => {
  const m = mountTableNode('orde')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '0')
  m.setFilter('order')
  assert.equal(m.node().props['data-open'], '0', '同在过滤态内换词不应覆盖用户折叠选择')
})

test('schema 折叠：过滤中才出现的表（挂载即带过滤）也自动展开且可折叠', () => {
  const m = mountTableNode('orde')
  assert.equal(m.node().props['data-open'], '1', '带过滤挂载应自动展开')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '0', '带过滤挂载后点 caret 应能折叠')
})

test('schema 折叠：清空过滤恢复全折叠初态；data-open 是唯一折叠开关（CSS 两侧都在）', () => {
  const m = mountTableNode('orde')
  m.setFilter('')
  assert.equal(m.node().props['data-open'], '0', '清空过滤应回到折叠初态')
  m.clickRow()
  assert.equal(m.node().props['data-open'], '1', '清空后折叠开关仍可用')
  assert.match(css, /\.tnode\[data-open="0"\] \.cols\{display:none\}/, '折叠态未隐藏列')
  assert.match(css, /\.tnode\[data-open="0"\] \.trow \.chev\{transform:rotate\(0\)\}/, '折叠态 caret 未转回')
})
