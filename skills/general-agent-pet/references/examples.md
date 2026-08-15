# 使用示例

## 示例一：只接入 Codex

```bash
cd multi-agent-desktop-pet
npm install
npm run desk
```

看到 OpenPets 桌宠后，在 Codex 中开始一个任务。桥接会把任务标题和状态同步到气泡：

```text
Codex · 制作产品说明书
检测到 Codex 正在执行
```

如果 Codex 需要用户确认，气泡应变为：

```text
Codex · 制作产品说明书
需要你的回复才能继续
```

## 示例二：接入 WorkBuddy

WorkBuddy 的本地项目状态由独立桥接读取。先确认 WorkBuddy 已经运行并产生本机会话，再启动：

```bash
npm run workbuddy:bridge
```

预期显示：

```text
WorkBuddy · 整理电脑文件
WorkBuddy 正在处理
```

桥接读取的是任务状态，不是把完整会话内容上传到第三方。

## 示例三：完成任务后的行为

完成事件：

```json
{
  "agent": "Codex",
  "threadId": "codex-task-019feebe",
  "title": "制作产品说明书",
  "status": "completed",
  "updatedAt": "2026-08-15T10:00:00+08:00"
}
```

桌宠显示绿色完成气泡，并保留：

```text
Codex · 制作产品说明书
任务已完成，点击查看并收起
```

只有用户点击完成气泡后，它才会被清理。重复收到同一个 `threadId` 的完成事件，不得生成第二个气泡。

## 示例四：等待用户确认与恢复

等待确认：

```json
{
  "agent": "WorkBuddy",
  "threadId": "workbuddy-session-42",
  "title": "整理电脑文件",
  "status": "waiting_user",
  "updatedAt": "2026-08-15T10:03:00+08:00"
}
```

用户完成确认后，桥接应继续更新原来的 `threadId`，而不是新建任务。电脑重启后，先恢复 OpenPets 和桥接，再发送当前快照；已完成任务不会自动复活成运行中。

## 环境路径不同怎么办

如果 OpenPets 不在默认位置，可以覆盖 CLI 路径：

```bash
XIAOBU_OPENPETS_CLI="/你的路径/OpenPets.app/Contents/MacOS/openpets-cli" npm run codex:bridge
```

WorkBuddy 数据目录也可以覆盖：

```bash
XIAOBU_WORKBUDDY_ROOT="/你的路径/.workbuddy" npm run workbuddy:bridge
```

不要把包含个人路径、任务内容、Cookie 或令牌的配置文件提交到 GitHub。
