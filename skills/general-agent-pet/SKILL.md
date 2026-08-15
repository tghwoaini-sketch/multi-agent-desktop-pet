---
name: general-agent-pet
description: 通用 Agent 桌宠状态助手：把 Codex、WorkBuddy 等 Agent 的当前任务、等待确认、失败和完成状态，稳定地映射到桌面宠物气泡中。
---

# 通用 Agent 桌宠

这个 Skill 用来把多个 Agent 的工作状态变成一个低打扰的桌面提醒层。它的目标不是替代 Agent 界面，而是让用户不用切换窗口，也能一眼知道“现在有哪些任务在运行、哪个任务需要我、哪些任务刚完成”。

## 快速开始

1. 安装 Node.js `>=22.13.0` 和 OpenPets v0.7.2。
2. 克隆本仓库并安装依赖：

   ```bash
   git clone https://github.com/tghwoaini-sketch/multi-agent-desktop-pet.git
   cd multi-agent-desktop-pet
   npm install
   ```

3. 先启动 OpenPets，再运行 `npm run desk`。
4. 只接入单个 Agent 时，可分别运行 `npm run codex:bridge` 或 `npm run workbuddy:bridge`。
5. 第一次点击气泡无法切换到 Agent 桌面时，运行 `scripts/install-task-handoff.command`。

完整的首次安装、验证和示例见 [references/examples.md](references/examples.md)；遇到问题先看 [references/troubleshooting.md](references/troubleshooting.md)。

## 能力边界

- 显示每个 Agent 当前正在处理的任务标题。
- 区分 `运行中`、`等待你确认`、`已完成`、`失败` 和 `已暂停`。
- 同一个任务必须复用稳定的 `threadId` 更新，不得因为轮询或重复事件创建新的气泡。
- 每个 Agent 最多保留 5 个当前任务；超出时只保留最近更新的任务。
- 完成任务先变为可点击的完成气泡，用户点击后才清理，避免“完成了但没有被看见”。
- 点击气泡时，优先切换到该 Agent 所在的桌面或窗口；不要把本地跳转协议改成普通网页链接。
- 没有桌宠底座时，仍输出同样的文字状态，不阻塞 Agent 工作。

## 状态判定原则

状态必须来自 Agent 的真实事件或可验证的会话状态，不根据时间长短猜测：

1. 有明确执行事件且会话仍活跃：`运行中`。
2. Agent 发出问题、请求确认、等待用户输入或工具授权：`等待你确认`。
3. 会话明确结束并返回成功：`已完成`。
4. 会话明确报错、被中止或无法继续：`失败`。
5. 用户主动关闭实时桥接：`已暂停`，不得把它伪装成完成。

如果事件来源暂时不可达，应保留上一次状态并显示“连接暂时不可用”，不能把任务误报成完成。

## 事件更新协议

每条状态事件至少包含：

```json
{
  "agent": "Codex",
  "threadId": "stable-session-id",
  "title": "正在处理的任务标题",
  "status": "running",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

推荐的 `status` 值为：`running`、`waiting_user`、`completed`、`failed`、`paused`。

更新规则：

- 用 `agent + threadId` 作为去重键。
- 标题取 Agent 最近一条有效任务描述，清理过长内容和无意义的内部 ID。
- 重复事件只更新状态和时间，不新增气泡。
- 完成事件不自动删除；只有用户点击完成气泡才执行清理。
- 桥接断线、重启或电脑休眠后，恢复连接应先发送当前快照，再继续接收增量事件。

## 桌宠依赖

桌宠显示层是可选的。需要原生桌宠时，安装 OpenPets 并运行本仓库中的本地桥接；桥接只处理任务状态，不上传任务内容、Cookie、令牌、日志或本地数据库。

本 Skill 对应的完整实现、恢复脚本和 OpenPets 补丁位于仓库根目录。换电脑时应先阅读根目录 README 和 `docs/handoff-package.md`，再按实际安装路径配置，不要直接复制原电脑的绝对路径。

## 安全约束

- 不读取或上传 API Key、Cookie、密码、完整会话记录和本地数据库。
- 不自动安装系统程序；安装 OpenPets、启动项或协议处理器前必须由用户明确执行。
- 不生成任意外部跳转链接；任务跳转只允许经过已注册的本机 Agent 桌面协议。
- 不把任务标题中的敏感信息扩散到第三方服务。

## 没有桌宠时的降级输出

如果 OpenPets 或本地桥接不可用，直接返回一份简洁任务快照：Agent、任务标题、状态、最近更新时间和下一步需要用户做什么。恢复桌宠后，再按稳定 `threadId` 同步，不重复创建历史气泡。
