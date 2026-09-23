# 认词簿云主机部署

项目使用标准 Next.js、两套 SQLite 数据库和单个 Docker 容器。词库数据库随镜像只读发布；学习结果、每日打卡和设置保存在独立的 Docker 持久化卷中，所有已登录设备共享同一份数据。

## 服务器要求

- 一台 Linux 云主机
- Git
- Docker Engine 和 Docker Compose
- 一个域名，推荐使用 Caddy 或 Nginx 配置 HTTPS

## 1. 下载代码

```bash
git clone https://github.com/honorwu/learnabc.git
cd learnabc
```

## 2. 配置访问码

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```text
ACCESS_CODE=<请替换为私有访问码>
APP_TIME_ZONE=Asia/Shanghai
```

`.env.local` 不会提交到 Git，也不会进入 Docker 镜像。真实访问码只保存在云主机的 `.env.local` 或密钥管理服务中，不要写入代码、公开文档或 Git 提交。

## 3. 启动

```bash
docker compose up -d --build
```

服务默认监听云主机本地的 `127.0.0.1:3000`，不会绕过 HTTPS 直接暴露到公网。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f --tail=100
```

## 4. 配置 HTTPS

推荐在云主机安装 Caddy。最小配置示例：

```text
你的域名 {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy 会自动申请和续期 HTTPS 证书。使用其他服务器面板或 Nginx 时，同样把请求反向代理到 `127.0.0.1:3000`，并保留 `X-Forwarded-Proto` 请求头。

## 两套数据库

| 数据库 | 容器内路径 | 模式 | 生命周期 |
| --- | --- | --- | --- |
| 词库 | `/app/data/vocabulary.db` | 只读 | 构建镜像时从 JSON 生成，随版本更新 |
| 学习记录 | `/data/learning.db` | 读写 | 由 `learnabc-data` 卷持久保存 |

两套数据库没有跨库外键。学习记录只保存稳定的 `word_id`，因此替换词库镜像不会重建或覆盖学习数据库。执行以下命令不会丢失学习记录：

```bash
docker compose up -d --build
docker compose restart
docker compose down
```

不要执行 `docker compose down -v`，其中 `-v` 会删除数据库卷。

### 备份

为了获得一致的数据库备份，先短暂停止应用：

```bash
docker compose stop
docker run --rm -v learnabc-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/learnabc-data.tar.gz -C /data .
docker compose start
```

把生成的 `learnabc-data.tar.gz` 下载到其他位置保存。词库数据库不需要单独备份，可由当前代码和镜像重新生成。

### 恢复

```bash
docker compose stop
docker run --rm -v learnabc-data:/data -v "$PWD:/backup" alpine \
  sh -c "rm -f /data/* && tar xzf /backup/learnabc-data.tar.gz -C /data"
docker compose start
```

恢复操作会覆盖当前数据库，应先另外备份一次。

## 更新版本

```bash
git pull
docker compose up -d --build
```

构建时会执行 `npm run vocab:db`，生成新的只读词库数据库，并报告保留、新增和删除的单词 ID。数据卷不会因为重新构建镜像而被删除，已有学习记录仍在 `/data/learning.db` 中。

如果报告出现删除的 ID，对应的历史记录仍会保留在学习数据库中，但不会出现在当前版本的学习与统计页面。恢复同一 ID 后，原记录会重新生效。因此更新词库时应尽量保持已有单词 ID 稳定。

## 修改访问码

修改 `.env.local` 后执行：

```bash
docker compose up -d
```

旧登录 Cookie 会失效，所有设备需要重新输入访问码。

## 部署后检查

1. 未登录访问首页时自动跳转到 `/login`。
2. 错误访问码无法登录。
3. 正确访问码可以进入认词簿。
4. 判断一个单词后，在另一台已登录设备打开 `/admin` 能看到进度。
5. 重启容器后，学习记录仍然存在。
6. 浏览器地址栏显示 HTTPS。

## 架构说明

- `app/data/vocabulary.json` 只作为词库构建源，应用运行时不读取 JSON。
- `vocabulary.db` 保存词条、阶段、来源、词频、难度和词组分类，运行时以只读方式打开。
- `learning.db` 只保存识词结果、尝试次数、每日打卡和学习设置，不保存词条正文。
- SQLite 使用 WAL 模式，适合当前单台云主机、单容器的家庭使用场景。
- 登录失败次数限制保存在进程内，容器重启后会重新计数。
