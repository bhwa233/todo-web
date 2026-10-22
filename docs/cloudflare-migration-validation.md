# Cloudflare 迁移实施记录

日期：2026-10-22。分支：两个仓库均为 `feature/cloudflare-d1`。
当前处于预览验收与发布准备阶段，正式域名仍指向 Vercel，旧 PostgreSQL 仍是现网数据源。

## 备份与全量演练

实施前通过独立临时 Git index 为两个仓库创建快照分支，没有切换工作目录或覆盖已有修改：

- `backup/feature-before-full-cf-20261022-164622`，todo-web：`02f2ca215e3db0869df2232417f7d5f0d5b923c1`。
- 同名 galaxy-spider 分支：`90a98551cd903a85fc7aef5511ed718e11785275`。

旧 PG 仅执行只读查询和导出；从未对现网执行 freeze/thaw、清表、状态重置或权限调整。
全库 custom-format dump 已成功恢复到隔离 PG 18，包含旧 Prisma 迁移历史。
私有 R2 桶 `todo-web-backups` 的 `rehearsal-20261022/postgres-before-cf.dump` 已回下载验证 SHA-256：

`56ee54ac560e43cbed233adeca891d4de4b998584a783f3754208b0b16669ecd`

16 张旧业务/关联表共 **315,693 行**，SQL 分片共 196,134,434 字节、47 个文件。
远程预览 D1 全部导入完成；本地及远程均逐表核对行数、全字段 SHA-256、外键与完整性。
不是抽样校验。CustomCommand 的 19 条旧记录完整保留，含约 332 KB 内嵌图片字段。

| 表 | 行数 | 远程全字段哈希 |
| --- | ---: | --- |
| TrackMeta | 5 | PASS |
| TrackItem | 18 | PASS |
| Task | 91 | PASS |
| Bookmark | 261 | PASS |
| BookmarkTag | 663 | PASS |
| Anniversary | 3 | PASS |
| producer | 53 | PASS |
| Post | 83378 | PASS |
| Media | 230154 | PASS |
| ProducerTag | 23 | PASS |
| TaskTag | 24 | PASS |
| _ProducerToProducerTag | 42 | PASS |
| Asset | 0 | PASS |
| CustomCommand | 19 | PASS |
| _BookmarkToBookmarkTag | 869 | PASS |
| _TaskToTaskTag | 90 | PASS |

源快照 Post：UPLOADED 82,712、FAILED 614、PENDING 51、PROCESSING 1；Media 230,154 条均为 UPLOADED。
迁移没有清空或批量重置状态。正式切换仍需停写后重新导出，不能复用演练副本。
源 PG 大小约 193 MiB（含索引），导入后 D1 约 215 MiB（含派生索引与任务表）。

观测耗时：成功源导出约 2 分 53 秒；远程导入 47 文件约 5 分 56 秒（依据导入日志创建/完成时间）。
只读 PG 下全量反向恢复及哈希验证约 58 秒。以上受当时网络和数据量影响，不能作为维护窗口 SLA。
正式窗口建议预留 60 分钟；停写后 30 分钟仍未完成导入与全字段校验则停止切换，保持维护并按回滚手册恢复旧站。

## 反向恢复与冻结

在隔离 D1 快照中新增一条 Task、修改原 Task、硬删除一条 Anniversary，再完整回迁隔离 PG。
16 表逐行哈希一致；新增、修改、硬删除均正确保留，Media 序列检查通过。
再次将该 PG 设置为默认只读，新普通连接 UPDATE 收到 `25006`；管理连接成功反向恢复并校验，随后恢复原设置。
新增备份脚本已验证能生成可列出的完整 PG dump；序列捕获版本已对本地恢复的完整源库重新导出成功。

冻结脚本拒绝存在其他角色连接/只读覆盖设置的环境；正式执行前仍须停止所有旧网站、MCP 和 Actions 写入者。
管理员覆盖只读仅用于回滚，不代表数据库角色撤权；切换期间应用不得显式关闭事务只读。

## 运行实现

- 网站：vinext 1.3.0 / Vite 8.3.5 / React 19.3.1，Workers RSC/SSR、Server Actions、API、MCP。
- 网站 → 数据服务：具名 Service Binding RPC；公网没有网站管理查询/校验接口。
- 数据服务：官方 Prisma D1 adapter，D1.batch 原子业务写入、乐观版本检查、并发领取与媒体去重。
- AI：D1 事务内 outbox + minutely cron + CF Queues，租约、有限重试、失败队列、过期结果拒绝覆盖及手动重试。
- 原模型 step-2-mini 的真实接口返回 model_invalid 404。用户同意后，仅预览改用同供应商 step-3.5-flash-2603。
- 会话：JOSE 签名、过期时间、角色及密码版本验证；旧 auth_role/auth_token 不再授权。
- 图库随机：持久化随机索引、固定 seed 分页；不向网站下载全部 230,154 个 ID。
- 旧命令数据只归档于 todo D1，现用命令服务继续调用 SparkHub。

## 实际验收证据

- 网站类型检查、数据 Worker 类型检查、ESLint、预览构建通过；生产环境构建选择也已验证。
- 网站 Vitest：13 文件、46 项通过，包含 10 项真实本地 D1 集成检查。
- galaxy-spider：TypeScript 通过；6 个不依赖外部微博登录态的回归文件、27 项通过。
- 爬虫全套网络测试有 4 项失败、15 项跳过：现有微博登录态/反爬及共享浏览器上下文相关，不能宣称真实 GHA 采集通过。
- 真实预览 UI 登录成功、任务读取/创建成功，图库随机分页与历史媒体加载成功。
- 真实 CF 队列生成 Task 标签和 Bookmark 摘要并写回 D1；润色返回多种风格；失败任务重试后完成。
- MCP 真实读取与创建标签成功；缺少 Bearer 凭据返回 401。
- 爬虫 token 可读取真实预览来源、正确反序列化 Date；尝试查询网站 Task 返回 403。
- 伪造/图库角色跨路由请求管理员 Server Action 未产生数据写入。vinext 的跨路由转发拒绝可能返回 200 `{}`，不能仅以状态码作为写入成功依据。
- 浏览器 Service Worker 已接管，只有静态 precache；检查未发现任务/书签/认证响应进入缓存。通过 CDP 同时切断页面和 Service Worker 网络，硬导航成功显示“暂时离线”。单独设置页面 offline 不影响 Service Worker 自身网络，不能用来证明离线行为。

## 资源与发布

预览站：[todo-web-preview](https://todo-web-preview.404174262.workers.dev)。需使用现有访问密码登录。
预览数据服务：todo-data-service-preview；D1 ID：`03abe360-703c-4528-82e1-f76b04f21176`。
生产准备 D1：todo-data，ID：`9ba6758b-59b5-4454-bc14-6b94b1df7c63`，独立队列 todo-ai / todo-ai-failures。
生产目标仅建表，未导入业务数据，配置 READ_ONLY=true，尚未挂载域名。
正式 DNS 只读核实：own.bhwa233.com 仍为指向 Vercel 的 CNAME。

Workers Builds 已连接 bhwa233/todo-web，仅匹配 feature/cloudflare-d1：

- 网站触发器：`c82e40d2-c713-4dee-a3e9-a46571be1f65`，pnpm build / pnpm cf:deploy:preview。
- 数据触发器：`b716e0d3-e1fe-468a-8f0d-ff0fe330dc6c`，pnpm data:generate / Wrangler 预览部署。
- Node 24.15.0、pnpm 11.1.0；生产自动构建尚未启用。

完整导出、私密凭据、备份与原始日志位于 Git 忽略的 `.migration/`，不得提交到仓库。
操作步骤见 [运行与回退手册](d1-migration.md)。

## 正式切换前剩余门槛

生产维护窗口尚未开始：最终停写快照、正式导入、域名、正式 Secrets、爬虫写入端切换以及真实 GHA 采集必须在窗口内完成。
预览模型替换目前仅获预览授权，正式 AI_MODEL 需随切换确认。
离线降级、链接标题的 CF 网络兼容性和首次远程 Git 构建结果正在补充验收，完成前不将生产状态标为就绪。
