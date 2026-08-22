# 多agent通用桌宠 · 小步修仙 × OpenPets 任务系统

公开源码仓库：<https://github.com/tghwoaini-sketch/multi-agent-desktop-pet>

这是一个基于 OpenPets 的个人定制项目，当前处于“可运行、半成熟、仍需按本机环境配置”的阶段。它不是 OpenPets 的替代品，而是把 Codex / WorkBuddy / Qoder CN 的任务状态接入 OpenPets，并保留一部分原看板能力。

## SkillHub 导入入口

仓库内的 [`skills/general-agent-pet/`](skills/general-agent-pet/) 是可从 GitHub 导入的通用 Agent 桌宠 Skill。它把桌宠作为可选显示层：原生 OpenPets 不可用时仍可用文字状态，不会把安装依赖误认为 Skill 本身已经运行。

把每日任务、每周目标、长期目标和复杂工作流程组织成一套修仙成长系统。项目包含工作洞府、分步任务执行、技巧阁、愿望奖励以及本地持久化。

## 交接入口

给其他 Agent 或协作者阅读时，先看 [交接包说明](docs/handoff-package.md)。其中写明了系统边界、依赖、恢复顺序、已知问题和验收标准。

桌宠底座使用：

- [OpenPets 主项目](https://github.com/alterhq/openpets)
- [OpenPets v0.7.2 macOS 安装包](https://github.com/alterhq/openpets/releases/download/v0.7.2/OpenPets-0.7.2.dmg)
- [OpenPetsKit 底层库](https://github.com/alterhq/OpenPetsKit)

本仓库保存的是桥接代码、任务看板代码、恢复脚本和 OpenPets 原生气泡补丁记录；不包含 OpenPets 官方二进制，也不包含本机任务数据。

## 在当前电脑运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

如果要恢复 Codex + OpenPets 桌宠联动（macOS），运行：

```bash
npm install
npm run desk
```

也可以双击 `scripts/启动小步修仙任务看板.command`。它会分别检查网页服务和 Codex 桥接；即使网页还在、桥接已停止，也会自动补启动桥接，并打开 OpenPets。桌面上的同名快捷方式使用同一套逻辑。

桥接默认连接 `/Applications/OpenPets.app/Contents/MacOS/openpets-cli`，如安装位置不同，可通过 `XIAOBU_OPENPETS_CLI` 覆盖。

当前 Mac 上的后台桥接由 `com.xiaobu.taskboard` 启动项守护。仓库内保留了启动项和恢复脚本；其中部分脚本包含原作者电脑的示例路径，换电脑时必须把路径改成新电脑的实际路径，不能直接照搬 `launchd` plist。

WorkBuddy 由独立的 `com.xiaobu.workbuddy-pet` 桥接守护。它只读监听 `~/.workbuddy/projects` 中的本地会话事件，以 WorkBuddy 会话 UUID 作为 OpenPets 固定 `threadId`，自动提取最近一条有效任务标题，并识别执行、等待用户、失败和完成。Qoder CN 由 `com.xiaobu.qodercn-pet` 桥接守护，只读读取 Qoder CN 的本地 SQLite 会话状态，以会话 ID 作为固定 `threadId`，只接入最近且仍在运行的任务，避免历史任务重新冒泡。完成任务会变成绿色完成气泡并继续挂载；点击后才清理并切换到对应 Agent。三者最多各显示 5 个任务，并共用同一个暂停状态。

## 换一台电脑恢复

1. 安装 Node.js、Codex 和 OpenPets。OpenPets 是必须的桌宠运行底座。
2. 直接克隆公开仓库，不需要 GitHub 登录：

   ```bash
   git clone https://github.com/tghwoaini-sketch/multi-agent-desktop-pet.git
   cd multi-agent-desktop-pet
   ```

3. 在项目目录运行 `npm install`。
4. 普通网页模式运行 `npm run dev`；需要桌宠联动时运行 `npm run desk` 或双击启动脚本。
5. 按 [交接包说明](docs/handoff-package.md) 配置 Codex / WorkBuddy 桥接和 macOS 启动项。
6. 导入任务数据备份；代码仓库不包含任何本地任务数据库。

## 当前定制功能

- Codex 与 WorkBuddy 任务状态桥接到 OpenPets。
- 同一任务复用同一 `threadId`，避免气泡越积越多。
- 完成任务保持绿色完成气泡，点击后清理并永久记住该任务 ID；状态抖动、重启或历史数据回流都不会再次生成气泡。
- 点击任务通过本机 `xiaobu-task://` 协议切换到对应 Agent 桌面。
- OpenPets 原生气泡的运行指示器可替换成当前桌宠的微型跑动帧。

最后一项是对 OpenPets v0.7.2 源码的定制补丁，不是 npm 安装后自动出现的功能。补丁记录见 [原生气泡补丁说明](docs/openpets-native-bubble-patch.md)。

## 版本保护规则

- `main` 始终作为可正常运行的稳定版本。
- 每完成一组功能后提交一次，提交前运行 `npm run build`。
- 重要稳定节点使用 `v0.1.0`、`v0.2.0` 这类标签标记。
- 已经推送的错误修改优先使用 `git revert` 撤销，保留完整历史。
- 开发高风险功能时先建立功能分支，确认构建通过后再合并到 `main`。

## 数据与隐私

GitHub 仓库保存网页代码、界面素材、数据库结构和版本历史，但不会上传：

- `.env` 环境变量
- `.wrangler` 本地 D1 数据库
- `logs` 运行日志
- `tmp` 临时图片和生成文件

因此 GitHub 可以恢复程序和桌宠桥接代码，却不能单独恢复任务、技巧、奖励和每日记录。运行数据需要通过看板的数据导出功能另行备份；OpenPets 的本机线程状态也不会上传，会在桥接重新运行后重新建立。

本仓库已公开。提交新内容前，确认没有把 `.env`、令牌、Cookie、个人任务数据、运行日志或本机数据库加入 Git。

## 常用检查

```bash
npm run build
npm test
```

数据库结构发生变化后可运行：

```bash
npm run db:generate
```
### 桌宠任务点击跳转

首次在一台 Mac 上恢复项目时，先双击或执行 `scripts/install-task-handoff.command`。它会注册 `xiaobu-task://` 原生协议，让 OpenPets 点击 Codex/WorkBuddy 气泡时直接激活对应桌面，不再打开浏览器页面。

### 交付与备份规则

任何已经在本机验证通过的功能改动，必须在交付前提交并推送至 `origin/main`。本地状态只有在 `git status --short --branch` 显示工作区干净且 `main...origin/main` 无领先或落后时，才算完成；GitHub 仓库是本项目的长期恢复来源。
