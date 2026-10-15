# Gallery 配置 MCP

Gallery MCP 管理 `/gallery` 中的采集来源（制作者）及标签。网页和 MCP 共用业务服务及数据库；它不上传或删除媒体，也不触发即时采集。

## 服务端配置

在现有 `.env.local` 或部署环境中添加：

```dotenv
GALLERY_MCP_TOKEN=替换为独立的随机密钥
# 可选：允许携带 Origin 的客户端来源，逗号分隔。
GALLERY_MCP_ALLOWED_ORIGINS=https://own.bhwa233.com
```

可用 `openssl rand -hex 32` 生成密钥。它与网页的 `EDIT_CODE` / `GALLERY_EDIT_CODE` 独立，仅授权图床配置工具。不要把密钥提交到仓库。服务端未配置 Token 时返回 503；缺失或错误凭证返回 401。网页 Cookie 不能用于 MCP 登录。

入口：`https://own.bhwa233.com/api/mcp/gallery`。本地开发入口为 `http://localhost:3012/api/mcp/gallery`。

传输为 **Streamable HTTP**。每次请求都要携带 `Authorization: Bearer <token>`。支持现代 MCP 和 2025 协议客户端，无需持久会话；响应可以是 JSON 或请求范围内的 SSE。不支持旧式双端点 HTTP+SSE、持久 GET 流或 OAuth 登录。请求体上限 64 KiB。

默认允许 `https://own.bhwa233.com` 的 Origin；非生产环境还允许本地 3012 端口。非浏览器客户端通常不发送 Origin，可正常使用。其他浏览器来源需显式配置允许列表。

## OpenClaw 连接

将服务配置到 OpenClaw 的 `mcp.servers`。以下密钥引用从 OpenClaw Gateway 进程的环境变量读取，服务端和 Gateway 需要配置同一密钥：

```json
{
  "mcp": {
    "servers": {
      "gallery": {
        "url": "https://own.bhwa233.com/api/mcp/gallery",
        "transport": "streamable-http",
        "headers": {
          "Authorization": "Bearer ${GALLERY_MCP_TOKEN}"
        },
        "requestTimeoutMs": 30000
      }
    }
  }
}
```

在 OpenClaw 所在环境验证连接：

```sh
openclaw mcp doctor gallery --probe
```

使用其他 MCP 客户端时配置同一 URL、Streamable HTTP 及 Bearer 请求头即可。具体配置语法和工具审批方式取决于客户端版本。

参考：[OpenClaw 传输配置](https://docs.openclaw.ai/cli/mcp/transports)、[官方 MCP SDK HTTP 服务](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md)。

## 工具

| 工具                         | 行为                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `gallery_resolve_source`     | 解析 ID、完整链接、短链接或包含单个链接的分享文本，不保存   |
| `gallery_list_sources`       | 搜索和分页，支持类型、平台 ID、标签、无标签及包含已删除来源 |
| `gallery_get_source`         | 按配置记录 ID 获取详情，包含已删除来源                      |
| `gallery_create_source`      | 创建来源并在同一事务中关联标签                              |
| `gallery_update_source`      | 部分更新名称、平台身份或全部标签                            |
| `gallery_delete_source`      | 软删除来源，保留媒体与帖子                                  |
| `gallery_restore_source`     | 恢复来源，相同身份已被占用时拒绝                            |
| `gallery_change_source_tags` | 增量添加、移除标签，保留其余标签                            |
| `gallery_list_tags`          | 搜索有效标签并分页                                          |
| `gallery_create_tag`         | 创建或复用标签                                              |
| `gallery_update_tag`         | 修改标签名称、备注                                          |
| `gallery_delete_tag`         | 软删除标签并移除关联，保留来源和媒体                        |

`id` 是数据库中的**配置记录 ID**；`platformId` 是平台账号或话题 ID，两者不能混用。来源结果包含标签、有效媒体数、帖子数、最后采集时间、更新时间及规范链接。结果通过 `structuredContent` 和 JSON 文本同时返回。

### 来源输入

支持六种类型：`WEIBO_PERSONAL`、`WEIBO_SUPER_TOPIC`、`XIAOHONGSHU_PERSONAL`、`XIAOHONGSHU_SUPER_TOPIC`、`DOUYIN_PERSONAL`、`DOUYIN_SUPER_TOPIC`。配置支持这些类型，不代表所有平台的采集器均已实现。

- ID 模式：提供 `type`、`platformId`，名称可用 `name` 指定。
- 链接模式：提供 `url`，自动识别类型和 ID。`url` 可包含一段带单个链接的分享文本。
- 同时提供链接、类型和 ID 时，必须相互匹配，否则返回 `SOURCE_MISMATCH`。
- 个人主页和话题链接支持微博 `/u/ID`、`/profile/ID`、`/p/100808…`，小红书 `/user/profile/ID`、`/page/topics/ID`，抖音 `/user/ID`、`/challenge/ID` 等已知格式。微博超话 ID 包含 `100808` 前缀；抖音用户链接中的 ID 通常是 `sec_uid`。
- 官方短链接通过最多三次 HTTP 跳转展开；每一跳都校验平台域名和公开网络地址。不执行页面 JavaScript，也不使用平台登录凭证。需要脚本、登录或验证码才能展开的链接会返回解析失败；可改用完整链接或 ID。
- 帖子、笔记、视频 ID 不会被当作来源 ID，需提供主页或话题链接。
- 用户指定名称优先。省略时尝试读取公开页面标题；拿不到有效名称时，解析工具返回 `missingFields: ["name"]`，创建工具返回 `NAME_REQUIRED`，不会凭空编造名称。

### 写入语义

- 同一 `type` + `platformId` 的重复创建返回 `already_exists` 和已有来源，**不覆盖名称或标签**；已删除记录返回 `deleted_exists`，可按记录 ID 恢复。
- 来源和标签关联原子保存。无效或已删除标签使整次操作回滚。标签使用记录 ID，可先查询或创建标签。
- 更新时省略字段保留原值；`tagIds` 替换全部标签，`[]` 清空标签。只增删少量标签时用 `gallery_change_source_tags`。
- 来源更新、增量标签操作可传入查询返回的 `updateTime` 作为 `expectedUpdateTime`，过期时返回 `CONFLICT`。
- 修改平台类型或 ID 时保留历史媒体、帖子并清空 `lastPostTime`，使后续采集重新建立进度。若目标身份已存在则返回 `DUPLICATE_SOURCE`。
- 删除来源不删除媒体或帖子；后续爬虫查询将排除此来源，但正在进行的采集不保证立即停止。网页刷新后能看到 MCP 的修改。
- 删除标签移除其全部来源关联。重新创建同名已删除标签会复用标签记录，不恢复旧关联。标签名称按数据库的精确字符串匹配。
- 来源创建、修改、恢复及标签关联使用 PostgreSQL Serializable 事务并重试冲突，避免多实例请求重复创建或互相覆盖标签。

## 验证

常规检查：`pnpm type-check`、`pnpm lint`、`pnpm exec vitest run`、`pnpm build`。

事务测试仅在显式提供 `GALLERY_TEST_DATABASE_URL` 时运行。它必须指向**可清空的本地 PostgreSQL 数据库**，数据库名以 `_test` 结尾，不含查询参数。测试会清空该库的 gallery 表。使用仓库的真实 Prisma schema 建表，不要使用线上连接：

```sh
DATABASE_URL=postgresql://gallery_test@127.0.0.1:55439/gallery_mcp_test pnpm exec prisma db push --skip-generate
GALLERY_TEST_DATABASE_URL=postgresql://gallery_test@127.0.0.1:55439/gallery_mcp_test pnpm exec vitest run src/api/gallery/configService.integration.test.ts
```
