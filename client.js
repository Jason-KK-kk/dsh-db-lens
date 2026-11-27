// client 半边：侧栏「数据库透镜」＋全宽双栏面板（连接/schema 导轨＋查询/问数/结果/审计四卡）。
// 视觉层迁自 docs/ui-prototype-v1.html（用户已认可）；数据与护栏走同源 host 路由，语义不变。
// 结构照港股壳（slots 注册，无构建步骤）；CSS 全部 scoped 在 .dblens 根下，不污染 DSH host。
window.__ModuleLoader__.load({
  id: '@local/dsh-db-lens',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo } = React

    const PANEL_ID = 'db-lens'
    const SCHEMA_EP = '/dblens/schema'
    const QUERY_EP = '/dblens/query'
    const GEN_EP = '/dblens/generate'
    const AUDIT_EP = '/dblens/audit'
    const CONN_EP = '/dblens/connections'

    const CSS = `
.dblens{
  --void:#0A0B0D;--surface:#13161A;--surface-2:#191D22;--surface-3:#20252B;
  --line:#272D34;--line-soft:#1E2329;
  --ink:#E8ECF1;--ink-2:#98A3B1;--ink-3:#646E7B;
  --jade:#3DAE7C;--jade-hi:#48C68C;--jade-ink:#6FD79E;--jade-dim:#122A1F;
  --amber:#D9A441;--amber-ink:#E8BE6A;--amber-dim:#2E2413;
  --red:#D96A5A;--red-ink:#EE8E7C;--red-dim:#2E1A17;
  --ice:#7FB2E5;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --ui:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;
  --r-card:10px;--r-ctl:6px;--r-chip:4px;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:20px;--s6:24px;
  --rail-w:286px;
  flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;
  background:var(--void);color:var(--ink);font:13px/1.6 var(--ui);
  -webkit-font-smoothing:antialiased;
}
.dblens,.dblens *{box-sizing:border-box}
.dblens [hidden]{display:none!important}
.dblens ::selection{background:rgba(61,174,124,.28)}
.dblens :focus-visible{outline:2px solid var(--jade);outline-offset:2px;border-radius:var(--r-ctl)}
.dblens button{font-family:inherit}
.dblens .scroll{scrollbar-width:thin;scrollbar-color:#3B434F #101317}
.dblens .scroll::-webkit-scrollbar{width:12px;height:12px}
.dblens .scroll::-webkit-scrollbar-track{background:#101317;border-radius:8px}
.dblens .scroll::-webkit-scrollbar-thumb{background:#3B434F;border:3px solid #101317;border-radius:8px}
.dblens .scroll::-webkit-scrollbar-thumb:hover{background:#4C5665}
.dblens .scroll::-webkit-scrollbar-corner{background:#101317}
.dblens .lens-head{flex:none;display:flex;align-items:center;gap:var(--s4);padding:var(--s3) var(--s5);border-bottom:1px solid var(--line);background:linear-gradient(180deg,#101317,#0C0E11)}
.dblens .lens-id{display:flex;align-items:baseline;gap:var(--s2);min-width:0}
.dblens .lens-id h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.2px;white-space:nowrap}
.dblens .lens-id .tag{font:10px/1 var(--mono);letter-spacing:.14em;color:var(--ink-3);text-transform:uppercase}
.dblens .lens-head .spacer{flex:1}
.dblens .lens-body{flex:1;min-height:0;display:flex;gap:0}
.dblens .rail-meter{display:flex;align-items:stretch;border:1px solid var(--line);border-radius:var(--r-ctl);background:#0E1114;overflow:hidden}
.dblens .meter-seg{display:flex;align-items:center;gap:6px;padding:5px 10px;border-right:1px solid var(--line);cursor:default}
.dblens .meter-seg:last-child{border-right:none}
.dblens .meter-seg .k{font:9px/1 var(--mono);letter-spacing:.12em;color:var(--ink-3)}
.dblens .meter-seg .v{font:11px/1 var(--mono);color:var(--ink);font-variant-numeric:tabular-nums}
.dblens .led{width:6px;height:6px;border-radius:50%;background:var(--jade);box-shadow:0 0 0 3px rgba(61,174,124,.14)}
.dblens .meter-seg.ok .v{color:var(--jade-ink)}
.dblens .meter-seg.warn{background:var(--amber-dim)}
.dblens .meter-seg.warn .v{color:var(--amber-ink)}
.dblens .meter-seg.warn .led{background:var(--amber);box-shadow:0 0 0 3px rgba(217,164,65,.16)}
.dblens .meter-seg.bad{background:var(--red-dim)}
.dblens .meter-seg.bad .v{color:var(--red-ink)}
.dblens .meter-seg.bad .led{background:var(--red);box-shadow:0 0 0 3px rgba(217,106,90,.16)}
.dblens .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);overflow:hidden}
.dblens .card+.card{margin-top:var(--s3)}
.dblens .card-head{display:flex;align-items:center;gap:var(--s2);padding:10px var(--s3)}
.dblens .card-toggle{display:flex;align-items:center;gap:var(--s2);flex:1;min-width:0;background:none;border:none;color:inherit;text-align:left;cursor:pointer;padding:0}
.dblens .card-toggle:hover h2{color:var(--jade-ink)}
.dblens .card-head .chev{width:14px;height:14px;flex:none;color:var(--ink-3);transition:transform .16s ease;transform:rotate(90deg)}
.dblens .card[data-open="0"] .card-head .chev{transform:rotate(0deg)}
.dblens .card-head .eyebrow{font:9px/1 var(--mono);letter-spacing:.16em;color:var(--ink-3);text-transform:uppercase}
.dblens .card-head h2{margin:0;font-size:13px;font-weight:600;letter-spacing:.2px}
.dblens .card-head .sub{font-size:11px;color:var(--ink-3);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dblens .card-head .grow{flex:1}
.dblens .card-body{padding:0 var(--s3) var(--s3);border-top:1px solid var(--line-soft)}
.dblens .card[data-open="0"] .card-body{display:none}
.dblens .card[data-open="0"] .card-head{padding-bottom:10px}
.dblens .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);border-radius:var(--r-ctl);padding:5px 11px;font-size:12px;cursor:pointer;white-space:nowrap}
.dblens .btn:hover{background:var(--surface-3);border-color:#333B44}
.dblens .btn.primary{background:var(--jade);border-color:var(--jade);color:#06120C;font-weight:600}
.dblens .btn.primary:hover{background:var(--jade-hi);border-color:var(--jade-hi)}
.dblens .btn.ghost{background:none}
.dblens .btn.sm{padding:3px 8px;font-size:11px}
.dblens .btn:disabled{opacity:.45;cursor:default}
.dblens .btn .kbd{font:10px/1 var(--mono);color:inherit;opacity:.6}
.dblens .chip{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border-radius:var(--r-chip);font:10px/1.7 var(--mono);letter-spacing:.04em}
.dblens .chip.ro{background:var(--jade-dim);color:var(--jade-ink);border:1px solid #1E4633}
.dblens .chip.pk{background:var(--amber-dim);color:var(--amber-ink);border:1px solid #4A3A18}
.dblens .chip.nn{background:none;color:var(--ink-3);border:1px solid var(--line)}
.dblens .chip.bad{background:var(--red-dim);color:var(--red-ink);border:1px solid #4C2A24}
.dblens .inp,.dblens .sel,.dblens .ta{background:#0F1216;color:var(--ink);border:1px solid var(--line);border-radius:var(--r-ctl);padding:6px 9px;font-size:12px;font-family:var(--ui)}
.dblens .inp:focus,.dblens .sel:focus,.dblens .ta:focus{border-color:#3C5A4B;outline:none;box-shadow:0 0 0 3px rgba(61,174,124,.12)}
.dblens .ta{font:12px/1.65 var(--mono);width:100%;resize:vertical;display:block}
.dblens .sel{appearance:none;padding-right:26px;background-image:linear-gradient(45deg,transparent 50%,var(--ink-3) 50%),linear-gradient(135deg,var(--ink-3) 50%,transparent 50%);background-position:calc(100% - 14px) 13px,calc(100% - 9px) 13px;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.dblens .notice{display:flex;gap:var(--s2);align-items:flex-start;padding:8px 10px;border-radius:var(--r-ctl);font-size:12px;line-height:1.55;margin-top:var(--s2)}
.dblens .notice .ic{flex:none;font:11px/1.5 var(--mono)}
.dblens .notice.warn{background:var(--amber-dim);border:1px solid #4A3A18;color:var(--amber-ink)}
.dblens .notice.bad{background:var(--red-dim);border:1px solid #4C2A24;color:var(--red-ink)}
.dblens .notice.ok{background:var(--jade-dim);border:1px solid #1E4633;color:var(--jade-ink)}
.dblens .notice.info{background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2)}
.dblens .muted{color:var(--ink-3)}
.dblens .num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.dblens .rail{width:var(--rail-w);flex:none;display:flex;flex-direction:column;background:#0E1114;border-right:1px solid var(--line);overflow:hidden}
.dblens .rail[data-open="0"]{width:42px}
.dblens .rail[data-open="0"] .rail-full{display:none}
.dblens .rail-collapsed{display:none;flex-direction:column;align-items:center;gap:var(--s3);padding:var(--s3) 0}
.dblens .rail[data-open="0"] .rail-collapsed{display:flex}
.dblens .rail-collapsed .vlabel{writing-mode:vertical-rl;font:9px/1 var(--mono);letter-spacing:.2em;color:var(--ink-3);text-transform:uppercase}
.dblens .rail-full{display:flex;flex-direction:column;min-height:0;flex:1}
.dblens .rail-sec{border-bottom:1px solid var(--line)}
.dblens .rail-sec-head{display:flex;align-items:center;gap:6px;width:100%;padding:9px var(--s3);background:none;border:none;color:inherit;cursor:pointer;text-align:left}
.dblens .rail-sec-head:hover{background:#12161A}
.dblens .rail-sec-head .eyebrow{font:9px/1 var(--mono);letter-spacing:.16em;color:var(--ink-3);text-transform:uppercase}
.dblens .rail-sec-head .grow{flex:1}
.dblens .rail-sec-head .chev{width:12px;height:12px;color:var(--ink-3);transition:transform .16s ease;transform:rotate(90deg)}
.dblens .rail-sec[data-open="0"] .rail-sec-head .chev{transform:rotate(0)}
.dblens .rail-sec[data-open="0"] .rail-sec-body{display:none}
.dblens .rail-sec[data-open="0"] .rail-scroll{display:none}
.dblens .rail-sec-body{padding:0 var(--s3) var(--s3)}
.dblens .rail-scroll{flex:1;min-height:0;overflow:auto;padding:0 var(--s3) var(--s4)}
.dblens .conn-pick{display:flex;gap:6px;align-items:center}
.dblens .conn-pick .sel{flex:1;min-width:0}
.dblens .conn-meta{display:flex;align-items:center;gap:6px;margin-top:var(--s2);font-size:11px;color:var(--ink-3);flex-wrap:wrap}
.dblens .conn-form{margin-top:var(--s2);display:grid;grid-template-columns:1fr 1fr;gap:6px}
.dblens .conn-form .inp,.dblens .conn-form .sel{width:100%;min-width:0}
.dblens .conn-form .wide{grid-column:1/-1}
.dblens .conn-msg{margin-top:6px;font-size:11px}
.dblens .db-row{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-ctl);margin-bottom:var(--s2)}
.dblens .db-row .nm{font:12px/1.4 var(--mono);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dblens .db-row .grow{flex:1}
.dblens .filter{position:relative;margin-bottom:var(--s2)}
.dblens .filter .inp{width:100%;padding-left:26px;font-size:11px}
.dblens .filter .ic{position:absolute;left:8px;top:6px;color:var(--ink-3);font-size:11px}
.dblens .tnode{border-radius:var(--r-ctl)}
.dblens .tnode+.tnode{margin-top:1px}
.dblens .trow{display:flex;align-items:center;gap:6px;width:100%;padding:5px 6px;background:none;border:none;color:inherit;cursor:pointer;text-align:left;border-radius:var(--r-ctl)}
.dblens .trow:hover{background:var(--surface-3)}
.dblens .trow .chev{width:11px;height:11px;flex:none;color:var(--ink-3);transition:transform .16s ease;transform:rotate(90deg)}
.dblens .tnode[data-open="0"] .trow .chev{transform:rotate(0)}
.dblens .trow .tn{font:12px/1.4 var(--mono);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dblens .trow .grow{flex:1}
.dblens .trow .cnt{font:10px/1 var(--mono);color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.dblens .tnode[data-open="1"] .trow{background:#161A1F}
.dblens .tnode[data-open="1"] .trow .tn{color:var(--jade-ink)}
.dblens .cols{margin:2px 0 6px 17px;padding-left:9px;border-left:1px solid var(--line)}
.dblens .tnode[data-open="0"] .cols{display:none}
.dblens .crow{display:flex;align-items:center;gap:6px;padding:2px 0;font:11px/1.6 var(--mono)}
.dblens .crow .cn{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dblens .crow .grow{flex:1}
.dblens .crow .ct{color:var(--ice);font-size:10px;white-space:nowrap}
.dblens .crow .cdef{color:var(--ink-3);font-size:10px}
.dblens .rail-empty{padding:var(--s4) var(--s2);text-align:center;color:var(--ink-3);font-size:12px}
.dblens .work{flex:1;min-width:0;overflow:auto;overflow-anchor:none;padding:var(--s4) var(--s5) var(--s6)}
.dblens .work-inner{max-width:1180px}
.dblens .qbar{display:flex;align-items:center;gap:var(--s2);margin-top:var(--s2);flex-wrap:wrap}
.dblens .qbar .grow{flex:1}
.dblens .qhint{font:10px/1.5 var(--mono);color:var(--ink-3);letter-spacing:.02em}
.dblens .ta.sql{min-height:112px}
.dblens .ta.ask{min-height:56px;font-family:var(--ui);font-size:13px}
.dblens .gate{margin-top:var(--s3);border:1px solid #4A3A18;border-radius:var(--r-ctl);background:#17140D;overflow:hidden}
.dblens .gate-head{display:flex;align-items:center;gap:var(--s2);padding:8px 10px;background:var(--amber-dim);border-bottom:1px solid #4A3A18;font-size:12px;color:var(--amber-ink)}
.dblens .gate-head .grow{flex:1}
.dblens .gate-body{padding:10px}
.dblens .gate-body .ta{min-height:100px;background:#0F1216}
.dblens .model{font:10px/1 var(--mono);color:var(--ink-3);border:1px solid var(--line);border-radius:var(--r-chip);padding:3px 6px}
.dblens .empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:var(--s6) var(--s4);color:var(--ink-3);font-size:12px;text-align:center}
.dblens .empty .big{font:11px/1 var(--mono);letter-spacing:.16em;color:#3E464F;text-transform:uppercase}
.dblens .grid-wrap{border:1px solid var(--line);border-radius:8px;background:#0F1216;overflow:hidden;margin-top:var(--s2)}
.dblens .grid-scroll{max-height:min(52vh,460px);overflow:auto}
.dblens table.grid{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}
.dblens .grid th,.dblens .grid td{height:30px;padding:0 12px;text-align:left;white-space:nowrap;font:12px/30px var(--mono);border-bottom:1px solid var(--line-soft)}
.dblens .grid thead th{position:sticky;top:0;z-index:3;height:34px;line-height:34px;background:#171B21;color:var(--ink-2);font-size:11px;font-weight:500;letter-spacing:.03em;border-bottom:1px solid var(--line);cursor:pointer;user-select:none}
.dblens .grid thead th+th{box-shadow:inset 1px 0 0 var(--line-soft)}
.dblens .grid thead th:hover{background:#1E242B;color:var(--ink)}
.dblens .grid thead th .sort{color:var(--jade-ink);font-size:9px;margin-left:4px}
.dblens .grid tbody td{color:var(--ink);max-width:340px;overflow:hidden;text-overflow:ellipsis;cursor:default}
.dblens .grid tbody tr:nth-child(odd) td{background:#12161B}
.dblens .grid tbody tr:hover td{background:#1C2128}
.dblens .grid td.n,.dblens .grid th.n{text-align:right;font-variant-numeric:tabular-nums}
.dblens .grid td.null{color:var(--ink-3);font-style:italic}
.dblens .grid .rownum{position:sticky;left:0;z-index:2;width:52px;min-width:52px;max-width:52px;padding:0 10px;text-align:right;color:var(--ink-3);font-size:10px;background:#14181D;border-right:1px solid var(--line)}
.dblens .grid tbody tr:nth-child(odd) td.rownum{background:#171B21}
.dblens .grid tbody tr:hover td.rownum{background:#20262E}
.dblens .grid thead th.rownum{z-index:5;background:#171B21;cursor:default;border-right:1px solid var(--line)}
.dblens .grid-foot{display:flex;align-items:center;gap:var(--s3);padding:6px 10px;border-top:1px solid var(--line);background:#0E1114;font:10px/1.5 var(--mono);color:var(--ink-3);flex-wrap:wrap}
.dblens .grid-foot .grow{flex:1}
.dblens .cellpop{position:fixed;z-index:60;width:380px;max-width:calc(100vw - 32px);background:var(--surface);border:1px solid #333B44;border-radius:var(--r-card);box-shadow:0 18px 44px rgba(0,0,0,.6);overflow:hidden}
.dblens .cellpop-head{display:flex;align-items:center;gap:var(--s2);padding:8px 10px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.dblens .cellpop-head .cn{font:11px/1.4 var(--mono);color:var(--jade-ink)}
.dblens .cellpop-head .grow{flex:1}
.dblens .cellpop pre{margin:0;padding:10px;max-height:220px;overflow:auto;font:12px/1.6 var(--mono);color:var(--ink);white-space:pre-wrap;word-break:break-word}
.dblens .cellpop-foot{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--line)}
.dblens .audit-counts{display:flex;gap:5px;align-items:center}
.dblens .audit-scroll{max-height:236px;overflow:auto;margin-top:var(--s2);border:1px solid var(--line);border-radius:8px;background:#0F1216}
.dblens table.audit{border-collapse:separate;border-spacing:0;width:100%}
.dblens .audit th,.dblens .audit td{padding:0 10px;height:28px;line-height:28px;text-align:left;white-space:nowrap;font:11px/28px var(--mono);border-bottom:1px solid var(--line-soft)}
.dblens .audit thead th{position:sticky;top:0;z-index:2;background:#171B21;color:var(--ink-3);font-size:10px;font-weight:500;letter-spacing:.06em;border-bottom:1px solid var(--line)}
.dblens .audit td{color:var(--ink-2);max-width:420px;overflow:hidden;text-overflow:ellipsis}
.dblens .audit tbody tr:hover td{background:#171B21}
.dblens .audit .ev{font-weight:600}
.dblens .ev-query{color:var(--jade-ink)}.dblens .ev-reject{color:var(--red-ink)}
.dblens .ev-truncate,.dblens .ev-timeout{color:var(--amber-ink)}.dblens .ev-error{color:var(--ink-3)}
@media (prefers-reduced-motion:reduce){.dblens *{transition:none!important;animation:none!important}}
@media (max-width:1080px){
  .dblens{--rail-w:240px}
  .dblens .work{padding:var(--s3)}
  .dblens .lens-head{padding:var(--s3)}
}
@media (max-width:820px){
  .dblens .lens-body{flex-direction:column;overflow:auto}
  .dblens .rail{width:auto;border-right:none;border-bottom:1px solid var(--line);max-height:280px}
  .dblens .rail[data-open="0"]{width:auto}
  .dblens .rail-collapsed{flex-direction:row;padding:var(--s2) var(--s3)}
  .dblens .rail-collapsed .vlabel{writing-mode:horizontal-tb}
  .dblens .lens-head{flex-wrap:wrap}
  .dblens .rail-meter{order:3;width:100%}
  .dblens .meter-seg{flex:1}
}
`
    function Chev() {
      return h('svg', { className: 'chev', 'aria-hidden': true }, h('use', { href: '#dblens-chev' }))
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

    function Notice(props) {
      if (!props.text) return null
      return h('div', { className: 'notice ' + props.kind },
        h('span', { className: 'ic' }, props.ic), h('span', null, props.text))
    }

    function Card(props) {
      const { eyebrow, title, sub, open, onToggle, extra, children } = props
      return h('div', { className: 'card', 'data-open': open ? '1' : '0' },
        h('div', { className: 'card-head' },
          h('button', { className: 'card-toggle', onClick: onToggle, 'aria-expanded': open },
            h(Chev),
            h('span', { className: 'eyebrow' }, eyebrow),
            h('h2', null, title),
            sub ? h('span', { className: 'sub' }, sub) : null),
          extra || null),
        h('div', { className: 'card-body' }, children))
    }

    function RailSec(props) {
      const { eyebrow, count, open, onToggle, flex, body, scroll } = props
      return h('section', {
        className: 'rail-sec', 'data-open': open ? '1' : '0',
        style: flex ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: 'none' } : null,
      },
        h('button', { className: 'rail-sec-head', onClick: onToggle, 'aria-expanded': open },
          h(Chev),
          h('span', { className: 'eyebrow' }, eyebrow),
          h('span', { className: 'grow' }),
          count ? h('span', { className: 'eyebrow' }, count) : null),
        h('div', { className: 'rail-sec-body', style: flex ? { paddingBottom: '8px' } : null }, body),
        scroll || null)
    }

    // 护栏状态条：MODE 拒写变红、MAX 截断变琥珀；MAX 读数取真实结果 cap，未查询时显默认。
    function GuardMeter(props) {
      const { result, rejected, timeoutMs } = props
      const capCls = result && result.truncated ? 'meter-seg warn' : 'meter-seg'
      const capText = result
        ? (result.truncated ? result.maxRows + '/' + result.maxRows + ' 满' : result.rowCount + '/' + result.maxRows + ' 行')
        : '1000 行'
      const toText = timeoutMs ? (timeoutMs / 1000) + 's' : '10s'
      return h('div', { className: 'rail-meter', title: '护栏实时读数：只读白名单 · 行数上限 · 语句超时 · 审计留痕' },
        h('div', { className: 'meter-seg ' + (rejected ? 'bad' : 'ok') },
          h('span', { className: 'led' }), h('span', { className: 'k' }, 'MODE'),
          h('span', { className: 'v' }, rejected ? 'WRITE BLOCKED' : 'READ-ONLY')),
        h('div', { className: capCls },
          h('span', { className: 'k' }, 'MAX'), h('span', { className: 'v' }, capText)),
        h('div', { className: 'meter-seg' },
          h('span', { className: 'k' }, 'TIMEOUT'), h('span', { className: 'v' }, toText)),
        h('div', { className: 'meter-seg ok' },
          h('span', { className: 'k' }, 'AUDIT'), h('span', { className: 'v' }, 'ON')))
    }

    function ConnSec(props) {
      const { open, onToggle, onChanged, refreshKey } = props
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
      useEffect(() => { load() }, [load, refreshKey])

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
      const inp = (k, ph, type, wide) => h('input', { key: k, className: 'inp' + (wide ? ' wide' : ''), placeholder: ph, type: type || 'text', value: form[k], onChange: set(k) })
      const active = conns.find((c) => c.id === activeId)
      const activeMeta = active ? active.type + ' · ' + (active.database || (active.path ? active.path.split('/').pop() : '')) : ''

      return h(RailSec, {
        eyebrow: 'Connection', count: conns.length ? conns.length + ' 个' : '', open, onToggle,
        body: h('div', null,
          h('div', { className: 'conn-pick' },
            h('select', { className: 'sel', value: activeId, onChange: (e) => select(e.target.value), 'aria-label': '选择连接' },
              conns.map((c) => h('option', { key: c.id, value: c.id }, c.name + '（' + c.type + '）'))),
            h('button', { className: 'btn sm', onClick: () => setShowForm(!showForm), title: '添加连接' }, showForm ? '×' : '＋')),
          active ? h('div', { className: 'conn-meta' },
            h('span', { className: 'chip ro' }, '只读账号'), h('span', null, activeMeta)) : null,
          showForm ? h('div', { className: 'conn-form' },
            h('select', { className: 'sel wide', value: form.type, 'aria-label': '数据库类型', onChange: (e) => setForm((f) => ({ ...f, type: e.target.value, port: e.target.value === 'pg' ? '5432' : '3306' })) },
              h('option', { value: 'mysql' }, 'MySQL'), h('option', { value: 'pg' }, 'PostgreSQL'), h('option', { value: 'sqlite' }, 'SQLite')),
            inp('name', '连接名', 'text', true),
            form.type === 'sqlite'
              ? inp('path', 'SQLite 文件路径', 'text', true)
              : [inp('host', '主机'), inp('port', '端口'), inp('user', '只读用户名'), inp('password', '密码', 'password'), inp('database', '数据库名', 'text', true)],
            h('button', { className: 'btn primary wide', onClick: add }, '保存连接')) : null,
          msg ? h('div', { className: 'conn-msg', style: { color: msg.ok ? 'var(--jade-ink)' : 'var(--red-ink)' } }, msg.text) : null),
      })
    }
    function TableNode(props) {
      const { t, f } = props
      const [open, setOpen] = useState(false)
      const eff = !!f || open
      const cols = f && !t.name.toLowerCase().includes(f)
        ? t.columns.filter((c) => c.name.toLowerCase().includes(f))
        : t.columns
      return h('div', { className: 'tnode', 'data-open': eff ? '1' : '0' },
        h('button', { className: 'trow', onClick: () => setOpen(!open), 'aria-expanded': eff },
          h(Chev),
          h('span', { className: 'tn' }, t.name),
          h('span', { className: 'grow' }),
          h('span', { className: 'cnt' }, t.rowCount + ' 行 · ' + t.columns.length + ' 列')),
        h('div', { className: 'cols' }, cols.map((c) => h('div', {
          className: 'crow', key: c.name,
          title: c.name + ' ' + (c.type || '') + (c.pk ? ' 主键' : '') + (c.notnull ? ' NOT NULL' : '') + (c.default != null ? ' 默认 ' + c.default : ''),
        },
          h('span', { className: 'cn' }, c.name),
          h('span', { className: 'grow' }),
          h('span', { className: 'ct' }, c.type || '—'),
          c.pk ? h('span', { className: 'chip pk' }, 'PK') : c.notnull ? h('span', { className: 'chip nn' }, 'NN') : null,
          c.default != null ? h('span', { className: 'cdef' }, '=' + c.default) : null))))
    }

    function SchemaSec(props) {
      const { schema, error, open, onToggle } = props
      const [filter, setFilter] = useState('')
      const f = filter.trim().toLowerCase()
      const tables = schema ? schema.tables.filter((t) => !f || t.name.toLowerCase().includes(f) || t.columns.some((c) => c.name.toLowerCase().includes(f))) : []

      let tree
      if (error) tree = h('div', { className: 'rail-empty' }, h(Notice, { kind: 'bad', ic: '⛔', text: error }))
      else if (!schema) tree = h('div', { className: 'rail-empty' }, '正在加载 schema…')
      else if (!schema.tables.length) tree = h('div', { className: 'rail-empty' }, '库里没有用户表')
      else if (!tables.length) tree = h('div', { className: 'rail-empty' }, '没有匹配的表或列')
      else tree = tables.map((t) => h(TableNode, { key: t.name, t, f }))

      return h(RailSec, {
        eyebrow: 'Schema', count: schema ? tables.length + ' 表' : '', open, onToggle, flex: true,
        body: h('div', null,
          h('div', { className: 'db-row' },
            h('span', { className: 'nm' }, schema ? schema.database : '—'),
            h('span', { className: 'grow' }),
            h('span', { className: 'chip ro' }, '只读')),
          h('div', { className: 'filter' },
            h('span', { className: 'ic' }, '⌕'),
            h('input', { className: 'inp', placeholder: '过滤表 / 列', 'aria-label': '过滤表或列', value: filter, onChange: (e) => setFilter(e.target.value) }))),
        scroll: h('div', { className: 'rail-scroll scroll' }, tree),
      })
    }

    function QueryBox(props) {
      const { sql, setSql, qerr, busy, onExec } = props
      const run = useCallback(() => onExec(sql), [sql, onExec])
      const onKey = useCallback((e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onExec(sql) }
      }, [sql, onExec])
      return h('div', null,
        h('textarea', { className: 'ta sql', value: sql, onChange: (e) => setSql(e.target.value), onKeyDown: onKey, spellCheck: false, 'aria-label': 'SQL 语句' }),
        h('div', { className: 'qbar' },
          h('button', { className: 'btn primary', onClick: run, disabled: busy },
            busy ? '执行中…' : '执行', busy ? null : h('span', { className: 'kbd' }, '⌘↵')),
          h('button', { className: 'btn ghost sm', onClick: () => setSql('') }, '清空'),
          h('span', { className: 'grow' }),
          h('span', { className: 'qhint' }, '上限 1000 行 · 超时 10s · 可配不可关')),
        h(Notice, { kind: 'bad', ic: '⛔', text: qerr }))
    }

    function AskCard(props) {
      const { onExec, busy, open, onToggle } = props
      const [question, setQuestion] = useState('')
      const [genSql, setGenSql] = useState(null)
      const [genModel, setGenModel] = useState(null)
      const [genErr, setGenErr] = useState(null)
      const [generating, setGenerating] = useState(false)
      const [done, setDone] = useState(false)

      const generate = useCallback(async () => {
        setGenerating(true)
        setGenErr(null)
        setGenSql(null)
        setDone(false)
        try {
          const r = await fetch(GEN_EP, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question }),
          })
          const j = await r.json()
          if (!r.ok) {
            // 后端给 code/retryable；504＝生成超时（不重试），其余失败可重试一次已由后端做过。
            const codeTag = j.code ? '［' + j.code + '］' : r.status === 504 ? '［ETIMEOUT］' : ''
            setGenErr((j.error || 'HTTP ' + r.status) + codeTag + (j.retryable ? '（可重试）' : ''))
            return
          }
          setGenSql(j.sql)
          setGenModel(j.model)
        } catch (e) {
          setGenErr('连接失败：' + (e && e.message ? e.message : String(e)))
        } finally {
          setGenerating(false)
        }
      }, [question])

      const confirm = useCallback(() => {
        onExec(genSql)
        setGenSql(null)
        setGenModel(null)
        setDone(true)
      }, [genSql, onExec])
      const cancel = useCallback(() => { setGenSql(null); setGenModel(null) }, [])

      const stateChip = genSql != null
        ? h('span', { className: 'chip pk' }, '待确认')
        : done ? h('span', { className: 'chip ro' }, '已执行') : h('span', { className: 'chip nn' }, '待命')

      return h(Card, {
        eyebrow: 'Ask', title: '自然语言问数', sub: '生成后须人点确认才执行', open, onToggle, extra: stateChip,
      },
        h('textarea', {
          className: 'ta ask', placeholder: '用一句话描述想查什么，例如：每个城市的客户数是多少',
          value: question, onChange: (e) => setQuestion(e.target.value), spellCheck: false, 'aria-label': '自然语言问题',
        }),
        h('div', { className: 'qbar' },
          h('button', { className: 'btn', onClick: generate, disabled: generating || !question.trim() },
            generating ? '生成中…' : '生成 SQL'),
          h('span', { className: 'grow' }),
          h('span', { className: 'qhint' }, '生成阶段零查询发出')),
        h(Notice, { kind: 'bad', ic: '⛔', text: genErr }),
        genSql != null ? h('div', { className: 'gate' },
          h('div', { className: 'gate-head' },
            h('span', { className: 'ic' }, '🔒'),
            h('span', null, '待你确认 · 尚未发出任何查询'),
            h('span', { className: 'grow' }),
            h('span', { className: 'model' }, genModel)),
          h('div', { className: 'gate-body' },
            h('textarea', { className: 'ta sql', value: genSql, onChange: (e) => setGenSql(e.target.value), spellCheck: false, 'aria-label': '生成的 SQL，可修改' }),
            h('div', { className: 'qbar' },
              h('button', { className: 'btn primary', onClick: confirm, disabled: busy }, '确认执行'),
              h('button', { className: 'btn ghost sm', onClick: cancel }, '取消'),
              h('span', { className: 'grow' }),
              h('span', { className: 'qhint' }, '确认后走同一只读护栏')))) : null)
    }
    function CellPop(props) {
      const { pop, onClose } = props
      const [copied, setCopied] = useState(false)
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      const copy = useCallback(async () => {
        const text = pop.value == null ? '' : String(pop.value)
        try { await navigator.clipboard.writeText(text) } catch {
          const t = document.createElement('textarea')
          t.value = text
          document.body.appendChild(t)
          t.select()
          document.execCommand('copy')
          t.remove()
        }
        setCopied(true)
      }, [pop.value])
      const left = Math.max(12, Math.min(pop.x, window.innerWidth - 392))
      const top = Math.max(12, Math.min(pop.y, window.innerHeight - 320))
      return h('div', { className: 'cellpop', style: { left: left + 'px', top: top + 'px' } },
        h('div', { className: 'cellpop-head' },
          h('span', { className: 'cn' }, pop.col),
          h('span', { className: 'grow' }),
          h('span', { className: 'qhint' }, pop.value == null ? 'NULL' : String(pop.value).length + ' 字符')),
        h('pre', { className: 'scroll' }, pop.value == null ? 'NULL' : String(pop.value)),
        h('div', { className: 'cellpop-foot' },
          h('button', { className: 'btn sm', onClick: copy }, copied ? '已复制' : '复制值'),
          h('button', { className: 'btn sm ghost', onClick: onClose }, '关闭')))
    }

    function ResultCard(props) {
      const { result, open, onToggle } = props
      const [sort, setSort] = useState(null)
      const [pop, setPop] = useState(null)
      useEffect(() => { setSort(null); setPop(null) }, [result])

      const numeric = useMemo(() => {
        const set = new Set()
        if (!result) return set
        for (const c of result.columns) {
          let seen = false
          let ok = true
          for (const r of result.rows) {
            const v = r[c]
            if (v == null) continue
            if (typeof v !== 'number') { ok = false; break }
            seen = true
          }
          if (ok && seen) set.add(c)
        }
        return set
      }, [result])

      const clickSort = (col) => setSort((s) =>
        s && s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
      const rows = result ? sortRows(result.rows, sort) : []

      const exportCsv = useCallback(() => {
        if (!result) return
        const blob = new Blob([toCsv(result.columns, sortRows(result.rows, sort))], { type: 'text/csv;charset=utf-8' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'db-lens-result.csv'
        a.click()
        URL.revokeObjectURL(a.href)
      }, [result, sort])

      const meta = result ? result.rowCount + ' 行 · ' + result.columns.length + ' 列' + (result.durationMs != null ? ' · ' + result.durationMs + ' ms' : '') : '尚未执行'
      const closePop = useCallback(() => setPop(null), [])

      let body
      if (!result) {
        body = h('div', { className: 'empty' },
          h('div', { className: 'big' }, 'No result yet'),
          h('div', null, '写好 SQL 后点「执行」，或展开「自然语言问数」让模型替你生成。'))
      } else {
        body = h('div', null,
          result.truncated ? h(Notice, {
            kind: 'warn', ic: '⚠',
            text: '已截断至 ' + result.maxRows + ' 行：只保留前 ' + result.maxRows + ' 行，其余未取回。行数上限可配不可关；要全量请收窄 WHERE 或分批取。',
          }) : null,
          h('div', { className: 'grid-wrap' },
            h('div', { className: 'grid-scroll scroll' },
              h('table', { className: 'grid' },
                h('thead', null, h('tr', null,
                  h('th', { className: 'rownum' }, '#'),
                  result.columns.map((c) => h('th', {
                    key: c, className: numeric.has(c) ? 'n' : null, title: '点按排序：' + c, onClick: () => clickSort(c),
                  }, c, sort && sort.col === c ? h('span', { className: 'sort' }, sort.dir === 'asc' ? '▲' : '▼') : null)))),
                h('tbody', null, rows.map((r, i) => h('tr', { key: i },
                  h('td', { className: 'rownum' }, String(i + 1)),
                  result.columns.map((c) => {
                    const v = r[c]
                    const cls = ((numeric.has(c) ? 'n' : '') + (v == null ? ' null' : '')).trim()
                    return h('td', {
                      key: c, className: cls || null, title: v == null ? 'NULL' : String(v),
                      onClick: (ev) => setPop({ col: c, value: v, x: ev.clientX + 12, y: ev.clientY + 12 }),
                    }, v == null ? 'NULL' : String(v))
                  })))))),
            h('div', { className: 'grid-foot' },
              h('span', null, '显示 1–' + rows.length + ' / 共 ' + result.rowCount + ' 行'),
              h('span', null, '列头排序 · 单元格点开看全值'),
              h('span', { className: 'grow' }),
              h('span', null, result.truncated ? '已截断' : '完整结果'))))
      }

      return h('div', null,
        h(Card, {
          eyebrow: 'Result', title: '结果', sub: meta, open, onToggle,
          extra: result ? h('button', { className: 'btn sm', onClick: exportCsv }, '导出 CSV（' + result.rowCount + ' 行）') : null,
        }, body),
        pop ? h(CellPop, { pop, onClose: closePop }) : null)
    }
    const EV_LABEL = { query: '查询', reject: '拒写', truncate: '截断', timeout: '超时', error: '错误' }

    function AuditCard(props) {
      const { open, onToggle, refreshKey } = props
      const [events, setEvents] = useState(null)
      const load = useCallback(async () => {
        try {
          const r = await fetch(AUDIT_EP)
          const j = await r.json()
          setEvents(j.events || [])
        } catch { setEvents([]) }
      }, [])
      useEffect(() => { if (open) load() }, [open, refreshKey, load])

      const evs = events ? events.slice().reverse() : []
      const tally = {}
      for (const e of evs) tally[e.event] = (tally[e.event] || 0) + 1
      const counts = h('span', { className: 'audit-counts' },
        ['query', 'reject', 'truncate'].map((k) => tally[k]
          ? h('span', { key: k, className: 'chip ' + (k === 'query' ? 'ro' : k === 'reject' ? 'bad' : 'pk') }, EV_LABEL[k] + ' ' + tally[k])
          : null))

      return h(Card, {
        eyebrow: 'Audit', title: '审计日志', sub: '脱敏留痕 · 最近 50 条', open, onToggle,
        extra: h('span', { className: 'audit-counts' }, counts,
          h('button', { className: 'btn sm ghost', onClick: load }, '刷新')),
      },
        events ? h('div', { className: 'audit-scroll scroll' },
          h('table', { className: 'audit' },
            h('thead', null, h('tr', null,
              h('th', null, '时间'), h('th', null, '事件'), h('th', null, '行数'), h('th', null, '来源'), h('th', null, 'SQL / 原因'))),
            h('tbody', null, evs.map((e, i) => h('tr', { key: i },
              h('td', null, (e.ts || '').replace('T', ' ').slice(0, 19)),
              h('td', { className: 'ev ev-' + e.event }, EV_LABEL[e.event] || e.event),
              h('td', null, e.rowCount != null ? String(e.rowCount) : '—'),
              h('td', null, e.via === 'agent' ? 'agent' : '面板'),
              h('td', { title: e.reason || e.sql || '' }, e.reason || e.sql || '')))))) : null)
    }

    function Panel() {
      const [schema, setSchema] = useState(null)
      const [error, setError] = useState(null)
      const [sqlInput, setSqlInput] = useState('SELECT id, customer_id, status, total, created_at\nFROM orders\nORDER BY total DESC')
      const [exec, setExec] = useState({ result: null, qerr: null, busy: false })
      const [rejected, setRejected] = useState(false)
      const [timeoutMs, setTimeoutMs] = useState(null)
      const [execKey, setExecKey] = useState(0)
      const [refreshKey, setRefreshKey] = useState(0)
      const [railOpen, setRailOpen] = useState(true)
      const [cards, setCards] = useState({ query: true, ask: false, result: true, audit: false })
      const [secs, setSecs] = useState({ conn: true, schema: true })
      const toggleCard = (k) => setCards((c) => ({ ...c, [k]: !c[k] }))
      const toggleSec = (k) => setSecs((s) => ({ ...s, [k]: !s[k] }))

      const execSql = useCallback(async (sql) => {
        setExec({ result: null, qerr: null, busy: true })
        setCards((c) => ({ ...c, result: true }))
        try {
          const r = await fetch(QUERY_EP, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sql }),
          })
          const j = await r.json()
          if (!r.ok) {
            setRejected(r.status === 403)
            if (r.status === 408) {
              const m = />(\d+)ms/.exec(j.error || '')
              if (m) setTimeoutMs(Number(m[1]))
            }
            setExec({ result: null, busy: false, qerr: (r.status === 403 ? '已拒绝（只读白名单）：' : r.status === 408 ? '已超时中断：' : '查询失败：') + (j.error || 'HTTP ' + r.status) })
          } else {
            setRejected(false)
            setExec({ result: j, qerr: null, busy: false })
          }
        } catch (e) {
          setRejected(false)
          setExec({ result: null, busy: false, qerr: '连接失败：' + (e && e.message ? e.message : String(e)) })
        }
        setExecKey((k) => k + 1)
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
      const refresh = useCallback(() => { load(); setRefreshKey((k) => k + 1) }, [load])
      const onConnChanged = useCallback(() => {
        setExec({ result: null, qerr: null, busy: false })
        setRejected(false)
        load()
      }, [load])

      return h('div', { className: 'dblens' },
        h('style', null, CSS),
        h('svg', { width: 0, height: 0, style: { position: 'absolute' }, 'aria-hidden': true },
          h('symbol', { id: 'dblens-chev', viewBox: '0 0 16 16' },
            h('path', { d: 'M6 3.5L10.5 8L6 12.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        h('header', { className: 'lens-head' },
          h('button', { className: 'btn ghost sm', onClick: () => setRailOpen(!railOpen), title: '收起 / 展开左栏', 'aria-label': '收起或展开左栏' }, railOpen ? '⇤' : '⇥'),
          h('div', { className: 'lens-id' }, h('h1', null, '数据库透镜'), h('span', { className: 'tag' }, 'DB LENS')),
          h('div', { className: 'spacer' }),
          h(GuardMeter, { result: exec.result, rejected, timeoutMs }),
          h('button', { className: 'btn sm', onClick: refresh }, '刷新')),
        h('div', { className: 'lens-body' },
          h('aside', { className: 'rail', 'data-open': railOpen ? '1' : '0' },
            h('div', { className: 'rail-collapsed' },
              h('button', { className: 'btn ghost sm', onClick: () => setRailOpen(true), title: '展开左栏', 'aria-label': '展开左栏' }, '⇥'),
              h('span', { className: 'vlabel' }, 'Schema')),
            h('div', { className: 'rail-full' },
              h(ConnSec, { open: secs.conn, onToggle: () => toggleSec('conn'), onChanged: onConnChanged, refreshKey }),
              h(SchemaSec, { schema, error, open: secs.schema, onToggle: () => toggleSec('schema') }))),
          h('section', { className: 'work scroll' },
            h('div', { className: 'work-inner' },
              h(Card, {
                eyebrow: 'Query', title: '只读查询', sub: '仅 SELECT / SHOW / EXPLAIN / 只读 PRAGMA',
                open: cards.query, onToggle: () => toggleCard('query'),
                extra: h('span', { className: 'chip ro' }, '写操作一律拒'),
              }, h(QueryBox, { sql: sqlInput, setSql: setSqlInput, qerr: exec.qerr, busy: exec.busy, onExec: execSql })),
              h(AskCard, { onExec: execSql, busy: exec.busy, open: cards.ask, onToggle: () => toggleCard('ask') }),
              h(ResultCard, { result: exec.result, open: cards.result, onToggle: () => toggleCard('result') }),
              h(AuditCard, { open: cards.audit, onToggle: () => toggleCard('audit'), refreshKey: execKey })))))
    }

    function SidebarIcon() {
      return h('div', { className: 'dbl-icon', title: '数据库透镜', style: { width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#3DAE7C' } }, '库')
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
