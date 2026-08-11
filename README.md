# 小步修仙任务看板

把每日任务、每周目标、长期目标和复杂工作流程组织成一套修仙成长系统。项目包含工作洞府、分步任务执行、技巧阁、愿望奖励以及本地持久化。

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

当前 Mac 上的后台桥接由 `com.xiaobu.taskboard` 启动项守护。它通过纯英文路径 `/Users/Admin/xiaobu-taskboard` 访问本仓库，避免 macOS `launchd` 在中文路径下启动失败。仓库内保留了 `scripts/xiaobu-taskboard-bridge.sh` 和 `scripts/com.xiaobu.taskboard.plist` 两个恢复文件。暂停/恢复状态保存在 `~/.config/openpets/xiaobu-codex-control.json`，重启电脑后不会自行改变。

WorkBuddy 由独立的 `com.xiaobu.workbuddy-pet` 桥接守护。它只读监听 `~/.workbuddy/projects` 中的本地会话事件，以 WorkBuddy 会话 UUID 作为 OpenPets 固定 `threadId`，自动提取最近一条有效任务标题，并识别执行、等待用户、失败和完成。完成任务会变成绿色完成气泡并继续挂载；点击后才清理并切换到 WorkBuddy。Codex 使用相同的完成确认逻辑，两边合计各自最多显示 5 个任务，并共用同一个暂停状态。

## 换一台电脑恢复

1. 安装 Node.js、Codex 和 OpenPets，登录拥有本私有仓库权限的 GitHub 账号。
2. 在 GitHub Desktop 中选择 **Clone Repository**，把仓库克隆到新电脑。
3. 在项目目录运行 `npm install`。
4. 普通网页模式运行 `npm run dev`；需要桌宠联动时运行 `npm run desk` 或双击启动脚本。
5. 导入最近一次任务数据备份；代码仓库不包含本地任务数据库。

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

## 常用检查

```bash
npm run build
npm test
```

数据库结构发生变化后可运行：

```bash
npm run db:generate
```
