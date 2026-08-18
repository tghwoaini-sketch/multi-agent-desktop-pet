# 原生桌宠气泡补丁

目标：保持 OpenPets v0.7.2 原来的小气泡尺寸、位置、点击和完成勾选；只将 `.working` 的转圈替换为当前桌宠的缩小运行帧。

实现位于 OpenPetsKit 的 `OpenPetsBubbleContentView`。运行帧由 `PetHostController` 注入到消息视图，使用 `TimelineView` 每 150ms 切换一帧。因此它是纯本地绘制，不增加任务桥的轮询频率，也不伪造任务进度。

当前实际运行的是以 `alterhq/openpets` `v0.7.2` 为基准编译的补丁版。运行状态改动记录见 `patches/openpets-v0.7.2-running-pet.patch`；更新 OpenPets 时需基于新版本重新应用同样的视图注入与 `OpenPetsRunningPetIndicator` 组件。

## 状态光场

气泡面板的宠物区域还增加了一个轻量的原生 GPU 状态光场，记录见
`patches/openpets-v0.7.2-status-light-field.patch`。它直接读取当前可见气泡的状态：运行中使用蓝青色缓慢流动，等待/需要确认使用橙色扩散，完成使用绿色，失败使用红色；多个 Agent 会显示多色光斑叠加。动画通过 SwiftUI `Canvas` 和 `TimelineView` 绘制，不新增网络请求、文件轮询或任务状态源，因此不会改变状态判断，也不会让后台持续拉取。

任务气泡的跨应用显示改动记录见 `patches/openpets-v0.7.2-message-panel-visibility.patch`。它固定消息窗口在失去前台焦点后仍保持显示，并避免窗口生命周期被误释放；否则切换到非 Codex、非 WorkBuddy 页面时，气泡会被 macOS 隐藏，看起来像任务栏停止工作。

部署约定：系统目录 `/Applications/OpenPets.app` 保留原版；补丁版运行在 `~/Applications/OpenPets.app`。这是因为系统会阻止改写 `/Applications` 下的 App。补丁二进制需含 `@loader_path/../Frameworks` 的 rpath，随后用 ad-hoc 签名重新签名整个用户目录 App。桌宠不见或 spinner 复发时，先确认当前运行路径是 `~/Applications/OpenPets.app/Contents/MacOS/OpenPets`，再检查 `openpets-cli ping` 是否返回 `pong`。

持久化：`scripts/com.xiaobu.openpets-patched.plist` 会在登录时启动并守护补丁版；启动脚本也必须使用明确路径 `open ~/Applications/OpenPets.app`，不能再使用含糊的 `open -a OpenPets`。

## 当前事项小看板

桌宠右侧新增了一个独立的手动小看板：收起时显示未完成事项数，点击后可编辑 1–5 件“当前事项”。它不接管 Codex / WorkBuddy 的状态，也不改动原有任务气泡；目的是让你随时扫一眼自己此刻要推进什么。

事项保存于桌宠应用自己的本地设置，重启桌宠或电脑后会保留。实现源码和恢复说明在 `patches/openpets-v0.7.2-current-task-board/`。
