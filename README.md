# Todo Web 应用

一个基于 Next.js 构建的功能丰富的 Web 应用，集成了生产力工具和娱乐功能。使用 Bun 作为运行时和包管理器，提供更快的开发体验。

## 开发环境

### 环境要求
- [Bun](https://bun.sh/) >= 1.0.0

### 快速开始
```bash
# 安装依赖
bun install

# 开发环境运行
bun dev

# 构建
bun run build

# 生产环境运行
bun start
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
- Bun - JavaScript 运行时和包管理器
- Next.js
- [zustand-middleware-computed](https://github.com/lxw15337674/zustand-middleware-computed) - 状态管理

## 项目链接
- [前端仓库](https://github.com/lxw15337674/todo-web)
- [后端仓库](https://github.com/lxw15337674/todo-backend)

## 开发计划
- 待办事项排序功能
- 阅后即焚消息功能
