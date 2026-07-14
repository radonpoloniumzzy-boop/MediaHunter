# Domain Docs

本项目采用单领域上下文。工程 Skills 在探索和修改代码前，应先读取与工作相关的领域文档。

## Required Reading

- 根目录 `CONTEXT.md`：项目统一领域词汇。
- 根目录 `docs/adr/`：与当前工作相关的架构决策。

文件不存在时继续工作，不需要提前创建；`domain-modeling` 会在术语或决策真正形成时按需创建。

## Layout

```text
/
|-- CONTEXT.md
|-- docs/
|   `-- adr/
|       |-- 0001-*.md
|       `-- 0002-*.md
|-- apps/
`-- packages/
```

`apps/` 和 `packages/` 当前是技术模块，共享根级领域上下文，不各自维护独立词汇表。

## Vocabulary

规格、任务、设计、测试名称和用户界面涉及领域概念时，使用 `CONTEXT.md` 定义的标准术语，避免使用其中明确列出的同义词。

如果需要的概念不在词汇表中，先判断它是否只是通用技术词；只有真实领域缺口才进入 `domain-modeling`。

## ADR Conflicts

任何方案如果与现有 ADR 冲突，必须明确指出冲突和重新讨论的理由，不得静默覆盖已有决策。
