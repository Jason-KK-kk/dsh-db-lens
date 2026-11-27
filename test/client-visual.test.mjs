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
