# 桌宠当前事项小看板补丁

这个补丁为 OpenPets v0.7.2 的桌宠加了一个独立、可手动编辑的“当前事项”小看板。它不读取 Codex 或 WorkBuddy 的自动状态，也不改变现有任务气泡的行为。

## 交互

- 桌宠旁显示一个紧凑的绿色清单胶囊，表示未完成事项数，不遮挡桌宠。
- 点击数字展开编辑卡片；可添加、编辑，并用绿色“完成”按钮结束事项。
- 完成事项会立即从当前列表移除，同时让宠物跳跃两次作为完成奖励；不再提供容易误触的删除叉。
- 最多保留 5 件事项；完成项会排到末尾。
- 内容保存到 `UserDefaults` 的 `xiaobu.current-task-board.v1`，重启桌宠或电脑后仍会保留。
- 展开卡片优先放在桌宠右侧，右侧空间不足时自动放到左侧，并始终限制在当前屏幕内；收缩态保持为轻量的清单胶囊。

## 恢复到新版本 OpenPets 的步骤

1. 将同目录的 `XiaobuCurrentTaskBoard.swift` 放入 `Sources/OpenPetsKit/`。
2. 在 `OpenPetsHost.swift` 的 `PetHostController` 增加 `taskBoardPanel` 和 `taskBoardModel` 两个属性，并在初始化时创建 `XiaobuTaskBoardPanel`，把 `XiaobuCurrentTaskBoardView(model:)` 放入 `NSHostingView`。
3. 面板使用可获得焦点的 `.borderless` 样式（不要加 `.nonactivatingPanel`），层级为 `.statusBar`，`collectionBehavior` 包含 `.canJoinAllSpaces`、`.fullScreenAuxiliary` 和 `.stationary`；设置 `isReleasedWhenClosed = false` 与 `hidesOnDeactivate = false`。
4. 在 `show()` 中调用启动后的多时点显示保护：重新定位并 `orderFrontRegardless()`；在 `close()` 中取消保护任务，再 `orderOut(nil)` 后 `close()`。
5. 在桌宠拖动、召回、滑行、定位完成等所有会改变桌宠位置的路径后，调用 `positionTaskBoardPanel()`。
6. `positionTaskBoardPanel()` 在展开和收缩状态都以桌宠右侧 12pt 为首选位置；右侧不足时放到桌宠左侧，再对可视屏幕上下左右夹紧；尺寸取 `taskBoardModel.preferredSize`。
7. 将 `taskBoardModel.onLayoutChanged` 连接到 `positionTaskBoardPanel()`，让展开、收起、增删事项时自动重排。

原生任务气泡的运行小宠物补丁仍独立保存在上一级的 `openpets-v0.7.2-running-pet.patch`。两者可以同时应用。
