# Cloudflare 运行与一次全量迁移

网站运行在 vinext + Vite + Cloudflare Workers，数据服务通过具名 Service Binding RPC 访问 D1。
爬虫继续在 GitHub Actions 运行，使用单独的 Bearer 凭据调用数据 Worker 的 `spider/*` 接口。
媒体文件、原 URL 和上传服务保留；SparkHub 命令服务继续独立运行。

范围与切换门槛见 [迁移计划](cloudflare-migration-plan.md)，实际验证结果见 [实施记录](cloudflare-migration-validation.md)。

## 环境隔离

| 资源 | 预览 | 生产准备 |
| --- | --- | --- |
| 网站 | todo-web-preview | todo-web |
| 数据 Worker | todo-data-service-preview | todo-data-service |
| D1 | todo-data-preview | todo-data-production |
| AI 队列 | todo-ai-preview | todo-ai |
| 失败队列 | todo-ai-failures-preview | todo-ai-failures |

生产已正式上线，详情见 [上线记录](cloudflare-production-release.md)。正常生产配置 `READ_ONLY=false`，旧 PostgreSQL 保持只读。
以下全量导入步骤用于受控迁移或新建空目标，不能重复导入现用生产库。预览使用受登录保护的独立副本。
不要将预览库当作最终快照，也不要向非空正式库重复导入。

## 开发与检查

```sh
pnpm install --frozen-lockfile
pnpm data:generate
pnpm cf:check
pnpm data:check
pnpm lint
pnpm exec vitest run
pnpm build
pnpm cf:deploy:preview
```

数据 Worker 本地启动需先执行迁移。测试仅使用独立本地 D1，不能指向真实远程服务：

```sh
pnpm exec wrangler d1 migrations apply DB --local --config data-service/wrangler.jsonc --persist-to .wrangler/tests
pnpm exec wrangler dev --config data-service/wrangler.jsonc --persist-to .wrangler/tests --port 8792 --var READ_ONLY:false --var ALLOW_LOCAL_HTTP_WEB_API:true
# TEST_DATA_SERVICE_TOKEN 与上述本地 Worker 的 WEB_API_TOKEN 一致，放在本地私密环境文件中。
TEST_DATA_SERVICE_URL=http://127.0.0.1:8792 pnpm exec vitest run
```

Vitest 顺序执行测试文件：两个 D1 集成套件会清理同一个可丢弃测试库。
未设置 `TEST_DATA_SERVICE_URL` 时，10 个 D1 集成测试会跳过，不能将这种结果称为完整数据库验收。

## 发布与 Secrets

网站：`EDIT_CODE`、`GALLERY_EDIT_CODE`、随机且至少 32 字节的 `SESSION_SECRET`，以及现有监控和 MCP 配置。
数据服务：`SPIDER_API_TOKEN`、`AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`，可选 `AI_PROMPT`。
新会话使用 JOSE 签名并绑定密码版本；旧明文角色 Cookie 不再作为授权依据。

不要复制旧 `DATABASE_URL`、Vercel OIDC 或整份 `.env.local` 到 Workers。
Secrets 使用 Wrangler 交互输入或 Git 忽略、权限为 600 的 JSON 文件通过 `secret bulk` 写入。
网站不持有公网数据 Worker 的管理令牌。`WEB_API_TOKEN` 只用于显式允许的 loopback 本地测试。
校验与回迁通过管理 CLI 导出 D1 完成，没有公网校验接口。

```sh
pnpm build:production
# 构建时选择 CLOUDFLARE_ENV=production；生成配置已包含环境值，发布时不能再传 --env。
pnpm cf:deploy:production
# 数据 Worker 的源配置则必须显式指定生产环境：
pnpm data:deploy:production
```

构建和发布必须依次完成，不能一边重建 dist 一边上传。
正式发布前检查 `dist/server/wrangler.json` 的 name=todo-web、APP_ENV=production、TODO_DATA=todo-data-service。
正式源配置已包含 own.bhwa233.com 的 Custom Domain；生产发布会保持该绑定。
Workers Builds 已为 feature/cloudflare-d1 配置网站与数据服务的预览触发器。
main 已开启生产自动发布；feature/cloudflare-d1 对应独立预览发布。

## 正式维护窗口

开始前先约定维护时间。停写前完成预览验收，并记录两个仓库准确的发布 commit、旧部署与 DNS 快照。
运行以下脚本的 `SOURCE_DATABASE_URL` / `TARGET_DATABASE_URL` 只从私密环境加载，勿写进聊天、命令历史或仓库。

1. 暂停旧网站、MCP 与其他旧后台写入。禁用 Producer / Consumer 工作流的定时和手动触发，等待正在运行的任务结束。保留工作流原状态，以便恢复。仅改 D1 只读开关不能冻结 PostgreSQL。
2. 排查旧库所有连接角色与客户端。下列脚本保存原数据库/角色设置，设置默认事务只读并关闭遗留连接，随后用新连接执行零行 UPDATE 验证收到 PG `25006`。发现其他角色连接/覆盖设置时拒绝继续。只有指定管理连接覆盖只读；旧应用不得设置 `default_transaction_read_only=off`。冻结失败时维持维护状态，检查状态文件后恢复，不能带错误继续导出。

```sh
node scripts/d1/postgres-maintenance.mjs --freeze --confirm-maintenance-window --state .migration/production-maintenance.json
node scripts/d1/backup-postgres.mjs .migration/final-pg-backup
pnpm data:export .migration/final-source
```

`pg_dump` 必须可用且版本不早于源 PG；可用 `PG_DUMP_PATH` / `PG_RESTORE_PATH` 指定。
备份覆盖整个数据库，包含 `_prisma_migrations`。导出器在只读一致事务中覆盖全部 16 张业务和关联表，拒绝未知表/字段。
超大字段分块导入，不截断旧 CustomCommand 的内嵌图片；导出记录 Media 序列上限。
将 dump、backup.json、manifest、SQL 分片及校验报告上传私有 `todo-web-backups` R2，并回下载核对 SHA-256。
保留至少两份独立副本；不要给备份桶开启公开访问。

3. 确认生产目标为空、数据 Worker 及 AI consumer 仍只读。执行完整导入和逐行校验：

```sh
pnpm data:import .migration/final-source --remote --env production --confirm-empty-target
pnpm data:verify .migration/final-source --remote --env production --confirm-writes-paused
```

必须全部 16 表行数、全字段 SHA-256、完整性、外键及 Media 序列通过。任何失败都停止切换。
导入中断后不能忽略错误或盲目重跑；新建空目标、重新绑定并从头导入，以避免半成品和重复记录。

4. 配置正式 Secrets，部署只读数据 Worker 与正确生产构建，用受控入口验收读取、登录、MCP、原媒体 URL 与上游服务。
5. 将正式域名与全部写入端切到同一个生产 Worker/D1：网站 Service Binding、爬虫 GitHub Secrets `DATA_SERVICE_URL` 与 `DATA_SERVICE_TOKEN`。Producer / Consumer 的时间表、Playwright、上传服务不改。旧 PG 保持冻结，防止缓存旧客户端产生分叉。
6. 明确将生产数据配置 `READ_ONLY` 改为 false 并发布，受控验收 CRUD、摘要/标签、失败重试、并发领取和去重。通过后开放用户写入。该值需同步提交，避免下次自动发布意外恢复只读。
7. 手动各运行一次 Producer / Consumer，确认真实帖子、媒体和状态正常，再恢复原定时配置。原 PROCESSING 与已落库进度保持，不全量重置。

## 回滚

尚未向 D1 写入时，可以切回旧部署，然后用维护状态文件恢复原设置，重启旧连接池。
已经产生新写入时，必须先完成 D1 → PG 反向全量迁移，不能直接切回旧数据。

先停止新网站和全部爬虫写入，允许当前 AI 工作完成，并确认 `_AiJob` 没有 PENDING/PUBLISHED/RUNNING。
再将数据 Worker 改回只读，保留 D1 最新快照。若模型故障使任务无法排空，应先修复/人工处理并保存任务快照；工具会拒绝静默丢弃未完成 AI 任务。

```sh
# TARGET_DATABASE_URL 必须明确指向保持冻结的旧库。
node --experimental-strip-types scripts/d1/restore-postgres.mjs --remote --env production --confirm-replace-target --confirm-writes-paused
```

脚本一次 PG 事务锁定全部业务表，反向删除、按依赖插入，覆盖新增/修改/硬删除，逐表哈希验证后提交。
只允许此管理连接越过只读默认设置。Media 序列只前进，不复用已分配 ID；PG 的 setval 不随事务回滚。
未知表、结构不一致、外部约束或哈希不一致都会中止并回滚行数据。
确认反向报告、旧只读页面与域名正确后再执行：

```sh
node scripts/d1/postgres-maintenance.mjs --thaw --confirm-maintenance-window --state .migration/production-maintenance.json
```

恢复旧部署连接池和爬虫原配置，再开放旧写入。保留 CF 资源、所有快照和报告，不自动删除。
