# Cloudflare 正式上线记录

2026-10-23，正式地址：[https://own.bhwa233.com/](https://own.bhwa233.com/)。
网站、API、MCP、D1 数据访问和 AI 后台任务已运行在 Cloudflare；爬虫继续使用 GitHub Actions。
AI 模型为用户指定的 `step-3.7-flash`。原访问密码、媒体文件、URL、上传服务和 SparkHub 命令服务保持原配置。
旧会话失效，需要重新登录。

## 切换结果

以下时间为北京时间：

- 10:30：旧 PostgreSQL 写入冻结，网站继续读取旧数据，生成最终一致快照与完整备份。
- 11:01：`own.bhwa233.com` 绑定正式 Worker `todo-web`；原 Vercel CNAME 已替换。
- 11:03：正式域名读取验收后恢复 CF 写入，任务 CRUD 和模型调用通过。
- Producer / Consumer 已恢复原定时配置，并分别手动运行正式 main 版本进行验收。

首次尝试受本地内存压力影响，已恢复旧库写入和原定时任务后改用 CF 远程构建；该次未切换域名。
正式导入期间旧候选 D1 的第 6 个分片遇到 Cloudflare 内部错误，已弃用该部分导入库，换新空库从第 1 个分片完整重导。
不存在忽略错误后继续拼接数据的操作。旧候选 `todo-data` 不再被正式 Worker 绑定。

## 完整数据验证

最终快照：16 张业务/关联表、**316,356 行**、47 个 SQL 分片。
生产 D1 在开放写入前，逐表行数与全字段 SHA-256 全部相同，并通过完整性、外键及 Media 序列检查。
原 ID、关联、时间、软删除、媒体 URL、内嵌图片字段和爬取状态均保留。

| 表 | 最终源快照行数 | 生产全字段哈希 |
| --- | ---: | --- |
| TrackMeta | 5 | PASS |
| TrackItem | 18 | PASS |
| Task | 91 | PASS |
| Bookmark | 261 | PASS |
| BookmarkTag | 663 | PASS |
| Anniversary | 3 | PASS |
| producer | 53 | PASS |
| Post | 83501 | PASS |
| Media | 230694 | PASS |
| ProducerTag | 23 | PASS |
| TaskTag | 24 | PASS |
| _ProducerToProducerTag | 42 | PASS |
| Asset | 0 | PASS |
| CustomCommand | 19 | PASS |
| _BookmarkToBookmarkTag | 869 | PASS |
| _TaskToTaskTag | 90 | PASS |

Media 自增序列上限保留为 **231,584**，后续新增媒体不会复用旧 ID。
迁移时 Post 状态：FAILED 619、PROCESSING 1、UPLOADED 82,881；Media 230,694 条均为 UPLOADED。
保留了 PROCESSING 记录，未批量重置状态。上线后正常爬虫会继续更新这些业务状态。

## 生产资源

| 资源 | 正式配置 |
| --- | --- |
| 网站 | todo-web，自定义域名 own.bhwa233.com |
| 数据 Worker | todo-data-service，网站通过具名 Service Binding RPC 调用 |
| D1 | todo-data-production |
| D1 ID | c68ad351-2e9e-4eb5-8636-40307c7a722a |
| AI 队列 | todo-ai |
| 失败队列 | todo-ai-failures |
| 备份桶 | 私有 todo-web-backups |
| 模型 | step-3.7-flash |

正常生产配置为 `READ_ONLY=false`。维护时必须协调自动发布与只读开关，防止重新发布覆盖临时只读设置。
预览仍使用 todo-web-preview / todo-data-service-preview / todo-data-preview，与生产隔离。

## 发布与验收

两个仓库均已将 feature/cloudflare-d1 合入 main。
原 main 已分别备份到远程分支 `backup/main-before-cf-production-20261023`。

todo-web 的 main 已连接 Cloudflare Workers Builds：

- 网站：`pnpm build:production` → `pnpm cf:deploy:production`。
- 数据服务：`pnpm data:generate` → `pnpm data:deploy:production`。
- Node 24.15.0 / pnpm 11.1.0；生产构建和部署已成功。

真实生产验收已通过：签名登录、首页及任务/书签/打卡/纪念日/资产/图库页面读取、Task CRUD、MCP tools、模型润色、Queues 摘要写回、原图片加载。
浏览器显示原 91 条任务；图库首屏返回 100 项并成功加载原图片；个人页面没有进入 Service Worker 缓存。
已清理已知验收任务、书签、对应 AI 任务及无引用的新标签。

爬虫验收运行：

- [Producer](https://github.com/bhwa233/galaxy-spider/actions/runs/39893136075)：使用 main，已在生产 D1 推进来源采集时间。
- [Consumer](https://github.com/bhwa233/galaxy-spider/actions/runs/39893871108)：使用 main，已开始真实处理。

这里记录启动后的验证情况，不将仍在执行的爬虫任务写作“整批成功”。其最终状态以运行页面为准。

## 备份与回退

私有 R2 对象前缀：`todo-web-backups/production-20261023-0230/`，包含 database.dump、backup.json、source.tar.gz 和 verification.json。
完整 PG dump 已回下载核对 SHA-256：

`2403b69646e8d2ff9ff51a318ba23ac793462fb6aabaa4fed11b278171a981a2`

旧 PostgreSQL 保持只读，旧部署及备份保留用于回退。
上线后 CF 已产生写入，回退必须先停止新写入、排空 AI 工作、导出当前 D1 并全量回迁 PG，验证后再恢复旧部署。
不能直接恢复旧 DNS 或解除旧库只读，否则会遗漏上线后的数据。

维护状态、最终快照、原 DNS、生产验证和原始运行日志保存在 Git 忽略的 `.migration/`，未将密钥或业务原始数据提交到仓库。
操作和回迁命令见 [运行手册](d1-migration.md)。
