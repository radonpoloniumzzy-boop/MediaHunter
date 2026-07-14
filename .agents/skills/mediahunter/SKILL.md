---
name: mediahunter
description: 公众号内容情报统一入口。用于每日选题情报、每周运营方案和专项调研；当用户要求寻找对标公司、对标账号、参考文章、内容形式，或为一个客户项目规划公众号内容策略时使用。
---

# MediaHunter

以 MediaHunter 为唯一持久化数据源，不创建平行文章库或独立研究档案。

## 路由

- 专项调研：用户提到客户项目、对标公司、对标账号、品牌宣传、产品发布配套传播或内容方案时，进入 Project Brief 流程。
- 每日情报：用户询问今天写什么、近期选题或热点参考时，进入每日情报流程。
- 每周方案：用户要求周度复盘、下周排期或运营方案时，进入每周运营流程。
- 路由不明确时，只补问用户希望得到每日情报、每周方案还是专项调研。

## 专项调研流程

1. 将用户原始需求原样提交到 `POST /api/research-projects`，设置 `intake_source` 为 `skill`。
2. 展示系统整理后的 Project Brief。只询问响应中的 `open_questions`，不要自行扩大补问范围。
3. 每个答案单独提交到 `POST /api/research-projects/:id/answers`，保留逐项回答与版本记录。
4. 用户修改 Brief 时调用 `PUT /api/research-projects/:id/brief`，不要覆盖旧版本。
5. 没有关键缺口后，向用户展示完整 Brief 并取得明确确认，再调用 `POST /api/research-projects/:id/confirm`。
6. 只有项目状态为 `brief_confirmed` 时才能调用 `POST /api/research-projects/:id/start`。

不要把聊天中的默认同意视为 Brief 确认。未确认时不得启动发现、采集或分析。

## 兼容入口

`topic-research` 只作为每日情报的兼容入口，数据仍写入和读取 MediaHunter。
