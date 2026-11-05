# 下载监控迁移到 admin

下载服务的监控入口迁移到 `https://admin.bhwa233.com/zh/admin/downloader`。own 的 `/admin/monitor` 返回永久跳转，保留支持的筛选和分页参数；旧字段 `url`、`requestDomain`、`page`、`sortBy`、`sortOrder` 转换为新字段。不跨域传递登录凭证或任意跳转目标，首次进入 admin 使用其现有管理口令登录。

旧 `/api/admin/monitor` 返回 410、`MONITOR_MOVED` 和新入口，不再访问下载服务。own 的监控菜单、客户端和全量抓取聚合已移除。下载 API 与统计 D1 继续独立运行；新页面经 SparkHub API 的只读 service binding 网关访问，不经 own。

先发布支持 `urlSearch` 的下载 API，再配置 SparkHub API 的 `DOWNLOAD_API_ADMIN_KEY` 并发布网关/admin。确认四个页签、筛选分页、详情和权限后，才发布此仓库的跳转。最后移除 own 运行环境中的 `MONITOR_API`、`MONITOR_API_KEY`（若存在）；本地忽略文件与生产 secret 不在代码变更时自动删除。

回滚前准备原有 own 监控配置，恢复旧页面版本，随后再回滚新入口。无需数据库迁移。
