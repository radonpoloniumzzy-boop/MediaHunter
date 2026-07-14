# 多平台账号孵化系统 MVP

阶段 1 交付范围：

- 信息源与采集任务壳
- 赛道评分与关键词库
- 对标账号库
- 爆款内容库
- 评论需求库
- 中央选题库
- CSV / XLSX 导出
- 本地规则建议器，不依赖真实模型 Key

本阶段不做自动发布、自动评论、自动私信、真实平台爬虫、PDF 报告或完整视频生成。

## 技术栈

- `apps/api`: Fastify API、Postgres schema、孵化系统服务
- `apps/web`: React/Vite 后台控制台
- `packages/workflow`: 保留原工作流包，兼容旧测试
- `packages/rag`: 保留原检索包，兼容旧测试

## 本地启动

从项目目录运行：

```powershell
.\pnpmw.cmd install
.\pnpmw.cmd local:postgres
.\pnpmw.cmd local:api
.\pnpmw.cmd local:web
```

默认地址：

- Web: `http://localhost:5173`
- API: `http://localhost:3001/api`

默认账号：

- 用户名：`admin`
- 密码：`Changeme123!`

## 验证

```powershell
.\pnpmw.cmd test
.\pnpmw.cmd typecheck
.\pnpmw.cmd build
```

## 合规边界

- 系统只处理公开信息或授权数据。
- 自动化任务必须低频、可暂停、可审计。
- 平台账号 Cookie / Token 不在前端暴露。
- AI 只提供建议，不直接发布内容。
- 开源项目仅作能力参考，接入前需单独审查许可证和平台规则。

