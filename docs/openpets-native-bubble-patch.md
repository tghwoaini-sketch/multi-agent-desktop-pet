# 原生桌宠气泡补丁

目标：保持 OpenPets v0.7.2 原来的小气泡尺寸、位置、点击和完成勾选；只将 `.working` 的转圈替换为当前桌宠的缩小运行帧。

实现位于 OpenPetsKit 的 `OpenPetsBubbleContentView`。运行帧由 `PetHostController` 注入到消息视图，使用 `TimelineView` 每 150ms 切换一帧。因此它是纯本地绘制，不增加任务桥的轮询频率，也不伪造任务进度。

当前实际运行的是以 `alterhq/openpets` `v0.7.2` 为基准编译的补丁版。核心改动记录见 `patches/openpets-v0.7.2-running-pet.patch`；更新 OpenPets 时需基于新版本重新应用同样的视图注入与 `OpenPetsRunningPetIndicator` 组件。

部署约定：系统目录 `/Applications/OpenPets.app` 保留原版；补丁版运行在 `~/Applications/OpenPets.app`。这是因为系统会阻止改写 `/Applications` 下的 App。补丁二进制需含 `@loader_path/../Frameworks` 的 rpath，随后用 ad-hoc 签名重新签名整个用户目录 App。桌宠不见或 spinner 复发时，先确认当前运行路径是 `~/Applications/OpenPets.app/Contents/MacOS/OpenPets`，再检查 `openpets-cli ping` 是否返回 `pong`。

持久化：`scripts/com.xiaobu.openpets-patched.plist` 会在登录时启动并守护补丁版；启动脚本也必须使用明确路径 `open ~/Applications/OpenPets.app`，不能再使用含糊的 `open -a OpenPets`。
