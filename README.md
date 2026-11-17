# NexusOps 智能运营协同系统

NexusOps 智能运营协同系统（Python 后端 + Vue 前端）。

## 目录结构

- `NexusOps/`：Python 后端服务（FastAPI、多路意图识别、Agent 编排、RAG 知识库、Skills 与 MCP 扩展、记忆管理与评测监控），详见 [NexusOps/README.md](NexusOps/README.md)
- `NexusOpsFrontend/`：Vue 3 前端界面与全栈 Docker Compose 编排，详见 [NexusOpsFrontend/README.md](NexusOpsFrontend/README.md)
- `DEPLOY.md`：Windows + Docker Desktop 本地部署手册，详见 [DEPLOY.md](DEPLOY.md)

## 快速开始

1. 复制环境变量模板并填写模型 API Key：

   ```bash
   cp NexusOps/.env.example NexusOps/.env
   ```

2. 使用 Docker Compose 启动全栈服务：

   ```bash
   cd NexusOpsFrontend
   docker compose --env-file ../NexusOps/.env up -d --build
   ```

3. 更多说明请参考 [DEPLOY.md](DEPLOY.md) 与 [NexusOps/README.md](NexusOps/README.md)。
