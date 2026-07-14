# Issue Tracker: Local Markdown

本仓库的规格和任务使用 `.scratch/` 下的本地 Markdown 文件管理，不发布到公开 GitHub Issues。

## Conventions

- 每个功能使用一个目录：`.scratch/<feature-slug>/`。
- 功能规格保存为 `.scratch/<feature-slug>/spec.md`。
- 实施任务分别保存为 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号，不使用单个合并任务文件。
- 每个任务文件顶部附近使用 `Status:` 记录 triage 状态，状态词见 `triage-labels.md`。
- 评论和讨论记录追加到文件底部的 `## Comments`。

## Publishing

当 Skill 要求“发布到任务跟踪器”时，在 `.scratch/<feature-slug>/` 下创建对应文件和目录。

当 Skill 要求“读取相关任务”时，读取用户提供的任务路径或编号对应的文件。

## Wayfinding

`wayfinder` 使用一个地图文件和多个子任务文件：

- 地图：`.scratch/<effort>/map.md`。
- 子任务：`.scratch/<effort>/issues/<NN>-<slug>.md`。
- 子任务顶部使用 `Type:` 记录 `research`、`prototype`、`grilling` 或 `task`。
- 使用 `Status:` 记录 `claimed` 或 `resolved`。
- 使用 `Blocked by: NN, NN` 声明依赖；只有依赖全部解决后任务才可领取。
- 领取任务时先写入 `Status: claimed`；完成后追加 `## Answer`，改为 `Status: resolved`，并把结论摘要和链接写回地图。
