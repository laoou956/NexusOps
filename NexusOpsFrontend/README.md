# NexusOps Frontend

NexusOps 的 Vue 3 前端界面，对接 NexusOps Python 后端。

项目目录：

```text
./NexusOpsFrontend
```

## 功能

- 支持聊天调试、健康检查、监控摘要、知识库检索、知识库文档导入、文件上传与评测运行。
- 支持 Docker + Nginx 部署。

## 默认后端地址

- Python 后端默认地址：`http://localhost:8000`

开发模式下，Vite 会将 `/api/python` 代理到 `http://localhost:8000`。

Docker 模式下，Nginx 会通过运行时注入的地址访问后端。

## 本地运行

安装依赖：

```bash
npm install
```

启动：

```bash
npm run dev
```

访问：

```text
http://localhost:5173
```

如果后端端口不是默认值，可以启动时覆盖：

```bash
VITE_PYTHON_API_URL=http://localhost:8000 npm run dev
```

## Docker 部署

先配置 `../NexusOps/.env`，再启动完整服务：

```bash
docker compose --env-file ../NexusOps/.env up -d --build
```

前提是 `NexusOpsFrontend` 的父目录下有 `../NexusOps` 目录。

访问前端：

```text
http://localhost:8088
```

停止：

```bash
docker compose down
```
