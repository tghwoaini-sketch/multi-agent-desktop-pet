# 交接包：小步修仙 × OpenPets

## 一句话定位

这是一个基于 OpenPets 的 macOS 个人任务状态系统：任务真相来自 Codex / WorkBuddy，本项目负责读取、归一化并通过 OpenPets 的固定线程气泡展示。

源码仓库：<https://github.com/tghwoaini-sketch/multi-agent-desktop-pet>

## 先理解系统边界

```text
Codex / WorkBuddy 本地任务状态
            ↓
本仓库的 task bridge
            ↓
OpenPets IPC / CLI
            ↓
OpenPets 桌宠与原生小气泡
```

OpenPets 是桌宠底座，本仓库不是它的替代实现。朋友需要先安装 OpenPets，再使用本项目的桥接代码。

## 需要安装的东西

1. macOS。
2. Node.js `>=22.13.0`。
3. Codex 或 WorkBuddy；需要接入哪一个就配置哪一个。
4. OpenPets v0.7.2：
   <https://github.com/alterhq/openpets/releases/download/v0.7.2/OpenPets-0.7.2.dmg>
5. 本仓库：

   ```bash
   git clone https://github.com/tghwoaini-sketch/multi-agent-desktop-pet.git
   cd multi-agent-desktop-pet
   npm install
   ```

## 功能分层

### 直接可用的项目功能

- Codex / WorkBuddy 任务桥接。
- 每个任务固定一个 OpenPets `threadId`，更新不会新增气泡。
- 最多挂载 5 个任务。
- 运行、等待、需要介入、失败、完成状态映射。
- 完成后继续挂载，点击完成气泡后才清除。
- 点击任务后通过本机协议切换到对应 Agent 桌面。

### OpenPets 原生气泡定制

原版 OpenPets 的气泡尺寸、位置、按钮和完成勾选保持不变；本项目只把运行状态右上角的转圈替换成当前桌宠的微型跑动帧。

这部分需要基于 OpenPets v0.7.2 源码重新编译，记录在：

- `patches/openpets-v0.7.2-running-pet.patch`
- `docs/openpets-native-bubble-patch.md`

如果暂时不编译补丁，项目仍可使用 OpenPets 原生转圈气泡，任务桥接逻辑不受影响。

## 推荐恢复顺序

1. 先单独启动 OpenPets，确认桌宠能显示。
2. 运行 `npm run dev`，确认看板接口正常。
3. 运行 `npm run desk`，确认 Codex 桥接能启动。
4. 如使用 WorkBuddy，再安装 `com.xiaobu.workbuddy-pet` 启动项并确认本机 `~/.workbuddy/projects` 存在。
5. 首次使用任务点击跳转时，运行 `scripts/install-task-handoff.command`。
6. 用一个测试任务验证：运行 → 更新 → 完成 → 点击收起。

不要先恢复 launchd。仓库里的 plist 仍带有原作者电脑的路径示例，换电脑必须先修改路径和日志位置。

## 核心代码入口

- `scripts/codex-task-bridge.mjs`：Codex 状态读取、状态映射和 OpenPets 通知。
- `scripts/workbuddy-task-bridge.mjs`：WorkBuddy 本地会话读取和 OpenPets 通知。
- `scripts/XiaobuTaskHandoff.swift`：`xiaobu-task://` 点击跳转协议。
- `scripts/com.xiaobu.taskboard.plist`：Codex 桥接 launchd 示例。
- `scripts/com.xiaobu.workbuddy-pet.plist`：WorkBuddy 桥接 launchd 示例。
- `patches/openpets-v0.7.2-running-pet.patch`：OpenPets 原生气泡补丁。

## 状态原则

- Agent 的任务源是唯一事实来源，桌宠只负责展示。
- 任务状态变化时更新同一 `threadId`，不创建新气泡。
- “本轮完成、等待下一条指令”必须结合任务是否真正完成判断，不能一律当成等待。
- 完成状态不能自动变回运行或等待。
- 完成气泡保留到用户点击，不用 TTL 自动消失。
- 运行中的小桌宠只是活跃信号，不代表可计算的百分比进度。

## 已知限制

- 这是个人环境定制版，不是通用安装器。
- 目前主要验证环境是 macOS + OpenPets v0.7.2。
- Codex 和 WorkBuddy 的本地数据路径因电脑而异。
- 项目不上传任务数据库、Agent 会话、OpenPets 线程状态或个人配置。
- 原生气泡补丁依赖 OpenPets 具体版本，升级 OpenPets 后需要重新检查并重新编译。

## 最小验收清单

- [ ] OpenPets 桌宠能单独启动。
- [ ] 一个运行中的任务只出现一个气泡。
- [ ] 同一任务更新不会新增气泡。
- [ ] 完成后显示绿色完成状态并保持挂载。
- [ ] 点击完成气泡后才消失，并切换到对应 Agent 桌面。
- [ ] 重启桥接后不会把已完成任务复活成等待状态。
- [ ] 同时任务数量不超过 5 个。
