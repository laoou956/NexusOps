# NexusOps 本地部署手册（Windows + Docker Desktop）

> 本机实测环境：Docker 29.x / Compose v2 / 项目位于 `E:\echo`。
> 两个 Compose 项目**容器名与端口重叠，只能跑一套**。

## 0. 前置检查

```powershell
# 1) 启动 Docker Desktop，等托盘图标变绿后确认
docker info --format '{{.ServerVersion}}'

# 2) 确认项目目录结构（前端 compose 里使用相对路径 ../NexusOps）
#    NexusOps/           Python 后端（.env 在这里）
#    NexusOpsFrontend/   Vue 前端 + 全栈 compose
```

目录名不能随便改：Compose 项目名取自目录名（`NexusOpsFrontend` → `nexusopsfrontend`），改名会生成新的数据卷，旧数据不会自动迁移。

## 1. 准备 .env

在 `E:\echo\NexusOps\.env`（首次可 `Copy-Item .env.example .env`）：

```dotenv
# 模型服务（三选一：DeepSeek 官方 / 阿里云百炼代理 / Anthropic）
ANTHROPIC_BASE_URL=https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_AUTH_TOKEN=sk-...          # 仅百炼代理需要（Bearer 头）
ANTHROPIC_MODEL=deepseek-v4.1-flash

# 基础
NEXUSOPS_ENV=development             # 本地演示：不需要访问 Token
REDIS_PASSWORD=nexusops123
CHROMA_HOST=chromadb
CHROMA_PORT=8000
CHROMA_PERSIST_DIRECTORY=/app/data/chroma
NEXUSOPS_SEED_DEMO_DOCS=true

# 意图向量（可选，不填则用本地 n-gram）
INTENT_EMBEDDING_PROVIDER=auto
SILICONFLOW_API_KEY=

# 超时（百炼这类慢网关要放宽；聊天总预算固定 50s）
NEXUSOPS_INTENT_TIMEOUT_S=12
NEXUSOPS_LLM_TIMEOUT_S=25
NEXUSOPS_COMPOSER_TIMEOUT_S=8
```

## 2. 选一种部署模式

### 模式 A：全栈（页面 + Python API）— 推荐

```powershell
cd E:\echo\NexusOpsFrontend
docker compose --env-file ../NexusOps/.env up -d --build
```

`--env-file` 让 Compose 插值拿到 `REDIS_PASSWORD`，`env_file` 让 python 容器读取同一份 `.env`。

### 模式 B：纯后端（只有 Swagger，没有页面）

```powershell
cd E:\echo\NexusOps
docker compose up -d --build
```

**切换模式前必须先停掉另一套**，否则报 `Conflict. The container name "/nexusops-chromadb" is already in use`：

```powershell
# 停全栈
cd E:\echo\NexusOpsFrontend; docker compose down
# 或停纯后端
cd E:\echo\NexusOps; docker compose down
```

## 3. 端口对照

| 端口 | 归属 | 说明 |
|---|---|---|
| 8000 | python API | 两套都用；Swagger `/docs` |
| 8001 | ChromaDB | |
| 5174 | 前端页面 | 直连打开页面；后端请求走网关前缀 `/api/python` |
| 8088 | 网关 nginx | 原设计是 80，本机被 IIS(W3SVC) 占用故改 8088 |
| 6379 | Redis | 仅纯后端模式映射到宿主 |
| 9090 | Prometheus | 仅纯后端模式 |

日常访问：**http://localhost:8088**（页面 + `/api/python` 全通）。
`http://localhost:5174` 能打开页面，但它只把 `/api/` 裸转发到 8000，`/api/python/...` 会 404 —— 想让它也能用，需给前端 nginx 加 rewrite。

## 4. 验证（4 步）

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8088/                   # 200
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8088/api/python/health   # 200
curl.exe -s http://localhost:8000/knowledge/stats                               # 片段数
curl.exe -s http://localhost:8000/integrations/embedding                        # online_configured
```

最后在 http://localhost:8088 里发一条消息，响应 `status=success` 即闭环；`/monitor` 可看路由与工具统计。

## 5. 改完东西怎么生效

| 改动 | 命令 |
|---|---|
| 只改 `.env` | `docker compose --env-file ../NexusOps/.env up -d --force-recreate nexusops-python` 然后 **再重建 nginx** |
| 改 Python 代码 | `docker compose --env-file ../NexusOps/.env up -d --build nexusops-python` + 重建 nginx |
| 改前端源码 | `docker compose --env-file ../NexusOps/.env up -d --build frontend` |
| 改 `docker/nginx.conf` | 必须 `--build`（配置是 COPY 进镜像的） |
| 改 `docker/nginx-gateway.conf` | 挂载进去的，`up -d --force-recreate nginx` 即可 |
| 改 Skills / mcp_servers.json | `curl -X POST http://localhost:8000/skills/reload`，或重建 python |

`restart` **不会**重新读取 `.env`，一定要 `--force-recreate`。

## 6. 踩过的坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `Conflict ... container name already in use` | 两套 Compose 用了相同 container_name | 只跑一套，先 `down` 另一套 |
| nginx 起不来 `bind: forbidden` / 端口占用 | 80 被 IIS 占用 | 网关映射改 8088 |
| 8000 被占 | attu / Milvus 等其它项目 | `docker stop attu` 或改端口 |
| 8088 返回 **502** | 上游容器重建后 IP 变了，nginx 启动时只解析一次 | `docker compose ... up -d --force-recreate nginx` |
| 前端容器反复重启 | nginx 配置写错（如 `proxy_read_timeout` 重复） | `docker logs nexusops-frontend` 看 emerg |
| `/chat` 503 + 日志 `402 Insufficient Balance` | 模型账户没余额 | 换 Key 或充值 |
| `/chat` 504「超过 50 秒」 | 网关慢 / 模型慢 | 换 flash 类模型，或调大 `NEXUSOPS_LLM_TIMEOUT_S`（≤50s 总预算） |
| 改了 `.env` 不生效 | 用了 `restart` | `--force-recreate` |
| `docker compose` 报 daemon 连接失败 | Docker Desktop 没启动 | 先启动 Docker Desktop |

## 7. 停止与数据

```powershell
cd E:\echo\NexusOpsFrontend
docker compose down        # 停容器，保留数据卷（Redis 会话 / Chroma 知识库）
docker compose down -v     # 连数据一起删，慎用
```

数据位置：命名卷 `nexusopsfrontend_redis-data`、`nexusopsfrontend_chromadb-data`；纯后端模式是 `nexusops_redis-data` 等，两套数据互不相通。