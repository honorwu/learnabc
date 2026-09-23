# 认词簿

面向家庭使用的英语词汇初筛工具，包含分阶段词库、词组浏览、自动发音、学习统计和家长后台。

## 技术栈

- Next.js App Router
- React + TypeScript
- SQLite
- Docker Compose

项目使用两套物理隔离的 SQLite 数据库：词库随应用版本只读发布，学习记录单独持久化。多台设备共享同一份进度；浏览器本地存储不再作为数据源。

## Docker 启动

```bash
cp .env.example .env.local
# 编辑 .env.local，设置 ACCESS_CODE
docker compose up -d --build
```

默认由反向代理访问本机的 `127.0.0.1:3000`。完整云主机部署、HTTPS 和数据库备份说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 本地开发

需要 Node.js `>=22.13.0`：

```bash
npm install
npm run dev
```

启动开发服务器前会把 `app/data/vocabulary.json` 构建成只读的 `data/vocabulary.db`；学习数据默认写入 `data/learning.db`。`data/` 已被 Git 忽略。

仅重新生成词库数据库：

```bash
npm run vocab:db
```

命令会输出保留、新增和删除的稳定单词 ID 数量，便于更新词库前检查与既有学习记录的兼容性。

检查代码：

```bash
npm run lint
npm test
```
