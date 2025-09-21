# 云剪贴板（Cloud Clipboard）

[English](README.md) | 简体中文

一个自托管的云剪贴板应用，用于在设备间快速分享文本、图片和文件。基于 Next.js 构建，支持实时同步、拖拽上传和轻量认证，适合个人或小团队使用。

- 实时同步：通过 Socket.IO 广播新建/删除事件
- 拖拽上传：小文件内联存储，大文件落地到磁盘
- 轻量认证：单一访问口令，浏览器会话内记住
- 响应式 UI：基于 shadcn/ui 与 Tailwind CSS 4

## 架构概览
- 前端：Next.js App Router（React 19），组件库 `src/app`, `src/components/ui`
- 服务端：自定义入口 `server.ts`，挂载 Socket.IO 实时服务
- 数据：SQLite + Prisma（`prisma/schema.prisma`, `src/lib/db.ts`）
- 认证：`/api/auth/verify` 验证口令，并写入会话 Cookie
- 实时：`src/lib/socket.ts`, `src/lib/socket-events.ts`

## 快速开始（本地开发）
### 依赖
- Node.js 20+
- npm 10+

### 安装依赖
```bash
npm ci
```

### 初始化数据库（首次）
```bash
npm run db:push
```
> 将 Prisma schema 同步到本地 SQLite 数据库。

### 启动开发服务
```bash
npm run dev
```
打开 `http://localhost:8087`。

## 生产构建与运行
```bash
npm run build
npm start
```
- `npm start` 会在启动前执行 `prisma db push` 以确保表结构存在。
- 监听端口 `8087`（可通过 `PORT` 覆盖）。

## 环境变量
在项目根目录创建 `.env`（最少包含以下两项）：

```
DATABASE_URL="file:../data/custom.db"
CLIPBOARD_PASSWORD="change-me"
```
- `DATABASE_URL` 指向 SQLite 数据库文件。相对路径相对于 `prisma/schema.prisma` 解析，因此 `file:../data/custom.db` 实际落在项目根目录的 `data/custom.db`（Docker 中为 `/app/data/custom.db`）。
- 如果未设置 `DATABASE_URL`，程序会自动回退到 `file:<项目根>/data/custom.db`。
- `CLIPBOARD_PASSWORD` 为访问口令。前端会将口令存入会话；服务端中间件会校验请求头或 Cookie。

## Docker 部署
### 本地构建镜像
```bash
# 完整镜像（包含 Prisma 生成）
docker build -t cloud-clipboard:latest -f Dockerfile .

# 精简镜像（不包含初始化，体积更小）
docker build -t cloud-clipboard:slim -f Dockerfile.slim .
```

### 使用 Docker Compose（推荐）
1) 准备 `.env`：
```
DATABASE_URL="file:../data/custom.db"
CLIPBOARD_PASSWORD="change-me"
```
2) Compose 示例（持久化数据目录）：
```
services:
  app:
    image: <your-registry>/cloud-clipboard:latest
    ports:
      - "8087:8087"
    env_file: .env
    volumes:
      - /srv/cloud-clipboard/data:/app/data
    restart: unless-stopped
```

### 首次初始化（仅 `:slim` 镜像）
`slim` 镜像不会在启动时自动执行 `prisma db push`。如果挂载的是全新空卷，需先初始化一次：
```bash
docker run --rm \
  -v /srv/cloud-clipboard/data:/app/data \
  --env-file /srv/cloud-clipboard/.env \
  <your-registry>/cloud-clipboard:latest \
  npx prisma db push --skip-generate
```
或者先用 `:latest` 启动一次创建表，再切回 `:slim`。

## 数据存储与备份
- 数据库：`data/custom.db`（SQLite，含元数据与小文件 BLOB）
- 大文件：`data/uploads/`（启动时自动创建，API 流式读取）
- 备份/迁移时请同时备份上述两处。

## 使用提示与常见问题
- 复制按钮与 HTTP 环境
  - 浏览器的剪贴板 API 需要“安全上下文”（HTTPS 或 localhost）。在 HTTP 环境下，系统复制可能受限。
  - 本应用已内置降级与提示：HTTPS/localhost 下会直接复制；HTTP 下会提示并选中文本，便于手动复制。建议在生产启用 HTTPS 以获得最佳体验。
- 移动端拖拽
  - 拖拽操作与页面滚动在移动端可能冲突，建议采用“拖拽把手”的交互或开启 Touch 传感器以降低误触。若需要，我可以帮助在卡片标题区加入把手并优化体验。

## 目录结构
```
src/
├─ app/              # App Router 页面、API 路由、layout、全局样式
├─ components/ui/    # 可复用 UI 组件封装
├─ components/clipboard/ # 剪贴板业务组件
├─ hooks/            # 自定义 hooks（toast 等）
└─ lib/              # 鉴权、数据库、socket、工具函数
prisma/              # Prisma schema 与迁移
server.ts            # 自定义 Next.js + Socket.IO 服务器入口
```

## 许可证
本项目为自托管的云剪贴板应用，遵循仓库默认许可策略（如需变更可补充 LICENSE）。
