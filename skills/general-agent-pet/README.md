# 通用 Agent 桌宠 Skill

这是本仓库可被 SkillHub 从 GitHub 导入的 Skill 入口。

它把 Codex、WorkBuddy 等 Agent 的任务状态同步到桌面宠物：运行中显示当前任务标题，等待用户时突出提醒，完成后保留完成气泡直到用户点击确认。原生桌宠显示是可选层；没有安装 OpenPets 时，Agent 仍可使用文字状态降级模式。

完整源码、桥接程序、恢复脚本和 OpenPets 补丁请看仓库根目录：

- `README.md`
- `docs/handoff-package.md`
- `patches/openpets-v0.7.2-current-task-board/`
- `scripts/`

本 Skill 不包含任何用户任务、令牌、Cookie、运行日志或本机数据库。
