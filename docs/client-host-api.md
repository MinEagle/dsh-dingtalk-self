# 宿主 ↔ 客户端 API 契约（v0.2）

本文件是 `dsh-dingtalk-self` 客户端半边（`client/client.js`）与宿主半边之间的唯一契约。
两侧各自独立实现，任何字段变更先改本文件。

## 1. 拓扑

```
浏览器（设置页 settings.section）
   │  fetch('/dsh-dingtalk-self/api/...')      ← 同源 HTTP，无需 token
   ▼
宿主（lib/rpc.js → ctx.webServer.register({ kind: 'prefix', path: '/dsh-dingtalk-self/' }))
   │
   ├─ ctx.get('settings')       读/写插件 Config（持久化到 profile patch）
   ├─ dws CLI                    登录态 / 诊断 / 发送
   └─ ~/.dsh/data/dsh-dingtalk-self/   状态、草稿、审计、急停标记
```

选择 HTTP 路由而不是 `host.call`：与 `dshmarket` 一致，路由/请求处理是公开记录过的
`WebRoute { kind, path, handler }`，而包内 RPC 注册方式没有可核对的公开契约。

## 2. 通用约定

- 所有请求/响应均为 JSON；请求体上限 256 KiB。
- 成功：`{ "ok": true, ... }`，HTTP 200。
- 业务失败：`{ "ok": false, "error": "人类可读的中文原因" }`，HTTP 200（便于 UI 统一展示）。
- 协议级失败（方法不允许 / 路径不存在 / JSON 解析失败）：HTTP 4xx/5xx + 同样结构。
- 不允许抛异常穿透到服务器：每个 handler 自己 try/catch。
- `GET` 只读，`POST` 写入。写接口要求 `Content-Type: application/json`。

## 3. 端点

### 3.1 `GET /dsh-dingtalk-self/api/state`

一次拉全量视图，客户端只在需要时重新拉取（无推送/轮询要求）。

```jsonc
{
  "ok": true,
  "plugin": {
    "name": "dsh-dingtalk-self",
    "version": "0.2.0",
    "bootedAt": "2026-10-28T09:00:00.000Z",
    "dataDir": "/Users/you/.dsh/data/dsh-dingtalk-self",
    "degraded": false            // true = 状态目录不可写，重启不保留
  },

  "config": {                    // 已合并默认值的生效配置
    "enabled": false,
    "mode": "draft",             // draft | confirm | auto
    "timeZone": "Asia/Shanghai",
    "pollIntervalSeconds": 60,
    "mergeWindowSeconds": 20,
    "quietHours": { "enabled": false, "start": "22:00", "end": "08:00" },
    "limits": { "maxRepliesPerHour": 10, "maxReplyChars": 300, "minSecondsBetweenReplies": 30, "maxFetchPerPoll": 50 },
    "guard": { "enabled": true, "stripCodeBlocks": true, "redactPaths": true, "redactInternalUrls": true, "blockedWords": [] },
    "agent": { "kind": "headless", "profile": "headless", "timeoutSeconds": 120 },
    "contacts": [
      { "name": "张三", "openDingTalkId": "xxx", "workspaceId": "my-workspace", "autoReply": false, "cursor": "2026-10-28 16:00:00" }
    ]
  },
  "configSource": "settings",    // settings | file | default
  "overrideFile": false,         // true = dataDir/config.json 存在并在覆盖 settings

  "paused": false,               // 急停标记（PAUSE 文件）

  "auth": {
    "ok": true,
    "authenticated": true,
    "self": { "userId": "u_xxx", "nick": "殷某" },   // 取不到时为 null
    "error": null                                    // dws 不存在/未登录时的原因
  },

  "workspaces": [                // 供绑定下拉；宿主服务不可用时为空数组
    { "id": "my-workspace", "title": "my-workspace", "path": "/Users/you/projects/my-workspace" }
  ],

  "pendingConfirm": [            // 等待人工确认的草稿
    { "key": "openDT:xxx", "contact": "张三", "text": "回复正文…", "createdAt": "2026-10-28T09:01:00.000Z" }
  ],

  "drafts": [                    // 最近 20 条已生成的草稿，**新的在前**
    { "contact": "张三", "file": null, "createdAt": "2026-10-28T09:01:00.000Z", "preview": "回复正文…最多 200 字" }
  ],

  "audit": [                     // 最近 30 条决策记录，**新的在前**（最新一条在 [0]）
    { "at": "2026-10-28T09:01:00.000Z", "kind": "reply", "contact": "张三", "detail": "发送成功" }
  ],

  "stats": { "drafts": 3, "sent": 1, "skipped": 12, "blocked": 0, "errors": 0 },

  "model": {                     // 生成回复实际会用的模型（null = 宿主没提供）
    "provider": "magpie",
    "model": "opendesign/deepseek-v4.1-flash",
    "reasoningEffort": "max",
    "source": "default"          // config = 插件里指定 / default = 跟随 DSH 当前默认 / profile = headless profile 自己决定
  },
  "readOnly": true,              // 生成回复时是否只读（不改文件）
  // config.replyFormat: 'markdown' | 'text'（默认 markdown，钉钉会渲染 Markdown）
  // config.replyMarker: 出站标识，例如 '（本条由助手代答）'；空字符串=不加

  "lastCycle": {                 // 最近一轮检查的结论（null = 还没跑过）
    "at": "2026-10-29T00:36:03.618Z",
    "reason": "auto",            // auto | manual
    "skippedReason": null,       // "插件未启用" / "已急停（PAUSE 文件存在）" / "监控名单为空"
    "contacts": 1, "fetched": 3, "fresh": 2,
    "drafts": 0, "confirms": 1, "sent": 0, "blocked": 0, "skipped": 0, "deferred": 0, "errors": 0
  },

  "diagnostics": {               // 宿主自检信息，客户端可忽略（排障用）
    "registeredNamespace": null,
    "registerError": "settings 服务未提供 register（register=undefined），配置存 dataDir/config.json",
    "toolsInjected": true,
    "toolsRegistered": 4,
    "settingsAvailable": true,
    "namespaces": ["ui-settings", "locale", "..."],
    "schema": { "available": true, "source": "bare", "version": null },
    "routes": ["/dsh-dingtalk-self/api/state", "..."]
  }
}
```

### 3.2 `POST /dsh-dingtalk-self/api/config`

写配置。**局部合并**：只传要改的字段。`contacts` 整体替换（数组语义）。

请求：

```jsonc
{ "patch": { "enabled": true, "mode": "draft", "contacts": [ /* 完整数组 */ ] } }
```

响应：`{ "ok": true, "config": { /* 同 3.1 的 config */ }, "configSource": "settings" }`

规则：

1. 若宿主 `settings` 服务提供 `update` 且 `describe()` 里能找到本插件的行，则写
   `settings.update('<profile 条目 id>', patch, revision)`（DSH 原生、持久化、热生效），`configSource: "settings"`。
2. 否则写 `dataDir/config.json`（浅合并），`configSource: "file"`。

> **实测（DSH 0.2.1-rc.3）**：本机 `settings` 服务对象上没有 `register`，`describe()` 也不返回本插件条目
> （Config schema 由 Loader 负责，不经过服务注册）。所以在这版宿主上走的是第 2 条：
> 配置落在 `~/.dsh/data/dsh-dingtalk-self/config.json`，`configSource` 恒为 `file`。
> 这不算降级失败，是当前版本的正常路径；`settings` 分支保留给提供 `update` 的版本。
3. 写入前做 `withDefaults()` 归一化，非法 `mode` 回落 `draft`。
4. `contacts[].name` 与 `workspaceId` 必填，且 `openDingTalkId`/`userId` 至少一个，缺字段拒绝：
   `{ ok:false, error:"联系人「张三」缺少 workspaceId（必须先绑定一个 DSH 工作区）" }`。

### 3.3 `POST /dsh-dingtalk-self/api/pause`

请求 `{ "paused": true }` → `{ "ok": true, "paused": true }`。

### 3.4 `POST /dsh-dingtalk-self/api/confirm`

请求 `{ "contact": "张三", "action": "send" }`（`action: send | discard`）。

响应 `{ "ok": true }` 或 `{ "ok": false, "error": "没有待确认的草稿" }`。
是 3.1 里 `pendingConfirm` 的操作入口。

### 3.5 `POST /dsh-dingtalk-self/api/diagnose`

跑一次环境自检（可能耗时 2–10 秒）。

```jsonc
{
  "ok": true,
  "checks": [
    { "id": "node",   "label": "Node 版本", "ok": true,  "detail": "v22.19.0" },
    { "id": "dws",    "label": "dws 可执行", "ok": true,  "detail": "/usr/local/bin/dws" },
    { "id": "auth",   "label": "个人身份登录", "ok": true, "detail": "已登录：殷某" },
    { "id": "self",   "label": "默认工作区", "ok": false, "detail": "未取到 workspace 列表" }
  ]
}
```

`checks[].label` 由宿主给出中文；客户端只渲染，不做本地判断。

### 3.6 `POST /dsh-dingtalk-self/api/contacts/search`

设置页选人**只能**走这个端点：搜索钉钉通讯录（底层 `dws contact user search`），不接受手填 ID。

请求 `{ "query": "张三" }`（1–64 字）。

```jsonc
// 成功
{ "ok": true, "candidates": [
  { "name": "张三", "openDingTalkId": "xxx", "userId": "u_xxx" }
] }

// dws 未登录 / 未安装（HTTP 200，前端原样展示）
{ "ok": false, "error": "dws 未登录：请先在终端执行 dws auth login（原始信息：…）" }
```

规则：

1. `query` 为空白 → 400 `{ ok: false, error: "请先输入姓名关键词" }`。
2. 同一 `openDingTalkId`/`userId` 去重，缺两个 ID 的候选丢弃，最多 20 条。
3. 搜不到时返回 `{ ok: true, candidates: [] }`，前端显示「没搜到匹配的联系人」。

---

### 3.7 `POST /dsh-dingtalk-self/api/cycle`

立即跑一轮检查（设置页「立即检查一次」）。绕过轮询间隔，但**仍然尊重总开关与急停**。

```jsonc
// 成功
{ "ok": true, "cycle": { /* 同 3.1 的 lastCycle */ } }

// 不能跑
{ "ok": false, "error": "插件未启用：先打开「总开关」" }
{ "ok": false, "error": "已急停：先解除急停再检查" }
{ "ok": false, "error": "上一轮还在跑，请稍后再试" }
```

首次启用（还没有游标）时按 `initialLookbackSeconds`（默认 900 秒）回看，之后只看
`overlapSeconds` 的重叠窗口——所以「刚打开开关却看不到历史消息」是预期行为。

---

### 3.8 `GET /dsh-dingtalk-self/api/models`

设置页的模型下拉数据。失败也返回 200（`providers` 为空即可），不阻塞页面。

```jsonc
{
  "ok": true,
  "providers": [
    { "id": "magpie", "name": "Magpie",
      "models": [ { "id": "opendesign/deepseek-v4.1-flash", "name": "DeepSeek-V4.1-Flash" } ] },
    { "id": "deepseek-official", "name": "DeepSeek", "models": [ /* … */ ], "error": "可选：枚举失败原因" }
  ],
  "current": { "provider": "magpie", "model": "…", "reasoningEffort": "max", "source": "default" },
  "error": null
}
```

模型写进配置的路径是 `config.agent.provider` / `config.agent.model` / `config.agent.reasoningEffort`
（留空 = 跟随 DSH 当前默认模型）；只读开关是 `config.agent.readOnly`（默认 true）。

> 实现说明：headless 子进程用 `--patch` 临时覆盖 `agent-default-model` 拿模型，
> 用 `DSH_PERMISSION_MODE=read-only` 拿只读，凭据从 `$DSH_HOME/.credentials.yaml` 的 refs
> 注入子进程环境（headless 里 credentials 插件是禁用的）。

---

### 3.9 `POST /dsh-dingtalk-self/api/test-reply`

模拟回答（设置页「模拟回答」面板）：用**真实生成通道**跑一遍，但**不发送**、不动游标、不写待确认队列。

请求 `{ "message": "这个接口是干什么的？" }`（第一行联系人绑定的工作区 + 当前模型 + 当前只读设置）。

```jsonc
// 成功（注意：可能耗时 1–3 分钟，前端超时应 >= 180s）
{ "ok": true,
  "reply": "经过出站护栏的正文",
  "outbound": "正文 + 回复标识（实际发出时会是这条）",
  "durationMs": 118000,
  "model": { "provider": "magpie", "model": "opendesign/deepseek-v4.1-flash", "source": "default" },
  "readOnly": true,
  "workspace": "my-workspace",
  "note": "模拟不会发送；每次模拟都会新建一个会话，不影响该联系人的真实上下文" }

// 失败
{ "ok": false, "error": "出站护栏拦下了这条回复：…", "durationMs": 9000, "raw": "被拦下的原文（可选）" }
```

模拟结果里额外返回（与真实链路同顺序处理：渲染块 → 附件指令 → 正文）：

```jsonc
{
  "truncated": false,          // 是否被字数上限截断
  "limitChars": 1200,
  "renders": [                 // 配图：真的渲染了一遍
    { "ok": true, "type": "table", "title": "订单分布", "name": "render-…png",
      "bytes": 43707, "dataUrl": "data:image/png;base64,…" },
    { "ok": false, "type": "bar", "error": "少于 3 行，不出图" }
  ],
  "attachments": [             // 附件：只校验，不发送
    { "ok": true, "name": "arch.png", "bytes": 1024, "path": "…" },
    { "ok": false, "request": "missing.pdf", "error": "文件不存在" }
  ]
}
```

约束：

1. `message` 为空 → `ok:false`（提示先填消息）。
2. 还没有联系人 → `ok:false`（模拟要用第一条联系人绑定的工作区）。
3. 每次模拟新建会话（不复用联系人的真实会话），所以不会污染真实对话上下文。

---

## 4. 客户端半边约束

- 文件：`client/client.js`，普通 JS，无构建、无 JSX。
- 形态：

  ```js
  window.__ModuleLoader__.load({
    id: 'dsh-dingtalk-self',
    factory(require) {
      const React = require('react');
      const h = React.createElement;
      return { inject: ['slots'], apply(ctx) { /* 注册设置页 */ } };
    }
  });
  ```

- 注册位置：`ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dingtalk-self', order: 45, label: () => '钉钉代答' }, Component))`。
- 数据：只用第 3 节端点，`fetch(new URL('/dsh-dingtalk-self/api/…', document.baseURI).pathname)`。
- 样式：只用主题 token（`--dsw-alias-*`、`--dsw-specific-sidebar-fill`），以 `<style>` 元素随组件渲染，
  禁止全局样式表、禁止改写 `document.body`。
- 文案：中文为主；`ctx.locale` 可用时按 zh/en 切换，不可用时中文。
- 卸载：定时器/监听在 `ctx.effect` 里注册并返回清理函数。
- 所有写操作后重新拉 `state`，不做本地乐观状态。

## 5. 页面结构（客户端）

页面名：**钉钉代答**（英文 DingTalk auto-answer）。

1. **状态卡**：dws 登录态 + 本人 userId、急停开关、`重新诊断`、`刷新`。
2. **监听分组**：按 `contacts[].workspaceId` 分组显示（一组 = 一个工作区 + 若干联系人）。
   组卡内：工作区下拉（整行）、成员列表（姓名 + 小字 ID + 移除）、「添加联系人」（走 3.6 通讯录搜索）、
   组级「允许真实发送」（切换时写到组内每个成员）、「删除本组」。顶部「新增分组」。
   保存时**展平成扁平 `contacts[]`**，每人带自己的 `workspaceId` / `autoReply` / `sessionId`
   （宿主轮询与会话隔离都按人走，一人一个上下文）。
3. **行为设置**：总开关、模式（草稿/确认/自动）、轮询间隔、静默时段（开关 + 起止）、每小时上限、回复字数上限。
4. **待确认草稿**：每条 `发送` / `丢弃`。
5. **最近审计**：最近 10 条，时间 + 说明。
6. **保存**：脏态时出现，`保存`/`撤销`，保存后 toast 提示 + 重新拉 state。
