# 原生桌宠气泡补丁

目标：保持 OpenPets v0.7.2 原来的小气泡尺寸、位置、点击和完成勾选；只将 `.working` 的转圈替换为当前桌宠的缩小运行帧。

实现位于 OpenPetsKit 的 `OpenPetsBubbleContentView`。运行帧由 `PetHostController` 注入到消息视图，使用 `TimelineView` 每 150ms 切换一帧。因此它是纯本地绘制，不增加任务桥的轮询频率，也不伪造任务进度。

当前实际运行的是以 `alterhq/openpets` `v0.7.2` 为基准编译的补丁版。核心改动记录见 `patches/openpets-v0.7.2-running-pet.patch`；更新 OpenPets 时需基于新版本重新应用同样的视图注入与 `OpenPetsRunningPetIndicator` 组件。
