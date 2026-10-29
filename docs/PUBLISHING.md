# 发布指引（GitHub / dsh-market）

本文件记录把这个插件公开的步骤与已核实的平台要求，照做即可。

## 1. 发布前已完成的清理

| 项 | 状态 |
|---|---|
| 内部项目名、真实 openDingTalkId、真实业务数据 | 已从 README / 契约文档 / 测试 / 截图中清除 |
| `/Users/<name>` 绝对路径 | 已替换为 `~/…` 或 `/Users/you/…` |
| 截图 | 用通用数据（my-workspace、张三/李四/王五、ODT_demo_xxx）重拍 |
| LICENSE | 已补 MIT |
| `.gitignore` | 已补（node_modules、outbox、.DS_Store） |
| `package.json` | 已补 `repository` / `homepage` / `bugs` / `author` / `keywords` / `dsh.compatibility` |
| `screenshots.json` | 已补（6 张，市场详情页用） |
| 市场条目 YAML | 见第 4 节 |

发布前再自查一次：

```bash
grep -rn "smec\|上海分公司\|DF4wnkL\|/Users/yin" --include=*.md --include=*.js --include=*.json . | grep -v node_modules
node --test test/*.test.js
```

## 2. 推 GitHub

```bash
cd dsh-dingtalk-self
git init && git add . && git commit -m "feat: DingTalk auto-reply as yourself"
git remote add origin git@github.com:<你的账号>/dsh-dingtalk-self.git
git push -u origin main
```

要求（已核实自 awesome-dsh-plugin 的 contributing.md）：

1. `package.json` 声明 `dsh.bundle`（本仓库已有），旁边有 `cordis.patch.yml`（已有）；
2. **仓库创建满 1 天**才能投稿（CI 自动检查）；
3. 给仓库加 GitHub topic：`dsh-plugin`；
4. `package.json` 里的 `repository` / `author` 改成真实地址。

## 3. 可选：发 npm

```bash
npm publish --access public     # 包名 dsh-dingtalk-self（已确认未被占用）
```

发了 npm 之后市场条目可以写 `dsh plugin --profile web add dsh-dingtalk-self`；
只推 GitHub 也能安装：`dsh plugin --profile web add github:<账号>/dsh-dingtalk-self`。

## 4. 投 dsh-market（awesome-dsh-plugin）

向 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin 提一个 PR，**只加一个文件**：
`data/plugins/<owner>__<repo>.yml`（如 `MinEagle__dsh-dingtalk-self.yml`）：

```yaml
url: https://github.com/MinEagle/dsh-dingtalk-self
name: MinEagle/dsh-dingtalk-self
category: notify
description:
  en: Replies to DingTalk direct messages as your own account — reads the bound DSH workspace, writes the answer, and sends it back through the dws CLI.
  zh: 以你本人钉钉身份自动回复私聊：在绑定的 DSH 工作区里查资料生成回答，通过 dws CLI 以本人身份发出。
```

说明：

- `category` 选 `notify`（现有钉钉/IM 插件都在这里；维护者认为更贴切会自己改，不会因此打回）。
- 描述只写功能、不写营销词；**描述里的每句话都会和代码核对**，所以不要写"13 项功能"这类数字。
- 想要市场卡片图标就在条目里加 `icon:`，必须是 GitHub 托管的 `png/jpg/webp`（SVG 会被拒）；不写则用作者头像。
- 详情页截图由本仓库的 `screenshots.json` 提供，不用在那边写。

## 5. 审核可能追问的点（提前准备）

1. **凭据**：headless 子进程里 DSH 的 `credentials` 插件是禁用的，所以插件从 `$DSH_HOME/.credentials.yaml` 的 `refs` 段读出模型 Key 注入**本地子进程**环境，不落盘、不打日志、不外传。
   如果不想让插件碰凭据文件，把配置改成 `agent.credentialSource: "env"`，自己 `export MAGPIE_GATEWAY_KEY` / `DEEPSEEK_API_KEY` 后启动 DSH。
2. **发送身份**：消息以用户本人身份发出（`dws chat message send`），默认带一行可关闭的出站标识 `（本条由助手代答）`。
3. **能力声明**：插件会 spawn `dws` / `dsh` / `python3`（shell），读写 `$DSH_HOME/data/dsh-dingtalk-self`（fs-write），读工作区文件（fs-read），读环境变量（env），通过 dws 访问钉钉（network）。
4. **渲染**：配图由宿主侧调用 DSH 自带的 Python + Pillow 生成，不引入第三方依赖。
