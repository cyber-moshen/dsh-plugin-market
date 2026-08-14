# @cyber-moshen/dsh-plugin-market

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 的**插件工坊**——一个精心筛选的插件目录，目录本身就在本仓库里。

[English](README.md) · [日本語](README.ja.md)

## 这是什么

**设置 → 插件工坊**页面，提供：

- **卡片式插件列表**——每张卡片显示**标签**（点标签即可搜索）、**GitHub 星标**、**最近提交时间**（带颜色维护信号）、**已安装版本/更新状态**；
- **搜索**匹配插件名、作者**和标签**；常驻**过滤栏**（安装状态、星标/提交排序、维护状态）；
- **一键安装 / 更新**（后台调用真实 `dsh plugin` CLI）；
- 每张卡片右上角的 **GitHub 图标按钮**直达仓库；
- **设置弹窗**：**GitHub Token** 输入（解除 API 限流）、**启动时自动更新**开关；
- **整个插件跟随应用自身的语言设置**（设置 → 通用 → 语言：中文 / English）；
- 启动时自动更新完成后，任意页面顶部弹出 **"已自动更新插件，请重启生效"** 提示条。

**目录就是本仓库的 `data/plugins.json`**——任何人想上架插件，提一个 PR 即可（见[提交 PR 上架](#提交-pr-上架你的插件)）。运行时**实时**抓取，**没有离线缓存和快照**。

## 安装

发布到 npm 后，一条命令任意位置安装：

```sh
dsh plugin --profile web add @cyber-moshen/dsh-plugin-market
```

本地源码安装：

```sh
dsh plugin --profile web add ./dsh-plugin-market -w
```

重启 Web 服务，然后打开 **设置 → 插件工坊**。

## 使用教学

### 工坊页面

1. 打开 **设置 → 插件工坊**。
2. **搜索**——匹配插件名、作者**和标签**；点击卡片上的 `#标签` 直接搜索该标签。
3. **过滤栏**（搜索框下方常驻）：
   - 安装状态：全部 / 已安装 / 未安装
   - 排序：星标升序 / 星标降序 / 提交升序 / 提交降序
   - 维护：全部 / 活跃 / 较久未更新 / 可能停更 / 未知
4. **卡片操作**：
   - ⭐ 星标、🕓 最近提交**实时**来自 GitHub API；维护色标：绿=3 个月内推送，黄=1 年内，红=更久或已归档。
   - **未安装** → `安装` 按钮（一律通过 npm 包安装）。
   - **已安装且有新版** → `已安装 vX` + `更新 → vY`。
   - **已安装且最新** → 只显示 `已安装 vX`。
   - 已安装的插件还有 **启用/禁用** 和 **卸载** 按钮（在"更新"右边；禁用走 profile 补丁层，重启后生效）。
   - 右上角 GitHub 图标打开仓库页面。

### 设置弹窗（搜索框右侧"设置"按钮）

- **GitHub Token（可选）**——填入令牌把 API 限流从每小时 60 次提升到 5000 次。获取方法见[如何获取 Token](#如何获取-github-token)。环境变量 `GITHUB_TOKEN` / `GH_TOKEN` 优先。空输入保存不会清空已存 Token；清除请用"清除"按钮。
- **启动时自动更新已安装插件**——开启后，每次 Web 服务启动会检查已安装插件，有新版自动更新；完成后首页弹窗提示重启生效。

## 如何获取 GitHub Token

1. 打开 <https://github.com/settings/tokens>（Settings → Developer settings → Personal access tokens）。
2. 点击 **Generate new token (classic)**。
3. 起个名字（如 `dsh-plugin-market`），设置有效期。
4. 勾选 **`repo`** 权限（本插件只需要这一个）。
5. 点 **Generate token**，**立即复制**（只显示一次）。
6. 粘贴到插件工坊的**设置**弹窗，点**保存**；保存成功后会显示 `✓ Token 已保存（···xxxx）`。

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
  "npm": "your-npm-package"                     // 必填——安装/更新一律通过 npm 包
}
```

卡片上的名字、作者、星标/提交时间都会自动从 `url` 推导；**`npm` 必填**——安装和更新都走 npm 包（不使用 GitHub 安装）。

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
