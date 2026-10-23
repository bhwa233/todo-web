# Todo Web 应用

正式站：[own.bhwa233.com](https://own.bhwa233.com/)。[Cloudflare 上线记录](docs/cloudflare-production-release.md)。

网站采用 vinext + Vite 部署至 Cloudflare Workers，通过内部 Service Binding 访问独立 D1 数据服务；爬虫仍在 GitHub Actions。
本地运行、全量数据迁移与维护窗口切换步骤见 [D1 迁移说明](docs/d1-migration.md)。

一个兼容 Next.js App Router 的 Web 应用，集成生产力工具、图库和 MCP。使用 pnpm 管理依赖。

## 开发环境

### 环境要求
- Node.js 22.18+（迁移工具使用 node:sqlite），pnpm 11.1.0

### 快速开始
```bash
# 安装依赖
pnpm install --frozen-lockfile

# 开发环境运行
pnpm dev

# 构建
pnpm build

# 生产环境运行
pnpm preview
```

## 功能特性

- **Gallery 配置 MCP**：通过 OpenClaw 等 agent 管理采集来源及标签，支持平台 ID、完整链接和官方短链接。配置方法见 [Gallery MCP 文档](docs/gallery-mcp.md)。

### 核心功能
- **用户认证**
  - 安全的登录和登出功能
  - 用户会话管理

- **待办事项管理**
  - 待办事项的增删改查
  - 用户自定义待办类型
  - 高级筛选功能
  - 任务组织与管理

- **计数系统**
  - 计数器的跟踪和管理
  - 数据统计和可视化
  - 数据追踪功能

### 娱乐与工具
  
- **社交功能**
  - 今日热榜
  - 摸鱼办公区

## 技术栈

### 前端
- vinext + Vite + React
- Cloudflare Workers / D1 / Queues / R2 备份
- pnpm
- [zustand-middleware-computed](https://github.com/lxw15337674/zustand-middleware-computed) - 状态管理

## 项目链接
- [前端仓库](https://github.com/lxw15337674/todo-web)
- [后端仓库](https://github.com/lxw15337674/todo-backend)

## 开发计划
- 待办事项排序功能
- 阅后即焚消息功能
