# dsh-plugin-market

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 的**插件工坊**——一个精心筛选的插件目录，目录本身就在本仓库里。

[English](README.md) · [日本語](README.ja.md)

## 这是什么

**设置 → 插件工坊**页面，提供：

- **卡片式插件列表**——每张卡片显示**标签**（点标签即可搜索）、**GitHub 星标**、**最近提交时间**（带颜色维护信号）、**已安装版本/更新状态**；
- **搜索**匹配插件名、作者**和标签**；常驻**过滤栏**（安装状态、星标/提交排序、维护状态）；
- **一键安装 / 更新**（后台调用真实 `dsh plugin` CLI，环境坑已全部处理，见下文）；
- 每张卡片右上角的 **GitHub 图标按钮**直达仓库；
- **设置弹窗**：**GitHub Token** 输入（解除 API 限流）、**启动时自动更新**开关；
- **整个插件跟随应用自身的语言设置**（设置 → 通用 → 语言：中文 / English）；
- 启动时自动更新完成后，任意页面顶部弹出 **"已自动更新插件，请重启生效"** 提示条。

**目录就是本仓库的 `data/plugins.json`**——任何人想上架插件，提一个 PR 即可（见[提交 PR 上架](#提交-pr-上架你的插件)）。插件运行时从本仓库抓取该文件（走镜像链），包内附带离线快照兜底。

## 安装

```sh
# 在包含本仓库目录的任意位置：
dsh plugin --profile web add ./dsh-plugin-market -w
# 重启 Web 服务，然后打开 设置 → 插件工坊
```

## 使用教学

### 工坊页面

1. 打开 **设置 → 插件工坊**。
2. **搜索**——输入任意关键词，会匹配插件名、描述、作者**和标签**；点击卡片上的 `#标签` 直接搜索该标签。
3. **过滤栏**（搜索框下方常驻）：
   - 安装状态：全部 / 已安装 / 未安装
   - 排序：星标升序 / 星标降序 / 提交升序 / 提交降序
   - 维护：全部 / 活跃 / 较久未更新 / 可能停更 / 未知
4. **卡片操作**：
   - ⭐ 星标、🕓 最近提交来自 GitHub API（见[数据与限流](#数据与限流)）；维护色标：绿=3 个月内推送，黄=1 年内，红=更久或已归档。
   - **未安装** → `安装` 按钮。
   - **已安装且有新版** → `已安装 vX` + `更新 → vY` 按钮。
   - **已安装且最新** → 只显示 `已安装 vX`（无按钮；卸载请到原生插件列表/CLI）。
   - 右上角 GitHub 图标打开仓库页面。

### 设置弹窗（搜索框右侧"设置"按钮）

- **语言**——整个插件跟随应用的自身语言设置（设置 → 通用 → 语言：中文 / English），无需单独切换。
- **GitHub Token（可选）**——填入令牌把 API 限流从每小时 60 次提升到 5000 次。获取方法见[如何获取 Token](#如何获取-github-token)。环境变量 `GITHUB_TOKEN` / `GH_TOKEN` 优先。
- **启动时自动更新已安装插件**——开启后，每次 Web 服务启动会检查已安装插件，有新版自动更新；完成后首页弹窗提示重启生效。

## 如何获取 GitHub Token

1. 打开 <https://github.com/settings/tokens>（Settings → Developer settings → Personal access tokens）。
2. 点击 **Generate new token (classic)**。
3. 起个名字（如 `dsh-plugin-market`），设置有效期。
4. 勾选 **`repo`** 权限（本插件只需要这一个）。
5. 点 **Generate token**，**立即复制**（只显示一次）。
6. 粘贴到插件工坊的**设置**弹窗，点**保存**；存储成功后会显示 ✓。

> 令牌等于你仓库的写权限，请妥善保管，不要外泄。

## 提交 PR 上架你的插件

目录是一个 JSON 文件：[`data/plugins.json`](data/plugins.json)。

1. 在本仓库 GitHub 页面上打开 `data/plugins.json`。
2. 点铅笔（**Edit**）按钮。
3. 复制一条现有条目改成你的插件，插入到 `"plugins": [...]` 里。
4. **Commit changes… → Propose changes → Create pull request**。

每个 PR 会自动跑校验，JSON 格式错误或缺字段会标红（本地可先跑 `node scripts/validate.mjs data/plugins.json`）。

条目结构（越简单越好，其余全部从链接自动推导）：

```jsonc
{
  "url": "https://github.com/you/your-plugin",  // 你的仓库链接（必填、唯一）
  "tags": ["记忆增强", "UI美化"],                 // 0-5 个可搜索标签（可选）
  "npm": "your-npm-package"                     // 有 npm 包才写（可选：一键安装 + 版本检测）
}
```

卡片上的名字、作者、安装命令、星标/提交时间都会自动从 `url` 推导。只有发布到 npm 的插件才需要 `npm` 字段。

## 数据与限流

- **目录**——本仓库 `data/plugins.json`，运行时经镜像链**实时**抓取（ghproxy → gh-proxy → ghfast → raw.githubusercontent → github.com/raw）；**没有离线快照**，断网时工坊直接报错，绝不显示旧数据。
- **星标 / 最近提交**——GitHub API **实时**拉取，仅内存保留几分钟（**不写磁盘**）。无 Token 时匿名限额**每小时 60 次**；限流时降级 shields.io 徽章。在工坊设置里配置 Token 可提升到 5000 次/小时。
- **版本号**——npm 发布的插件查 npm registry，其余读仓库 `package.json`（不占 API 配额）。

## 为什么安装命令带这些参数？

profile 是 pnpm workspace 根，所以每次 pnpm 调用都要 `-w`；npm 上几个 `@deepseek-ai` peer 包的 `latest` tag 是坏的（0.0.1-rc.1 依赖未发布的 `@deepseek-ai/dsh-compact`），所以安装时会把标准 peer（`@deepseek-ai/cordis`、`dsh-client-runtime`、`dsh-client-ui-slots`、`react`）钉到 profile 里已有的版本。完整应用类插件（如 TUI 客户端）会被拒绝装进 web profile（api-gateway 冲突保护）。

## 常见问题

- **报错 "not found is not valid JSON"**——浏览器还在用插件更新前的旧页面。重启 Web 服务后**强制刷新（Ctrl+Shift+R）**或新开标签页。
- **星标"—"/维护"未知"**——GitHub API 限流；配置 Token（见上）或等每小时配额重置（后台会自动补数据）。
- **连不上 GitHub**——插件走公共镜像；本地有代理（如 Clash）时设置 `HTTPS_PROXY`/`HTTP_PROXY`，git/gh 可加：`git config --global http.https://github.com.proxy http://127.0.0.1:7890`。

## 开发

- `lib/host.js`——Cordis host：`/api/dsh-plugin-market` 路由、目录与数据、安装/更新任务、dsh CLI 定位。
- `lib/client.js`——浏览器端：工坊 UI、过滤栏、设置弹窗、重启提示条。
- `data/plugins.json`——目录（想精选就改它）。
- `scripts/seed.mjs`——从上游 awesome 列表重建目录，每类按星数取 TopN（`node scripts/seed.mjs --top 10`）。
- `scripts/validate.mjs`——目录校验（PR 工作流在用）。
- `scripts/prewarm.mjs`——冒烟测试 + 数据缓存预热。

## 许可证

MIT · 安装插件意味着下载并运行第三方代码——请自行审查源码、自行承担风险。
