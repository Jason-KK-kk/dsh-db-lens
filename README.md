# dsh-db-lens · 数据库透镜

> 给 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai) 的 agent 配一个**只读、限量、留痕的查数窗口**——人看得见 schema 与结果、拿得走 CSV、放心把库交给 agent。

给 DSH 接数据库的个人与团队。不跟 DBeaver/Navicat 拼 GUI 功能，价值在「与 DSH agent 联动＋安全护栏」。

## 为什么需要它

把数据库交给 AI agent，有三个真实顾虑：

1. **不敢给权限**——怕 agent 误写、拖全表。
2. **结果看不全**——agent 回一坨文本宽表，不能排序、不能导出。
3. **问数编表名**——自然语言问数没有真实 schema 上下文，AI 编表名、错一次烧一次 token。

dsh-db-lens 的答法：**只读死守＋限量＋留痕＋人确认**。AI 只能看、不能改；查多了自动截断、查太久自动停；每次查询留审计；AI 写的查询要人点头才执行。

## 核心护栏（只读死守，不留写口子）

| 护栏 | 行为 |
|---|---|
| **只读白名单** | 仅放行 `SELECT` / `WITH…SELECT` / `SHOW` / `EXPLAIN` / SQLite 只读 `PRAGMA`；`UPDATE`/`DELETE`/`INSERT`/DDL/写 PRAGMA/多语句堆叠一律拒。 |
| **双层拒写** | 白名单闸＋驱动层：SQLite `readOnly` 打开；MySQL/PG `READ ONLY` 事务＋建议只读 DB 用户（`GRANT SELECT`）。 |
| **行数上限** | 默认 1000 行，超限截断并明示「已截断至 N 行」；可配不可关。 |
| **超时中断** | 默认 10s，可配不可关。SQLite 子进程到点真杀；MySQL/PG 语句超时＋连接中断。 |
| **审计留痕** | 查询/拒写/截断/超时全记 NDJSON（0600），脱敏（不记密码/完整连接串）。 |
| **人确认闸** | 自然语言问数生成 SQL 后**必须人点「确认执行」**才走查询；生成端点只生成不执行。 |

agent 查数工具（`db_lens_query` / `db_lens_schema`）走与面板**完全相同**的护栏路，无旁路。

## 功能

- **连接管理**：SQLite 文件 / MySQL / PostgreSQL；内置示例 SQLite 开箱即玩。
- **schema 树**：库→表→列（类型/主键/约束），读自库内真实结构。
- **查数＋结果表**：手写 SELECT 出可排序结果表，一键导出 CSV。
- **自然语言问数**：喂真实 schema 上下文给 DSH 当前模型生成 SQL，人确认后执行。
- **agent 工具**：DSH agent 可自主只读查数，同护栏兜底。

## 安装

需要本机已装 DSH（`dsh` CLI 可用）。在插件目录执行：

```bash
dsh plugin --profile web add /path/to/dsh-db-lens
dsh web --no-open
```

浏览器打开 DSH 打印的地址（默认 `http://127.0.0.1:3080`），侧栏点「数据库透镜」。

卸载：`dsh plugin --profile web remove @local/dsh-db-lens`。

> 安装机制为本机实测流程（`dsh plugin add` 自动登记 link 依赖＋bundles）。其他部署形态理论同机制，本项目仅本机实测。

## 开箱即用

装好无需任何自己的数据库：默认「内置示例 SQLite」含 4 张表（customers/products/orders/order_items，共 1018 行），可直接走通 schema 树→查数→CSV→问数全流程。

## 连接自己的数据库

面板「＋添加连接」选类型填表：

- **SQLite**：文件路径。
- **MySQL / PostgreSQL**：主机 / 端口 / 用户名 / 密码 / 数据库名。

🔴 **强烈建议给插件用一个只读账号**（数据库里只授予 `SELECT` 权限）。这样即使绕过界面，数据库本身也拒绝写——白名单闸＋只读账号双保险。

连接信息只存本机 `connections.json`（权限 0600、已 `.gitignore`），不进 git、不出现在日志或聊天里。

## 配置护栏

插件目录 `limits.json`（0600、已 `.gitignore`）：

```json
{ "maxRows": 1000, "timeoutMs": 10000 }
```

可配但不可关：非法值（0/负数/非整数）一律回退默认。

## 开发与测试

```bash
npm install
node --test "test/*.test.mjs"   # 42 项单测，不烧 token、不依赖活库
node scripts/seed-sample.mjs    # 重建内置示例 SQLite
```

MySQL/PG 集成验收（可选，需本机 Docker）：起临时容器后 `ROOT_PASS=... READER_PASS=... node scripts/seed-containers.mjs`（口令走环境变量，不入仓库）。

## 能力边界（不夸大）

- 只读：不提供任何写操作入口。
- 问数 SQL 质量取决于 DSH 当前模型；复杂多库/多轮查询质量未做广泛验证。
- 不做：ER 图、慢查询分析、多用户、云同步、连接串云备份。

## 免责

本插件按「现状」提供，不对连接的生产数据库做任何写操作，但**用户应自行使用只读账号并先在测试库验证**。作者不对因使用本插件产生的任何数据损失或业务影响负责。请遵守所在组织的数据安全与合规要求。

## 许可证

[MIT](./LICENSE)

