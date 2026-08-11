# WorkBuddy 接入 OpenPets 桌宠：交接说明

## 目标

WorkBuddy 直接使用本机 OpenPets 桌面宠物展示任务状态。

桌宠是唯一主要展示入口，不要重新创建网页看板，也不要依赖已经退休的 `/desk` 页面。

## 已有环境

- OpenPets MCP：`http://127.0.0.1:3002/mcp`
- MCP 名称：`openpets`
- OpenPets CLI：`/Applications/OpenPets.app/Contents/MacOS/openpets-cli`
- 当前项目网页只保留工作区，不作为桌宠任务入口

优先使用已经注册好的 `openpets` MCP 工具；不要自行修改 MCP 配置。

## 任务同步规则

每个 WorkBuddy 任务必须对应一个独立的 OpenPets `threadId`，并在后续更新中复用同一个 `threadId`。

最多展示 5 个 WorkBuddy 任务，优先保留最近更新的任务。不要因为内部步骤变化就创建新气泡。

只在以下事件发生时调用 OpenPets：

1. 任务开始；
2. 状态发生变化；
3. 需要用户介入；
4. 任务完成；
5. 任务失败或阻塞。

## 状态映射

| WorkBuddy 状态 | OpenPets status | 显示含义 |
|---|---|---|
| 正在处理、执行中 | `running` | Agent 正在工作 |
| 需要用户确认、需要补充信息 | `review` | 需要我介入 |
| 等待外部条件 | `waiting` | 等待外部条件，不代表任务完成 |
| 已完成 | `done` | 绿色完成状态 |
| 失败、阻塞 | `failed` | 任务遇到错误或卡点 |

特别注意：

- “本轮结束、可以继续输入”不能自动当成 `waiting`；如果本轮目标已经完成，应发送 `done`。
- 任务完成后不能继续复用旧的 `waiting` 气泡。
- 如果产品策略是完成后立即隐藏，则先发送一次 `done`，随后清理同一个 `threadId`。
- 不要用 `stop_pet`，除非用户明确要求关闭桌宠。

## 通知内容

每个通知至少包含：

- `title`：简短任务名，建议 `WorkBuddy · 任务名`；
- `status`：严格使用上面的 5 种状态之一；
- `text`：当前真实进展，不要写泛化的“任务已保存”；
- `threadId`：同一任务始终复用；
- `url` / `buttonLabel`：只有存在稳定的 WorkBuddy 任务入口时才传。

不要把 WorkBuddy 任务链接指向：

- `/desk`；
- 临时的 `/open-task?task=...` 页面；
- Codex 的 `codex://threads/...` 链接。

WorkBuddy 任务应跳转到 WorkBuddy 自己的会话或任务入口。如果当前没有稳定深链接，就省略跳转按钮，不要生成一个空白浏览器页面。

## 推荐执行流程

```text
任务开始
  → notify(status=running)，保存返回的 threadId

任务继续执行
  → 只有状态或重要进展变化时，用同一个 threadId 更新

需要我确认
  → notify(status=review)

等待外部资源
  → notify(status=waiting)

任务完成
  → notify(status=done)
  → 按产品策略清理同一个 threadId，不能遗留 waiting 气泡

任务失败
  → notify(status=failed)，正文说明原因和下一步
```

## 可选：同步到本地任务接口

如果还需要把 WorkBuddy 状态写入本地任务存储，可使用：

```text
POST http://localhost:3001/api/agents/register
POST http://localhost:3001/api/agents/heartbeat
POST http://localhost:3001/api/tasks/upsert
GET  http://localhost:3001/api/agents
```

注册示例：

```json
{
  "agentId": "workbuddy",
  "name": "WorkBuddy"
}
```

任务更新示例：

```json
{
  "agentId": "workbuddy",
  "name": "WorkBuddy",
  "task": {
    "taskId": "workbuddy-task-001",
    "title": "整理电脑文件",
    "summary": "正在按目录归类文件",
    "state": "running",
    "stateNote": "已完成桌面文件扫描，正在处理下载目录",
    "runtimeStatus": "running",
    "updatedAt": "2026-08-11T12:00:00+08:00",
    "canAcceptInput": false
  }
}
```

本地接口允许的原始状态包括：`running`、`active`、`waiting`、`idle`、`attention`、`needs_input`、`blocked`、`error`、`completed`、`complete`、`done`。

但 OpenPets 展示时必须遵守前面的状态映射，尤其不能把已经完成的任务发送成 `waiting`。

## 交接验收标准

请完成以下验证后再宣称接入成功：

1. WorkBuddy 启动一个测试任务，桌宠出现一个 `running` 气泡；
2. 同一任务更新状态时，气泡不重复增加，仍使用同一个 `threadId`；
3. 将任务改为 `review`，桌宠显示需要用户介入；
4. 将任务改为 `done`，桌宠显示绿色完成或按策略自动消失；
5. 重启 WorkBuddy 或桥接进程后，不能把已完成任务恢复成橙色 `waiting`；
6. 点击任务时进入 WorkBuddy 自己的任务/会话入口，不打开临时空白网页；
7. 同时最多保留 5 个 WorkBuddy 任务气泡。
