# 故障排查

## 没有出现气泡

按顺序检查：

1. OpenPets 是否正在运行。
2. CLI 是否可用：

   ```bash
   /Applications/OpenPets.app/Contents/MacOS/openpets-cli ping
   ```

   正常应返回 `pong`。
3. 是否启动了正确的桥接：Codex 用 `npm run codex:bridge`，WorkBuddy 用 `npm run workbuddy:bridge`。
4. 是否误用了 `XIAOBU_CODEX_BRIDGE_START_PAUSED=1`。

如果 CLI 路径不同，设置 `XIAOBU_OPENPETS_CLI` 后重新启动桥接。

## 同一个任务出现多个气泡

原因通常是桥接没有复用稳定的 `threadId`，或同时启动了两份桥接。处理方式：

1. 先停止重复的桥接进程，只保留一份 Codex 桥接和一份 WorkBuddy 桥接。
2. 确认更新事件一直使用同一个 `agent + threadId`。
3. 不要用任务标题或当前时间作为 `threadId`。

不要直接删除状态文件；如果必须清理，先备份 `~/.config/openpets/` 下相关 JSON 文件。

## 任务完成后仍显示运行中

桌宠不能只根据“最后更新时间”猜测完成状态。检查 Agent 是否真的发出了完成事件；如果事件源只返回 `idle`，桥接应结合最后一条有效结果判断，而不是把所有 `idle` 都当成运行中。

重启桥接后，先发送一次真实任务快照。已确认完成的任务应保持完成状态，直到用户点击收起。

## 点击任务打开了网页，而不是切换 Agent 桌面

在 macOS 上首次使用时运行：

```bash
./scripts/install-task-handoff.command
```

它注册 `xiaobu-task://` 本机协议。注册后点击任务应激活对应 Agent 桌面，不应打开 `localhost` 的中转网页。若 Agent 桌面本身未运行，先启动对应的 Codex 或 WorkBuddy。

## 电脑重启后桌宠不恢复

先手动验证：

```bash
npm run desk
```

如果手动启动正常，再检查 macOS 启动项中的路径是否仍指向当前电脑。不要直接复制另一台电脑的 `launchd` 配置；仓库里的 plist 是示例，需要按实际路径修改。

## 隐私与安全检查

以下内容不应进入 GitHub 或状态气泡：

- API Key、Cookie、密码和授权码；
- 完整 Agent 会话、终端日志和本地数据库；
- 包含个人信息的任务正文；
- 原电脑的绝对路径和启动项日志路径。

桌宠桥接只需要任务标题、状态、稳定任务 ID 和更新时间即可工作。
