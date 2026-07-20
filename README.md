# 小步修仙任务看板

把每日任务、每周目标、长期目标和复杂工作流程组织成一套修仙成长系统。项目包含工作洞府、分步任务执行、技巧阁、愿望奖励以及本地持久化。

## 在当前电脑运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 换一台电脑恢复

1. 安装 Node.js 和 GitHub Desktop，登录拥有本私有仓库权限的 GitHub 账号。
2. 在 GitHub Desktop 中选择 **Clone Repository**，把仓库克隆到新电脑。
3. 在项目目录运行 `npm install`。
4. 运行 `npm run dev`，打开 `http://localhost:3000`。
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

因此 GitHub 可以恢复程序，却不能单独恢复任务、技巧、奖励和每日记录。运行数据需要通过看板的数据导出功能另行备份。

## 常用检查

```bash
npm run build
npm test
```

数据库结构发生变化后可运行：

```bash
npm run db:generate
```
