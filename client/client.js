/**
 * dsh-dingtalk-self · 客户端半边（设置页）
 *
 * 形态：普通 JS，无构建、无 JSX，由 Harness 浏览器的模块表提供 React。
 * 数据：只用 docs/client-host-api.md 第 3 节的五个端点，所有写操作后重新拉 state。
 * 样式：只用主题 token，以组件内 <style> 元素随组件渲染，不写全局样式表、不改写页面根节点。
 * 文案：中文为主；ctx.locale 可用时按 zh/en 切换，不可用时中文。
 */
window.__ModuleLoader__.load({
  id: 'dsh-dingtalk-self',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /* ============================== i18n ============================== */

    const LOCALE_NS = 'dingtalk-self';

    const ZH = {
      sectionLabel: '钉钉代答',
      sectionDesc: '别人在钉钉问你时，由 agent 查资料后代你直接答复对方。',

      loading: '正在读取插件状态…',
      loadFailed: '读取状态失败',
      retry: '重试',
      refresh: '刷新',
      refreshing: '刷新中…',
      refreshed: '已刷新',
      refreshedDiscard: '已刷新，未保存的修改已丢弃',
      diagnose: '重新诊断',
      diagnosing: '诊断中…',
      diagnoseDone: '自检完成',
      unknownError: '未知错误',
      timeout: '请求超时，请稍后重试',
      badResponse: '宿主返回了无法解析的响应',
      notAvailable: '未获取到',
      dash: '—',

      statusTitle: '运行状态',
      authUnknown: 'dws 登录态未知',
      authOk: 'dws 已登录',
      authFail: 'dws 未登录',
      selfUserId: '本人 userId',
      selfNick: '昵称',
      pauseTitle: '急停',
      pausedOn: '已暂停：不读取、不生成、不发送',
      pausedOff: '运行中',
      pausedShort: '已暂停',
      runningShort: '运行中',
      version: '版本',
      bootedAt: '启动时间',
      dataDir: '状态目录',
      configSource: '配置来源',
      configSourceSettings: 'DSH settings',
      configSourceFile: '状态目录 config.json（插件自管理）',
      configSourceDefault: '内置默认值',
      degradedWarn: '状态目录不可写：草稿、审计与急停标记重启后不保留。',
      overrideInfo: '检测到 dataDir/config.json，它正在覆盖 DSH settings。',
      statsTitle: '计数',
      statDrafts: '草稿',
      statSent: '已发送',
      statSkipped: '已跳过',
      statBlocked: '已拦截',
      statErrors: '错误',
      lastCycleLabel: '上次检查',
      cycleNever: '还没检查过',
      cycleFirstHint: '首次检查会回看最近 15 分钟的私聊',
      cycleReadSummary: '读取 {fetched} 条 · 新私聊 {fresh} 条',
      cycleNoNew: '没有新的私聊消息',
      cycleConfirms: '待确认',
      cycleManual: '立即检查一次',
      cycleChecking: '检查中…',
      cycleDone: '检查完成',
      cycleHint: '立即检查一次（绕过轮询间隔）',
      cycleDisabledOff: '总开关关闭：先打开「总开关」再检查',
      cycleDisabledPaused: '已急停：先解除急停再检查',
      replyModelLabel: '回复模型',
      modelSourceConfig: '插件配置',
      modelSourceDefault: '跟随 DSH 默认',
      modelSourceProfile: 'headless profile 默认',
      modelEffortShort: '推理 {effort}',
      readOnlyOn: '只读',
      readOnlyOff: '可写',
      readOnlyOnHint: '只读：只在工作区里查资料，不改任何文件',
      readOnlyOffHint: '可写：模型可能修改工作区文件，谨慎关闭',
      readOnlyLabel: '只读',
      agentSectionTitle: '生成回复',
      agentSectionHint: '选择生成回复使用的模型与权限。',
      providerLabel: 'Provider',
      modelLabel: '模型',
      effortLabel: '推理档位',
      effortDefault: '模型默认',
      effortHint: '留空使用模型默认档位',
      modelFollowDefault: '跟随 DSH 默认（当前 {current}）',
      modelFollowDefaultPlain: '跟随 DSH 默认',
      modelManualHint: '未能读取模型清单，可手动填写。',
      modelLoading: '正在读取模型清单…',
      modelCatalogError: '模型清单读取失败：{message}',
      modelProviderError: '该 provider 的模型枚举失败：{message}',
      replyMarkerLabel: '回复标识',
      replyMarkerHint: '会附在每条发出去的消息末尾，让对方知道这不是本人手打；留空则不加标识。',
      replyFormatLabel: '回复格式',
      replyFormatMarkdown: 'Markdown（推荐，钉钉会渲染加粗/列表/小标题）',
      replyFormatText: '纯文本',
      replyFormatMarkdownHint: '钉钉会渲染 Markdown：支持加粗、列表、小标题；表格和代码围栏不渲染，模型已被要求不要用',
      replyFormatTextHint: '会去掉所有 Markdown 记号，用 • 列表和换行排版',
      attachmentsTitle: '回复附件',
      attachmentsEnabled: '允许回复附带图片/PDF',
      attachmentsMaxCount: '最多张数',
      attachmentsMaxBytes: '单个上限 MB',
      attachmentsCountHint: '0–5',
      attachmentsBytesHint: '1–50',
      attachmentsHint: '钉钉里会作为文件附件补发（文字之后另一条消息），不是内联大图；只允许工作区内已存在的图片或 pdf/docx/xlsx/csv/md/txt/zip。「生成配图」由插件渲染，不受此项控制。',
      invalidAttachmentsCount: '最多张数需为 0–5 的整数',
      invalidAttachmentsBytes: '单个上限需为 1–50 MB 的整数',
      renderTitle: '生成配图（表格 / 柱状图 / 流程 / 步骤）',
      renderEnabled: '允许模型输出表格 / 柱状图 / 流程 / 步骤',
      renderMaxBlocks: '单条最多几张',
      renderMaxRows: '最多行数',
      renderBlocksHint: '0–3',
      renderRowsHint: '1–30',
      renderHint: '按对方意图决定：要明细就给表格，要对比/占比就给柱状图，要流转就给流程图；单一结论或一两句解释不画。每条最多一张，少于 3 行（柱状图少于 2 项）不画。插件在宿主里渲染成 PNG，再作为文件附件补发，不是内联大图。',
      invalidRenderBlocks: '单条最多几张需为 0–3 的整数',
      invalidRenderRows: '最多行数需为 1–30 的整数',
      testReplyTitle: '模拟回答（不发送）',
      testMessageLabel: '对方消息',
      testMessagePlaceholder: '粘贴一条对方可能发来的消息，例如：这个接口是干什么的？',
      testGenerate: '生成模拟回复',
      testGenerating: '生成中…（可能要 1–3 分钟）',
      testElapsed: '已等待 {seconds} 秒',
      testEmptyHint: '先填一条消息',
      testCancelled: '已取消；其它设置可以继续操作',
      testFailed: '生成失败',
      testTimeout: '生成超时：模型可能较慢，稍后重试',
      testNote: '走真实生成通道但不发送；每次模拟新建会话，不影响该联系人上下文',
      testMarkerNote: '实际发出会在末尾追加：{marker}',
      testMarkerNone: '（无标识）',
      testMeta: '模型 {model} · {permission} · 耗时 {duration}',
      testChars: '正文 {chars} 字',
      testTruncatedWarning: '正文已达到字数上限（{limitChars} 字）被截断，末尾的「…」是截断标记。可在「行为设置 → 回复字数上限」调大。',
      testRendersTitle: '配图（预览）',
      testAttachmentsTitle: '附件（仅校验）',
      testPreviewNote: '这些图不会发出去，只是预览；真实回复时会作为文件附件补发。',
      testRenderAlt: '模拟配图预览',
      testRenderTypeTable: '表格',
      testRenderTypeBar: '柱状图',
      testRenderTypeFlow: '流程图',
      testRenderTypeSteps: '步骤',
      testRenderNoPreview: '已渲染：{name}（{size}）— 文件较大，未内联预览',
      testRenderFailed: '配图未生成：{error}',
      testAttachFailed: '{path}：{error}',
      testRawToggle: '查看被拦下的原文',
      testDurationOnly: '耗时 {duration}',
      durationSeconds: '{seconds} 秒',
      durationMinutes: '{minutes}分{seconds}秒',
      checksTitle: '自检结果',
      checkOk: '通过',
      checkFail: '失败',
      checksEmpty: '自检没有返回任何检查项。',

      contactsTitleGroups: '监听分组（{groups}）· 联系人（{contacts}）',
      contactsHint: '同一个工作区可以挂多位联系人；每位联系人使用独立会话。',
      contactsIdentityHint: '联系人只能从钉钉通讯录选择；同一个人不能重复。',
      colWorkspace: '绑定工作区',
      colAuto: '允许真实发送',
      groupIndex: '第 {n} 组',
      searchPlaceholder: '搜索钉钉通讯录姓名…',
      searchAria: '搜索钉钉联系人',
      searching: '搜索中…',
      searchEmpty: '没搜到匹配的联系人，换关键词试试',
      cancel: '取消',
      addContactToGroup: '添加联系人',
      addGroup: '新增分组',
      remove: '移除',
      deleteGroup: '删除本组',
      groupNoMembers: '还没有添加联系人',
      groupWorkspaceRequired: '第 {n} 组还没有选择工作区',
      groupMembersRequired: '第 {n} 组还没有添加联系人',
      duplicateContact: '联系人 {name} 重复',
      groupMixedHint: '组内策略不一致，切换将统一所有人',
      contactsEmpty: '还没有分组：点「新增分组」选择工作区，再添加联系人。',
      noWorkspaces: '未取到工作区列表；请先在 DSH 中打开一个工作区再回来。',
      workspacePlaceholder: '选择工作区',
      workspaceMissing: '{id}（未在列表中）',
      autoOn: '允许',
      autoOff: '仅草稿',
      contactNameRequired: '联系人缺少 name',
      contactIdentityRequired: '请先从通讯录选择联系人',

      behaviorTitle: '行为设置',
      enabledLabel: '总开关',
      enabledHint: '关掉后不读取、不生成、不发送。',
      modeLabel: '模式',
      modeDraft: '只出草稿',
      modeDraftHint: '只把回复写成草稿，不发送。',
      modeConfirm: '人工确认后发送',
      modeConfirmHint: '回复进入待确认列表，由你决定发送或丢弃。',
      modeAuto: '直接发送',
      modeAutoHint: '自动发送；命中护栏或限流时仍降级为草稿。',
      pollLabel: '轮询间隔（秒）',
      pollHint: '10–3600',
      quietLabel: '静默时段',
      quietHint: '命中时段只出草稿，不发送。',
      quietStart: '开始',
      quietEnd: '结束',
      maxRepliesLabel: '每小时上限',
      maxCharsLabel: '回复字数上限',
      timeZoneNote: '时区：{tz}',
      invalidPollInterval: '轮询间隔需为 10–3600 的整数',
      invalidMaxRepliesPerHour: '每小时上限需为 1–120 的整数',
      invalidMaxReplyChars: '回复字数上限需为 20–4000 的整数',

      draftsTitle: '待确认草稿',
      draftsHint: '来自 confirm 模式或降级的回复，等待你决定。',
      draftsEmpty: '没有待确认的草稿。',
      send: '发送',
      discard: '丢弃',
      sending: '发送中…',
      discarding: '丢弃中…',
      sendDone: '已发送',
      discardDone: '已丢弃',
      draftAt: '生成于 {time}',
      draftMissingContact: '草稿缺少联系人名称',

      recentDraftsTitle: '最近草稿',
      recentDraftsHint: '最近生成的草稿，新的在上。',
      recentDraftsEmpty: '还没有生成过草稿。',

      auditTitle: '最近审计',
      auditHint: '最近 10 条，新的在上。',
      auditEmpty: '还没有审计记录。',
      kindReply: '回复',
      kindDraft: '草稿',
      kindSkip: '跳过',
      kindBlocked: '拦截',
      kindError: '错误',
      kindSent: '发送',
      kindPaused: '急停',
      kindDiscarded: '丢弃',

      saveTitle: '保存修改',
      saveHint: '保存后立即热生效；刷新会丢弃未保存的修改。',
      save: '保存',
      saving: '保存中…',
      revert: '撤销',
      dirty: '有未保存的修改',
      savedToast: '已保存',
      savedToastFile: '已保存到状态目录 config.json',
      noChanges: '没有需要保存的修改',
    };

    const EN = {
      sectionLabel: 'DingTalk auto-answer',
      sectionDesc: 'When someone asks you on DingTalk, the agent looks things up and answers for you.',

      loading: 'Loading plugin state…',
      loadFailed: 'Failed to load state',
      retry: 'Retry',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      refreshed: 'Refreshed',
      refreshedDiscard: 'Refreshed; unsaved edits were discarded',
      diagnose: 'Run diagnostics',
      diagnosing: 'Diagnosing…',
      diagnoseDone: 'Diagnostics finished',
      unknownError: 'Unknown error',
      timeout: 'Request timed out, try again later',
      badResponse: 'The host returned an unreadable response',
      notAvailable: 'not available',
      dash: '—',

      statusTitle: 'Runtime status',
      authUnknown: 'dws sign-in state unknown',
      authOk: 'Signed in to dws',
      authFail: 'Not signed in to dws',
      selfUserId: 'Self userId',
      selfNick: 'Nickname',
      pauseTitle: 'Emergency stop',
      pausedOn: 'Paused: nothing is read, generated or sent',
      pausedOff: 'Running',
      pausedShort: 'Paused',
      runningShort: 'Running',
      version: 'Version',
      bootedAt: 'Started at',
      dataDir: 'Data directory',
      configSource: 'Config source',
      configSourceSettings: 'DSH settings',
      configSourceFile: 'config.json in the data directory (plugin-managed)',
      configSourceDefault: 'Built-in defaults',
      degradedWarn: 'The data directory is not writable: drafts, audit and the pause flag will not survive a restart.',
      overrideInfo: 'dataDir/config.json exists and is overriding DSH settings.',
      statsTitle: 'Counters',
      statDrafts: 'Drafts',
      statSent: 'Sent',
      statSkipped: 'Skipped',
      statBlocked: 'Blocked',
      statErrors: 'Errors',
      lastCycleLabel: 'Last check',
      cycleNever: 'No check yet',
      cycleFirstHint: 'The first check looks back over the last 15 minutes',
      cycleReadSummary: 'read {fetched} · new {fresh}',
      cycleNoNew: 'No new private messages',
      cycleConfirms: 'pending',
      cycleManual: 'Check now',
      cycleChecking: 'Checking…',
      cycleDone: 'Check finished',
      cycleHint: 'Check once now, ignoring the poll interval',
      cycleDisabledOff: 'Plugin is disabled: turn the master switch on first',
      cycleDisabledPaused: 'Emergency stop is on: release it first',
      replyModelLabel: 'Reply model',
      modelSourceConfig: 'plugin config',
      modelSourceDefault: 'DSH default',
      modelSourceProfile: 'headless profile default',
      modelEffortShort: 'effort {effort}',
      readOnlyOn: 'Read-only',
      readOnlyOff: 'Writable',
      readOnlyOnHint: 'Read-only: only looks things up, changes no files',
      readOnlyOffHint: 'Writable: the model may change workspace files',
      readOnlyLabel: 'Read-only',
      agentSectionTitle: 'Reply generation',
      agentSectionHint: 'Model and permissions used to generate replies.',
      providerLabel: 'Provider',
      modelLabel: 'Model',
      effortLabel: 'Reasoning effort',
      effortDefault: 'Model default',
      effortHint: 'Leave empty to use the model default',
      modelFollowDefault: 'Follow DSH default (current {current})',
      modelFollowDefaultPlain: 'Follow DSH default',
      modelManualHint: 'Model list unavailable; enter values manually.',
      modelLoading: 'Loading model list…',
      modelCatalogError: 'Failed to load model list: {message}',
      modelProviderError: 'Failed to list models for this provider: {message}',
      replyMarkerLabel: 'Reply marker',
      replyMarkerHint: 'Appended to every sent message so the other side knows it was not typed by you; leave empty to disable.',
      replyFormatLabel: 'Reply format',
      replyFormatMarkdown: 'Markdown (recommended; DingTalk renders bold, lists and headings)',
      replyFormatText: 'Plain text',
      replyFormatMarkdownHint: 'DingTalk renders Markdown: bold, lists and headings work; tables and code fences do not, and the model is told to avoid them',
      replyFormatTextHint: 'All Markdown markers are removed; lists use • and plain line breaks',
      attachmentsTitle: 'Reply attachments',
      attachmentsEnabled: 'Allow replies to include images/PDFs',
      attachmentsMaxCount: 'Max attachments',
      attachmentsMaxBytes: 'Max size per file (MB)',
      attachmentsCountHint: '0–5',
      attachmentsBytesHint: '1–50',
      attachmentsHint: 'DingTalk delivers them as file attachments (a separate message after the text), not inline images; only existing png/jpg/webp/gif/pdf files inside the workspace are allowed. Generating images itself requires turning read-only off and a drawing backend.',
      invalidAttachmentsCount: 'Max attachments must be an integer between 0 and 5',
      invalidAttachmentsBytes: 'Max file size must be an integer between 1 and 50 MB',
      renderTitle: 'Generated images (table / bar / flow / steps)',
      renderEnabled: 'Allow the model to output table / bar / flow / step images',
      renderMaxBlocks: 'Max images per reply',
      renderMaxRows: 'Max rows',
      renderBlocksHint: '0–3',
      renderRowsHint: '1–30',
      renderHint: 'The model only draws when it helps: it outputs a structured block, the plugin renders it to PNG on the host and sends it as a file attachment (a separate message after the text); not an inline image.',
      invalidRenderBlocks: 'Max images per reply must be an integer between 0 and 3',
      invalidRenderRows: 'Max rows must be an integer between 1 and 30',
      testReplyTitle: 'Test reply (not sent)',
      testMessageLabel: 'Incoming message',
      testMessagePlaceholder: 'Paste a message the other side might send, e.g. which contract types support the Shanghai branch title',
      testGenerate: 'Generate test reply',
      testGenerating: 'Generating… (may take 1–3 minutes)',
      testElapsed: 'waiting {seconds}s',
      testEmptyHint: 'Enter a message first',
      testCancelled: 'Cancelled; other settings keep working',
      testFailed: 'Generation failed',
      testTimeout: 'Generation timed out; the model may be busy, try again later',
      testNote: 'Uses the real generation path but sends nothing; each test starts a new session',
      testMarkerNote: 'Real sends append this at the end: {marker}',
      testMarkerNone: '(no marker)',
      testMeta: 'model {model} · {permission} · {duration}',
      testChars: '{chars} chars',
      testTruncatedWarning: 'The reply hit the {limitChars}-character limit and was truncated; the trailing "…" is the truncation mark. Raise it under Behavior → Max reply characters.',
      testRendersTitle: 'Images (preview)',
      testAttachmentsTitle: 'Attachments (checked only)',
      testPreviewNote: 'These images are previews only and are not sent; a real reply sends them as file attachments.',
      testRenderAlt: 'Test image preview',
      testRenderTypeTable: 'table',
      testRenderTypeBar: 'bar chart',
      testRenderTypeFlow: 'flow chart',
      testRenderTypeSteps: 'steps',
      testRenderNoPreview: 'Rendered: {name} ({size}) — too large to preview inline',
      testRenderFailed: 'Image not generated: {error}',
      testAttachFailed: '{path}: {error}',
      testRawToggle: 'Show the blocked raw text',
      testDurationOnly: 'took {duration}',
      durationSeconds: '{seconds}s',
      durationMinutes: '{minutes}m {seconds}s',
      checksTitle: 'Diagnostic checks',
      checkOk: 'pass',
      checkFail: 'fail',
      checksEmpty: 'Diagnostics returned no checks.',

      contactsTitleGroups: 'Watched groups ({groups}) · contacts ({contacts})',
      contactsHint: 'One workspace can host several contacts; each contact gets its own session.',
      contactsIdentityHint: 'Contacts come from the DingTalk directory; the same person cannot be added twice.',
      colWorkspace: 'Workspace',
      colAuto: 'Allow real sending',
      groupIndex: 'Group {n}',
      searchPlaceholder: 'Search DingTalk contacts by name…',
      searchAria: 'Search DingTalk contacts',
      searching: 'Searching…',
      searchEmpty: 'No matching contact, try another keyword',
      cancel: 'Cancel',
      addContactToGroup: 'Add contact',
      addGroup: 'Add group',
      remove: 'Remove',
      deleteGroup: 'Delete group',
      groupNoMembers: 'No contacts added yet',
      groupWorkspaceRequired: 'Group {n} has no workspace selected',
      groupMembersRequired: 'Group {n} has no contacts',
      duplicateContact: 'Contact {name} is duplicated',
      groupMixedHint: 'Mixed settings in this group; toggling applies to everyone',
      contactsEmpty: 'No groups yet: add a group, pick a workspace, then add contacts.',
      noWorkspaces: 'No workspace list available; open a workspace in DSH first.',
      workspacePlaceholder: 'Select a workspace',
      workspaceMissing: '{id} (not in the list)',
      autoOn: 'Allowed',
      autoOff: 'Draft only',
      contactNameRequired: 'Contact is missing a name',
      contactIdentityRequired: 'Pick a contact from the directory first',

      behaviorTitle: 'Behavior',
      enabledLabel: 'Enable plugin',
      enabledHint: 'When off, nothing is read, generated or sent.',
      modeLabel: 'Mode',
      modeDraft: 'Drafts only',
      modeDraftHint: 'Write replies as drafts, never send them.',
      modeConfirm: 'Send after confirmation',
      modeConfirmHint: 'Replies wait in the confirmation list for your decision.',
      modeAuto: 'Send automatically',
      modeAutoHint: 'Sends automatically; guard or rate limits still fall back to drafts.',
      pollLabel: 'Poll interval (seconds)',
      pollHint: '10–3600',
      quietLabel: 'Quiet hours',
      quietHint: 'During these hours replies become drafts only.',
      quietStart: 'Start',
      quietEnd: 'End',
      maxRepliesLabel: 'Replies per hour',
      maxCharsLabel: 'Max reply characters',
      timeZoneNote: 'Time zone: {tz}',
      invalidPollInterval: 'Poll interval must be an integer between 10 and 3600',
      invalidMaxRepliesPerHour: 'Replies per hour must be an integer between 1 and 120',
      invalidMaxReplyChars: 'Max reply characters must be an integer between 20 and 4000',

      draftsTitle: 'Awaiting confirmation',
      draftsHint: 'Replies from confirm mode or downgraded sends, waiting for your decision.',
      draftsEmpty: 'Nothing waiting for confirmation.',
      send: 'Send',
      discard: 'Discard',
      sending: 'Sending…',
      discarding: 'Discarding…',
      sendDone: 'Sent',
      discardDone: 'Discarded',
      draftAt: 'created {time}',
      draftMissingContact: 'The draft has no contact name',

      recentDraftsTitle: 'Recent drafts',
      recentDraftsHint: 'Recently generated drafts, newest first.',
      recentDraftsEmpty: 'No drafts generated yet.',

      auditTitle: 'Recent audit',
      auditHint: 'Latest 10, newest first.',
      auditEmpty: 'No audit records yet.',
      kindReply: 'reply',
      kindDraft: 'draft',
      kindSkip: 'skip',
      kindBlocked: 'blocked',
      kindError: 'error',
      kindSent: 'send',
      kindPaused: 'pause',
      kindDiscarded: 'discarded',

      saveTitle: 'Save changes',
      saveHint: 'Applies immediately; a refresh drops unsaved edits.',
      save: 'Save',
      saving: 'Saving…',
      revert: 'Revert',
      dirty: 'Unsaved changes',
      savedToast: 'Saved',
      savedToastFile: 'Saved to dataDir/config.json',
      noChanges: 'Nothing to save',
    };

    /** 客户端 cordis 上下文里的 locale 服务；不可用时为 null（此时固定中文）。 */
    let localeService = null;
    /** locale.bind(命名空间) 得到的翻译函数；不可用时为 null。 */
    let boundTranslate = null;
    /** 语言变化订阅者（组件用）。 */
    const localeListeners = new Set();

    function notifyLocale() {
      localeListeners.forEach(function (listener) {
        try {
          listener();
        } catch (error) {
          /* 单个订阅者出错不影响其他订阅者 */
        }
      });
    }

    function readActiveLocale() {
      const service = localeService;
      if (!service) return '';
      try {
        if (typeof service.getSnapshot === 'function') {
          const snapshot = service.getSnapshot();
          if (snapshot && typeof snapshot.active === 'string' && snapshot.active) return snapshot.active;
        }
      } catch (error) {
        /* 忽略：继续尝试 getLocale */
      }
      try {
        if (typeof service.getLocale === 'function') {
          const snapshot = service.getLocale();
          if (snapshot && typeof snapshot.active === 'string' && snapshot.active) return snapshot.active;
          if (snapshot && typeof snapshot.locale === 'string' && snapshot.locale) return snapshot.locale;
        }
      } catch (error) {
        /* 忽略：按中文处理 */
      }
      return '';
    }

    /** 当前界面语言：locale 服务可用时按 active 判断，否则中文。 */
    function currentLang() {
      const active = readActiveLocale().toLowerCase();
      return active.indexOf('en') === 0 ? 'en' : 'zh';
    }

    function translate(key, params) {
      let text = null;
      if (typeof boundTranslate === 'function') {
        try {
          const value = boundTranslate(key);
          if (typeof value === 'string' && value.length > 0 && value !== key) text = value;
        } catch (error) {
          text = null;
        }
      }
      if (text === null) {
        const dict = currentLang() === 'en' ? EN : ZH;
        if (typeof dict[key] === 'string') text = dict[key];
        else if (typeof ZH[key] === 'string') text = ZH[key];
        else text = key;
      }
      if (params) {
        const names = Object.keys(params);
        for (let index = 0; index < names.length; index += 1) {
          const name = names[index];
          text = text.split('{' + name + '}').join(String(params[name]));
        }
      }
      return text;
    }

    /* ============================== 端点 ============================== */

    const API_TIMEOUT_MS = 60000;
    /** 模拟回答要真的查资料+生成，可能跑 1–3 分钟，单独放宽超时。 */
    const TEST_REPLY_TIMEOUT_MS = 240000;

    function apiUrl(name) {
      return new URL('/dsh-dingtalk-self/api/' + name, document.baseURI).pathname;
    }

    function request(url, init, timeoutMs) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const external = init && init.signal ? init.signal : null;
      let detach = null;
      if (controller && external) {
        if (external.aborted) {
          try {
            controller.abort();
          } catch (error) {
            /* 忽略 */
          }
        } else if (typeof external.addEventListener === 'function') {
          const forward = function () {
            try {
              controller.abort();
            } catch (error) {
              /* 忽略 */
            }
          };
          external.addEventListener('abort', forward);
          detach = function () {
            if (typeof external.removeEventListener === 'function') external.removeEventListener('abort', forward);
          };
        }
      }
      const limit = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : API_TIMEOUT_MS;
      const timer = controller
        ? setTimeout(function () {
            try {
              controller.abort();
            } catch (error) {
              /* 忽略 */
            }
          }, limit)
        : null;
      const options = Object.assign({}, init);
      if (controller) options.signal = controller.signal;
      return fetch(url, options).finally(function () {
        if (timer !== null) clearTimeout(timer);
        if (detach) detach();
      });
    }

    async function readJson(response) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' && payload.error ? payload.error : 'HTTP ' + response.status;
        throw new Error(message);
      }
      if (!payload || typeof payload !== 'object') throw new Error(translate('badResponse'));
      // 契约：业务失败也是 HTTP 200 + { ok:false, error }，统一展示 error。
      if (payload.ok !== true) {
        const message = typeof payload.error === 'string' && payload.error ? payload.error : translate('unknownError');
        throw new Error(message);
      }
      return payload;
    }

    async function fetchState() {
      const response = await request(apiUrl('state'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      return readJson(response);
    }

    async function fetchModels() {
      const response = await request(apiUrl('models'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      return readJson(response);
    }

    async function postJson(name, body, timeoutMs) {
      const response = await request(
        apiUrl(name),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body === undefined ? {} : body),
        },
        timeoutMs
      );
      return readJson(response);
    }

    /** 和 postJson 相同，但把 { ok:false, error, raw… } 也交回调用方自行分支。 */
    async function postJsonPayload(name, body, timeoutMs, signal) {
      const response = await request(
        apiUrl(name),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body === undefined ? {} : body),
          signal: signal,
        },
        timeoutMs
      );
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' && payload.error ? payload.error : 'HTTP ' + response.status;
        const failure = new Error(message);
        failure.payload = payload;
        throw failure;
      }
      if (!payload || typeof payload !== 'object') throw new Error(translate('badResponse'));
      return payload;
    }

    function messageOf(error) {
      if (!error) return translate('unknownError');
      const name = typeof error.name === 'string' ? error.name : '';
      if (name === 'AbortError') return translate('timeout');
      const message = typeof error.message === 'string' ? error.message.trim() : '';
      if (message) return message;
      return translate('unknownError');
    }

    /* ============================== 配置辅助 ============================== */

    const EDIT_MODES = { draft: true, confirm: true, auto: true };
    const EFFORT_OPTIONS = ['low', 'medium', 'high', 'max'];
    const MODE_OPTIONS = [
      { value: 'draft', labelKey: 'modeDraft', hintKey: 'modeDraftHint' },
      { value: 'confirm', labelKey: 'modeConfirm', hintKey: 'modeConfirmHint' },
      { value: 'auto', labelKey: 'modeAuto', hintKey: 'modeAutoHint' },
    ];
    const RENDER_TYPE_KEYS = {
      table: 'testRenderTypeTable',
      bar: 'testRenderTypeBar',
      flow: 'testRenderTypeFlow',
      steps: 'testRenderTypeSteps',
    };
    const AUDIT_KIND_KEYS = {
      reply: 'kindReply',
      draft: 'kindDraft',
      skip: 'kindSkip',
      blocked: 'kindBlocked',
      error: 'kindError',
      sent: 'kindSent',
      send: 'kindSent',
      paused: 'kindPaused',
      pause: 'kindPaused',
      discarded: 'kindDiscarded',
    };

    function cloneConfig(config) {
      if (!config || typeof config !== 'object') return {};
      try {
        return JSON.parse(JSON.stringify(config));
      } catch (error) {
        return {};
      }
    }

    function isHhMm(value) {
      return typeof value === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
    }

    function normalizeQuietHours(value, fallback) {
      const base = fallback && typeof fallback === 'object' ? fallback : {};
      const source = value && typeof value === 'object' ? value : {};
      return {
        enabled: source.enabled === true,
        start: isHhMm(source.start) ? source.start : isHhMm(base.start) ? base.start : '22:00',
        end: isHhMm(source.end) ? source.end : isHhMm(base.end) ? base.end : '08:00',
      };
    }

    function toInt(value, fallback) {
      const text = typeof value === 'string' ? value.trim() : value;
      const numeric = Number(text);
      return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
    }

    function isIntInRange(value, min, max) {
      const text = typeof value === 'string' ? value.trim() : value;
      if (text === '' || text === null || text === undefined) return false;
      const numeric = Number(text);
      return Number.isInteger(numeric) && numeric >= min && numeric <= max;
    }

    function valueText(value) {
      return value === null || value === undefined ? '' : String(value);
    }

    function textOf(value) {
      return value === null || value === undefined ? '' : String(value);
    }

    function formatClock(value, lang) {
      if (typeof value !== 'string' || !value) return translate('dash');
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      try {
        return date.toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false });
      } catch (error) {
        return date.toTimeString().slice(0, 8);
      }
    }

    function formatDurationMs(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) return translate('dash');
      if (ms < 60000) return translate('durationSeconds', { seconds: (Math.round(ms / 100) / 10).toFixed(1) });
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return translate('durationMinutes', { minutes: minutes, seconds: seconds });
    }

    function formatBytes(value) {
      const bytes = Number(value);
      if (!Number.isFinite(bytes) || bytes < 0) return translate('dash');
      if (bytes < 1024) return Math.round(bytes) + ' B';
      if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
      return (Math.round((bytes / (1024 * 1024)) * 10) / 10).toFixed(1) + ' MB';
    }

    function renderTypeLabel(type) {
      const raw = textOf(type).trim();
      const key = RENDER_TYPE_KEYS[raw];
      return key ? translate(key) : raw || translate('dash');
    }

    function toCount(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
    }

    function formatTime(value, lang) {
      if (typeof value !== 'string' || !value) return translate('dash');
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      try {
        return date.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false });
      } catch (error) {
        return date.toLocaleString();
      }
    }

    function auditKindLabel(kind) {
      const key = AUDIT_KIND_KEYS[String(kind === null || kind === undefined ? '' : kind).trim()];
      if (key) return translate(key);
      const raw = textOf(kind).trim();
      return raw || translate('dash');
    }

    /** 组内成员的通讯录身份键：优先 openDingTalkId，其次 userId。 */
    function groupIdentity(member) {
      if (!member || typeof member !== 'object') return '';
      return textOf(member.openDingTalkId).trim() || textOf(member.userId).trim();
    }

    /** 完全空的新组（未选工作区、也没有成员）：保存时自动丢弃。 */
    function isGroupBlank(group) {
      if (!group || typeof group !== 'object') return true;
      const workspaceId = textOf(group.workspaceId).trim();
      const members = Array.isArray(group.members) ? group.members : [];
      return !workspaceId && members.length === 0;
    }

    /** 视图分组 → 扁平 contacts[]（后台数据模型保持不变）。 */
    function flattenGroups(groups) {
      const contacts = [];
      const list = Array.isArray(groups) ? groups : [];
      for (let index = 0; index < list.length; index += 1) {
        const group = list[index];
        if (!group || typeof group !== 'object' || isGroupBlank(group)) continue;
        const workspaceId = textOf(group.workspaceId).trim();
        const members = Array.isArray(group.members) ? group.members : [];
        for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
          const member = members[memberIndex] && typeof members[memberIndex] === 'object' ? members[memberIndex] : {};
          contacts.push(
            Object.assign({}, member, {
              name: textOf(member.name).trim(),
              openDingTalkId: textOf(member.openDingTalkId).trim(),
              userId: textOf(member.userId).trim(),
              workspaceId: workspaceId,
              autoReply: member.autoReply === true,
            })
          );
        }
      }
      return contacts;
    }

    /** 分组视图的保存前校验（空组自动丢弃，不报错）。 */
    function collectGroupErrors(groups) {
      const errors = [];
      const seen = new Set();
      const list = Array.isArray(groups) ? groups : [];
      for (let index = 0; index < list.length; index += 1) {
        const group = list[index];
        if (!group || typeof group !== 'object' || isGroupBlank(group)) continue;
        const number = index + 1;
        const workspaceId = textOf(group.workspaceId).trim();
        const members = Array.isArray(group.members) ? group.members : [];
        if (!workspaceId) errors.push(translate('groupWorkspaceRequired', { n: number }));
        if (members.length === 0) {
          errors.push(translate('groupMembersRequired', { n: number }));
          continue;
        }
        for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
          const member = members[memberIndex] && typeof members[memberIndex] === 'object' ? members[memberIndex] : {};
          const identity = groupIdentity(member);
          const displayName = textOf(member.name).trim() || identity || translate('notAvailable');
          if (!textOf(member.name).trim()) errors.push(translate('contactNameRequired'));
          if (!identity) errors.push(translate('contactIdentityRequired'));
          if (identity) {
            if (seen.has(identity)) errors.push(translate('duplicateContact', { name: displayName }));
            else seen.add(identity);
          }
        }
      }
      return errors;
    }

    /**
     * 计算保存补丁：只把真正变化的字段放进 patch，并做前端可判定的校验。
     * contacts 是数组语义（整体替换）：由分组视图展平后比较。
     */
    function collectPatch(draft, config, groups) {
      const patch = {};
      const errors = [];
      if (!draft || typeof draft !== 'object' || !config || typeof config !== 'object') {
        return { patch: patch, errors: errors };
      }

      if (typeof draft.enabled === 'boolean' && draft.enabled !== (config.enabled === true)) patch.enabled = draft.enabled;

      const mode = typeof draft.mode === 'string' && EDIT_MODES[draft.mode] === true ? draft.mode : 'draft';
      if (mode !== config.mode) patch.mode = mode;

      if (!isIntInRange(draft.pollIntervalSeconds, 10, 3600)) {
        errors.push(translate('invalidPollInterval'));
      } else {
        const poll = toInt(draft.pollIntervalSeconds, config.pollIntervalSeconds);
        if (poll !== config.pollIntervalSeconds) patch.pollIntervalSeconds = poll;
      }

      const quiet = normalizeQuietHours(draft.quietHours, config.quietHours);
      if (JSON.stringify(quiet) !== JSON.stringify(normalizeQuietHours(config.quietHours, undefined))) {
        patch.quietHours = quiet;
      }

      const draftLimits = draft.limits && typeof draft.limits === 'object' ? draft.limits : {};
      const configLimits = config.limits && typeof config.limits === 'object' ? config.limits : {};
      const nextLimits = Object.assign({}, configLimits, draftLimits);
      if (!isIntInRange(draftLimits.maxRepliesPerHour, 1, 120)) errors.push(translate('invalidMaxRepliesPerHour'));
      else nextLimits.maxRepliesPerHour = toInt(draftLimits.maxRepliesPerHour, configLimits.maxRepliesPerHour);
      if (!isIntInRange(draftLimits.maxReplyChars, 20, 4000)) errors.push(translate('invalidMaxReplyChars'));
      else nextLimits.maxReplyChars = toInt(draftLimits.maxReplyChars, configLimits.maxReplyChars);
      if (JSON.stringify(nextLimits) !== JSON.stringify(configLimits)) patch.limits = nextLimits;

      const replyMarker = textOf(draft.replyMarker).trim();
      if (replyMarker !== textOf(config.replyMarker).trim()) patch.replyMarker = replyMarker;

      const replyFormat = draft.replyFormat === 'text' ? 'text' : 'markdown';
      if (replyFormat !== (config.replyFormat === 'text' ? 'text' : 'markdown')) patch.replyFormat = replyFormat;

      const draftRender = draft.render && typeof draft.render === 'object' ? draft.render : {};
      const configRender = config.render && typeof config.render === 'object' ? config.render : {};
      const configMaxBlocks = toInt(configRender.maxBlocks, 1);
      const configMaxRows = toInt(configRender.maxRows, 10);
      const maxBlocksRaw = draftRender.maxBlocks !== undefined ? draftRender.maxBlocks : configMaxBlocks;
      const maxRowsRaw = draftRender.maxRows !== undefined ? draftRender.maxRows : configMaxRows;
      const renderBlocksOk = isIntInRange(maxBlocksRaw, 0, 3);
      const renderRowsOk = isIntInRange(maxRowsRaw, 1, 30);
      if (!renderBlocksOk) errors.push(translate('invalidRenderBlocks'));
      if (!renderRowsOk) errors.push(translate('invalidRenderRows'));
      if (renderBlocksOk && renderRowsOk) {
        const nextRender = {
          enabled: draftRender.enabled === true,
          maxBlocks: toInt(maxBlocksRaw, configMaxBlocks),
          maxRows: toInt(maxRowsRaw, configMaxRows),
        };
        if (
          nextRender.enabled !== (configRender.enabled === true) ||
          nextRender.maxBlocks !== configMaxBlocks ||
          nextRender.maxRows !== configMaxRows
        ) {
          patch.render = nextRender;
        }
      }

      const draftAttachments = draft.attachments && typeof draft.attachments === 'object' ? draft.attachments : {};
      const configAttachments = config.attachments && typeof config.attachments === 'object' ? config.attachments : {};
      const configMaxCount = toInt(configAttachments.maxCount, 2);
      const configMaxBytes = toInt(configAttachments.maxBytes, 10 * 1024 * 1024);
      const touchedMb = draftAttachments.maxMb !== undefined;
      const maxCountRaw = draftAttachments.maxCount !== undefined ? draftAttachments.maxCount : configMaxCount;
      const maxMbRaw = touchedMb
        ? draftAttachments.maxMb
        : Number.isFinite(Number(configAttachments.maxBytes)) && Number(configAttachments.maxBytes) > 0
          ? Math.round(Number(configAttachments.maxBytes) / (1024 * 1024))
          : 10;
      const attachmentsCountOk = isIntInRange(maxCountRaw, 0, 5);
      const attachmentsMbOk = isIntInRange(maxMbRaw, 1, 50);
      if (!attachmentsCountOk) errors.push(translate('invalidAttachmentsCount'));
      if (!attachmentsMbOk) errors.push(translate('invalidAttachmentsBytes'));
      if (attachmentsCountOk && attachmentsMbOk) {
        const nextAttachments = {
          enabled: draftAttachments.enabled === true,
          maxCount: toInt(maxCountRaw, configMaxCount),
          maxBytes: touchedMb ? toInt(maxMbRaw, 10) * 1024 * 1024 : configMaxBytes,
        };
        if (
          nextAttachments.enabled !== (configAttachments.enabled === true) ||
          nextAttachments.maxCount !== configMaxCount ||
          nextAttachments.maxBytes !== configMaxBytes
        ) {
          patch.attachments = nextAttachments;
        }
      }

      const draftAgent = draft.agent && typeof draft.agent === 'object' ? draft.agent : {};
      const configAgent = config.agent && typeof config.agent === 'object' ? config.agent : {};
      const nextAgent = Object.assign({}, configAgent, draftAgent, {
        provider: textOf(draftAgent.provider).trim(),
        model: textOf(draftAgent.model).trim(),
        reasoningEffort: textOf(draftAgent.reasoningEffort).trim(),
        readOnly: draftAgent.readOnly !== false,
      });
      if (JSON.stringify(nextAgent) !== JSON.stringify(configAgent)) patch.agent = nextAgent;

      const groupsList = Array.isArray(groups) ? groups : [];
      errors.push.apply(errors, collectGroupErrors(groupsList));
      const flattened = flattenGroups(groupsList);
      const configContacts = Array.isArray(config.contacts) ? config.contacts : [];
      if (JSON.stringify(flattened) !== JSON.stringify(configContacts)) patch.contacts = flattened;

      return { patch: patch, errors: errors };
    }

    /* ============================== 样式（仅主题 token） ============================== */

    const CSS = `
.dws-root { display: flex; flex-direction: column; gap: 14px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.55; padding: 2px 0 10px; }
.dws-root, .dws-root * { box-sizing: border-box; }
.dws-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.dws-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dws-head-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dws-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dws-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dws-sub { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-muted { color: var(--dsw-alias-label-secondary); }
.dws-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; }
.dws-page-head { display: flex; flex-direction: column; gap: 2px; padding: 0 2px; }
.dws-page-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dws-page-desc { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-row { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }
.dws-row-start { align-items: flex-start; }
.dws-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px 16px; }
.dws-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dws-field-inline { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dws-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-input, .dws-select { width: 100%; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 5px 8px; min-width: 0; }
.dws-input:focus, .dws-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary); }
.dws-input[disabled] { opacity: 0.6; cursor: not-allowed; }
.dws-input[type="number"] { max-width: 140px; }
.dws-input[type="time"] { max-width: 130px; }
.dws-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.dws-btn:hover:not([disabled]) { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dws-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
.dws-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.dws-btn-primary:hover:not([disabled]) { color: var(--dsw-alias-bg-base); opacity: 0.92; }
.dws-btn-danger:hover:not([disabled]) { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dws-btn-small { padding: 3px 8px; font-size: 12px; }
.dws-badge { display: inline-flex; align-items: center; gap: 5px; border: 1px solid currentColor; border-radius: 999px; padding: 1px 9px; font-size: 12px; line-height: 1.5; white-space: nowrap; }
.dws-badge-ok { color: var(--dsw-alias-state-success-primary); }
.dws-badge-warn { color: var(--dsw-alias-state-warn-primary); }
.dws-badge-error { color: var(--dsw-alias-state-error-primary); }
.dws-badge-muted { color: var(--dsw-alias-label-secondary); }
.dws-badge-brand { color: var(--dsw-alias-brand-primary); }
.dws-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.dws-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px 16px; }
.dws-kv-item { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.dws-kv-key { color: var(--dsw-alias-label-secondary); font-size: 12px; flex: none; }
.dws-kv-val { color: var(--dsw-alias-label-primary); font-size: 12px; overflow-wrap: anywhere; }
.dws-banner { margin: 0; border: 1px solid var(--dsw-alias-border-l1); border-left: 3px solid var(--dsw-alias-state-warn-primary); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.dws-banner-error { border-left-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dws-error-text { margin: 0; font-size: 12px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dws-stats { display: flex; flex-wrap: wrap; gap: 6px; }
.dws-textarea { resize: vertical; min-height: 64px; line-height: 1.5; font-family: inherit; }
.dws-warn-text { margin: 0; font-size: 12px; color: var(--dsw-alias-state-warn-primary); overflow-wrap: anywhere; }
.dws-render-list { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dws-render-item { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px; background: var(--dsw-alias-bg-layer-1); min-width: 0; }
.dws-render-img { display: block; max-width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); }
.dws-attach-list { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dws-attach-item { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dws-test-result { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; background: var(--dsw-alias-bg-layer-2); min-width: 0; }
.dws-test-reply-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dws-test-error { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 10px 12px; min-width: 0; }
.dws-test-raw { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-pre { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: var(--dsw-alias-label-secondary); max-height: 240px; overflow-y: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dws-model-value { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; min-width: 0; }
.dws-agent-box { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 10px; min-width: 0; }
.dws-full { grid-column: 1 / -1; min-width: 0; }
.dws-cycle-row { display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; font-size: 12px; min-width: 0; }
.dws-cycle-time { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dws-cycle-summary { color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.dws-cycle-muted { color: var(--dsw-alias-label-secondary); }
.dws-cycle-skipped { color: var(--dsw-alias-state-warn-primary); overflow-wrap: anywhere; }
.dws-stat { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 2px 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.dws-stat-num { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.dws-checks { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.dws-check-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.dws-check-name { min-width: 110px; color: var(--dsw-alias-label-primary); }
.dws-check-detail { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dws-contact-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dws-contact { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--dsw-alias-bg-layer-2); min-width: 0; }
.dws-member-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dws-member { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 6px 10px; background: var(--dsw-alias-bg-layer-1); min-width: 0; }
.dws-member-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dws-member-name { font-size: 12px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.dws-member-id { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dws-group-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; min-width: 0; }
.dws-group-actions-left, .dws-group-actions-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.dws-picker { position: relative; min-width: 0; }
.dws-picker-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dws-picker-row .dws-input { flex: 1 1 auto; min-width: 0; }
.dws-picker-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 8; max-height: 240px; overflow-y: auto; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 4px; display: flex; flex-direction: column; gap: 2px; }
.dws-picker-note { padding: 6px 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-picker-error { padding: 6px 8px; font-size: 12px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dws-picker-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; cursor: pointer; color: var(--dsw-alias-label-primary); font: inherit; }
.dws-picker-item:hover, .dws-picker-item-active { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }
.dws-picker-item-name { font-size: 12px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.dws-picker-item-id { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dws-empty { margin: 0; padding: 6px 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-primary); }
.dws-check input { accent-color: var(--dsw-alias-brand-primary); width: 14px; height: 14px; margin: 0; cursor: pointer; }
.dws-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-primary); }
.dws-radio-row { display: flex; flex-wrap: wrap; gap: 6px; }
.dws-radio { display: inline-flex; align-items: flex-start; gap: 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 7px 10px; cursor: pointer; background: var(--dsw-alias-bg-layer-2); min-width: 150px; }
.dws-radio-active { border-color: var(--dsw-alias-brand-primary); }
.dws-radio input { accent-color: var(--dsw-alias-brand-primary); margin: 2px 0 0; }
.dws-radio-text { display: flex; flex-direction: column; gap: 1px; }
.dws-radio-title { color: var(--dsw-alias-label-primary); }
.dws-radio-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dws-draft { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 9px 11px; display: flex; flex-direction: column; gap: 6px; background: var(--dsw-alias-bg-layer-2); }
.dws-draft-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dws-draft-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }
.dws-audit { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dws-audit-row { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 12px; flex-wrap: wrap; }
.dws-audit-row:last-child { border-bottom: none; }
.dws-audit-time { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dws-audit-detail { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dws-savebar-card { position: sticky; bottom: 0; z-index: 6; border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); }
.dws-toast { position: fixed; right: 20px; bottom: 20px; z-index: 20; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px 14px; font-size: 12px; background: var(--dsw-alias-bg-layer-1); }
.dws-toast-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dws-toast-error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
`;

    /* ============================== 组件辅助 ============================== */

    function useLang(props) {
      const [lang, setLang] = React.useState(currentLang());
      React.useEffect(function () {
        const listener = function () {
          setLang(currentLang());
        };
        localeListeners.add(listener);
        if (typeof window !== 'undefined' && window.addEventListener) {
          window.addEventListener('languagechange', listener);
        }
        return function () {
          localeListeners.delete(listener);
          if (typeof window !== 'undefined' && window.removeEventListener) {
            window.removeEventListener('languagechange', listener);
          }
        };
      }, []);
      React.useEffect(function () {
        // 槽位若把 ctx 透传下来，用它补上 apply 阶段拿不到的 locale 服务。
        if (!localeService && props && props.ctx && props.ctx.locale) {
          localeService = props.ctx.locale;
          setLang(currentLang());
        }
      }, []);
      return lang;
    }

    function badge(kind, text) {
      return h('span', { className: 'dws-badge dws-badge-' + kind }, h('span', { className: 'dws-dot' }), h('span', null, text));
    }

    function kvItem(key, value, extraClass) {
      return h(
        'div',
        { className: 'dws-kv-item' },
        h('span', { className: 'dws-kv-key' }, key),
        h('span', { className: extraClass ? 'dws-kv-val ' + extraClass : 'dws-kv-val' }, value)
      );
    }

    function statChip(label, value) {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
      return h('span', { className: 'dws-stat' }, h('span', null, label), h('strong', { className: 'dws-stat-num' }, String(numeric)));
    }

    function emptyHint(text) {
      return h('p', { className: 'dws-empty' }, text);
    }

    /* ============================== 设置页 ============================== */

    function SettingsPage(props) {
      const lang = useLang(props);
      const t = React.useCallback(function (key, params) {
        return translate(key, params);
      }, [lang]);

      const [status, setStatus] = React.useState('loading');
      const [data, setData] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [loadError, setLoadError] = React.useState(null);
      const [actionError, setActionError] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const [busy, setBusy] = React.useState(null);
      const [checks, setChecks] = React.useState(null);
      const [lastCycleOverride, setLastCycleOverride] = React.useState(null);
      const [modelCatalog, setModelCatalog] = React.useState(null);
      const [modelLoadError, setModelLoadError] = React.useState('');
      const [modelLoading, setModelLoading] = React.useState(true);
      const [testMessage, setTestMessage] = React.useState('');
      const [testPhase, setTestPhase] = React.useState('idle');
      const [testResult, setTestResult] = React.useState(null);
      const [testError, setTestError] = React.useState('');
      const [testRaw, setTestRaw] = React.useState('');
      const [testDurationMs, setTestDurationMs] = React.useState(0);
      const [testElapsed, setTestElapsed] = React.useState(0);
      const testAbortRef = React.useRef(null);
      const testTimerRef = React.useRef(null);
      const testCancelRef = React.useRef(false);
      const [contactSearch, setContactSearch] = React.useState({});
      const [groups, setGroups] = React.useState([]);
      const [pickerGroupKey, setPickerGroupKey] = React.useState(null);
      const dataRef = React.useRef(null);
      const groupKeySeq = React.useRef(0);
      const searchTimers = React.useRef({});
      const searchSeq = React.useRef({});
      const searchGeneration = React.useRef(0);

      /** 分组视图用稳定 key；重建分组时会重新分配。 */
      function newGroupKey() {
        groupKeySeq.current += 1;
        return 'group-' + String(groupKeySeq.current);
      }

      /** 扁平 contacts[] → 视图分组；按 workspaceId 首次出现顺序。 */
      function buildGroupsFromContacts(contacts) {
        const list = Array.isArray(contacts) ? contacts : [];
        const result = [];
        const byWorkspace = new Map();
        list.forEach(function (contact) {
          if (!contact || typeof contact !== 'object') return;
          const workspaceId = textOf(contact.workspaceId).trim();
          let group = byWorkspace.get(workspaceId);
          if (!group) {
            group = { key: newGroupKey(), workspaceId: workspaceId, members: [] };
            byWorkspace.set(workspaceId, group);
            result.push(group);
          }
          group.members.push(Object.assign({}, contact));
        });
        return result;
      }

      /** 拉全量 state。mode: 'initial' | 'silent'（保留未保存编辑） | 'force'（重置草稿）。 */
      const load = React.useCallback(async function (mode) {
        const silent = mode === 'silent';
        if (!silent) {
          setStatus(function (previous) {
            return previous === 'ready' ? previous : 'loading';
          });
          setLoadError(null);
          setActionError(null);
        }
        try {
          const next = await fetchState();
          const previous = dataRef.current;
          dataRef.current = next;
          setData(next);
          setStatus('ready');
          const previousJson = previous ? JSON.stringify(previous.config === undefined ? null : previous.config) : null;
          const nextJson = JSON.stringify(next.config === undefined ? null : next.config);
          if (mode === 'force' || previousJson === null || previousJson !== nextJson) {
            setDraft(cloneConfig(next.config));
            setGroups(buildGroupsFromContacts(next.config ? next.config.contacts : []));
            resetContactUi();
          }
          return next;
        } catch (error) {
          const message = messageOf(error);
          setStatus(function (previous) {
            return previous === 'ready' ? 'ready' : 'error';
          });
          if (silent) {
            setActionError(message);
          } else {
            setLoadError(message);
            if (dataRef.current) setActionError(message);
          }
          return null;
        }
      }, []);

      React.useEffect(function () {
        load('initial');
      }, [load]);

      async function loadModels() {
        setModelLoading(true);
        try {
          const payload = await fetchModels();
          setModelCatalog(payload);
          setModelLoadError('');
          return payload;
        } catch (error) {
          setModelCatalog(null);
          setModelLoadError(messageOf(error));
          return null;
        } finally {
          setModelLoading(false);
        }
      }

      React.useEffect(function () {
        loadModels();
      }, []);

      React.useEffect(function () {
        return function () {
          const timers = searchTimers.current;
          Object.keys(timers).forEach(function (key) {
            clearTimeout(timers[key]);
          });
          searchTimers.current = {};
          if (testTimerRef.current) {
            clearInterval(testTimerRef.current);
            testTimerRef.current = null;
          }
          if (testAbortRef.current) {
            try {
              testAbortRef.current.abort();
            } catch (error) {
              /* 忽略 */
            }
            testAbortRef.current = null;
          }
        };
      }, []);

      React.useEffect(function () {
        if (!toast) return undefined;
        const timer = setTimeout(function () {
          setToast(null);
        }, 3200);
        return function () {
          clearTimeout(timer);
        };
      }, [toast]);

      const patchResult = React.useMemo(
        function () {
          if (!draft || !data) return { patch: {}, errors: [] };
          return collectPatch(draft, data.config || {}, groups);
        },
        [draft, data, groups, t]
      );
      const dirty = Object.keys(patchResult.patch).length > 0 || patchResult.errors.length > 0;

      function fail(error) {
        const message = messageOf(error);
        setActionError(message);
        setToast({ kind: 'error', text: message });
      }

      function updateDraft(updater) {
        setDraft(function (previous) {
          if (!previous) return previous;
          return updater(previous);
        });
      }

      function setField(key, value) {
        updateDraft(function (previous) {
          const next = Object.assign({}, previous);
          next[key] = value;
          return next;
        });
      }

      function setLimit(key, value) {
        updateDraft(function (previous) {
          const limits = Object.assign({}, previous.limits && typeof previous.limits === 'object' ? previous.limits : {});
          limits[key] = value;
          return Object.assign({}, previous, { limits: limits });
        });
      }

      function setQuietHours(patch) {
        updateDraft(function (previous) {
          const quiet = previous.quietHours && typeof previous.quietHours === 'object' ? previous.quietHours : {};
          return Object.assign({}, previous, { quietHours: Object.assign({}, quiet, patch) });
        });
      }

      function modelProviders() {
        const payload = modelCatalog && typeof modelCatalog === 'object' ? modelCatalog : null;
        const list = payload && Array.isArray(payload.providers) ? payload.providers : [];
        return list.filter(function (provider) {
          return provider && typeof provider === 'object' && provider.id !== null && provider.id !== undefined && String(provider.id) !== '';
        });
      }

      function modelCurrent() {
        const payload = modelCatalog && typeof modelCatalog === 'object' ? modelCatalog : null;
        const fromCatalog = payload && payload.current && typeof payload.current === 'object' ? payload.current : null;
        const fromState = data && data.model && typeof data.model === 'object' ? data.model : null;
        const source = fromCatalog || fromState || {};
        return {
          provider: textOf(source.provider),
          model: textOf(source.model),
          reasoningEffort: textOf(source.reasoningEffort),
        };
      }

      function setRenderField(key, value) {
        updateDraft(function (previous) {
          const render = Object.assign({}, previous.render && typeof previous.render === 'object' ? previous.render : {});
          render[key] = value;
          return Object.assign({}, previous, { render: render });
        });
      }

      function setAttachmentField(key, value) {
        updateDraft(function (previous) {
          const attachments = Object.assign({}, previous.attachments && typeof previous.attachments === 'object' ? previous.attachments : {});
          attachments[key] = value;
          return Object.assign({}, previous, { attachments: attachments });
        });
      }

      function setAgentField(key, value) {
        updateDraft(function (previous) {
          const agent = Object.assign({}, previous.agent && typeof previous.agent === 'object' ? previous.agent : {});
          agent[key] = value;
          return Object.assign({}, previous, { agent: agent });
        });
      }

      function setAgentFields(patch) {
        updateDraft(function (previous) {
          const agent = Object.assign({}, previous.agent && typeof previous.agent === 'object' ? previous.agent : {});
          Object.assign(agent, patch);
          return Object.assign({}, previous, { agent: agent });
        });
      }

      function chooseProvider(providerId) {
        const nextProvider = textOf(providerId).trim();
        if (!nextProvider) {
          setAgentFields({ provider: '', model: '' });
          return;
        }
        const provider = modelProviders().find(function (item) {
          return String(item.id) === nextProvider;
        });
        const models = provider && Array.isArray(provider.models)
          ? provider.models.filter(function (model) {
              return model && typeof model === 'object' && model.id !== null && model.id !== undefined;
            })
          : [];
        setAgentFields({ provider: nextProvider, model: models.length > 0 ? String(models[0].id) : '' });
      }

      function addGroup() {
        const key = newGroupKey();
        setGroups(function (previous) {
          return previous.concat([{ key: key, workspaceId: '', members: [] }]);
        });
      }

      function removeGroup(groupKey) {
        setGroups(function (previous) {
          return previous.filter(function (group) {
            return group.key !== groupKey;
          });
        });
        stopSearchTimer(groupKey);
        deleteSearchState(groupKey);
        setPickerGroupKey(function (previous) {
          return previous === groupKey ? null : previous;
        });
      }

      function setGroupWorkspace(groupKey, workspaceId) {
        setGroups(function (previous) {
          return previous.map(function (group) {
            return group.key === groupKey ? Object.assign({}, group, { workspaceId: workspaceId }) : group;
          });
        });
      }

      function removeMember(groupKey, memberIndex) {
        setGroups(function (previous) {
          return previous.map(function (group) {
            if (group.key !== groupKey) return group;
            const members = group.members.slice();
            if (memberIndex < 0 || memberIndex >= members.length) return group;
            members.splice(memberIndex, 1);
            return Object.assign({}, group, { members: members });
          });
        });
      }

      function toggleGroupAutoReply(groupKey, value) {
        const nextValue = value === true;
        setGroups(function (previous) {
          return previous.map(function (group) {
            if (group.key !== groupKey) return group;
            return Object.assign({}, group, {
              members: group.members.map(function (member) {
                return Object.assign({}, member, { autoReply: nextValue });
              }),
            });
          });
        });
      }

      function toggleGroupPicker(groupKey) {
        if (pickerGroupKey === groupKey) {
          closeGroupPicker(groupKey);
          return;
        }
        stopSearchTimer(groupKey);
        deleteSearchState(groupKey);
        setPickerGroupKey(groupKey);
      }

      function closeGroupPicker(groupKey) {
        stopSearchTimer(groupKey);
        deleteSearchState(groupKey);
        setPickerGroupKey(function (previous) {
          return previous === groupKey ? null : previous;
        });
      }

      /** 把通讯录候选人追加到指定组；重复身份会被拦下，避免保存时才报错。 */
      function appendMemberToGroup(groupKey, candidate) {
        const identity = groupIdentity(candidate);
        const displayName = textOf(candidate.name).trim() || identity || t('notAvailable');
        if (identity) {
          const duplicate = groups.some(function (group) {
            return group.members.some(function (member) {
              return groupIdentity(member) === identity;
            });
          });
          if (duplicate) {
            setSearchState(groupKey, { phase: 'error', candidates: [], error: t('duplicateContact', { name: displayName }), highlight: 0 });
            return false;
          }
        }
        const target = groups.find(function (group) {
          return group.key === groupKey;
        });
        const groupAutoReply = target && target.members.length > 0 && target.members.every(function (member) {
          return member.autoReply === true;
        });
        const member = {
          name: textOf(candidate.name),
          openDingTalkId: textOf(candidate.openDingTalkId),
          userId: textOf(candidate.userId),
          autoReply: groupAutoReply === true,
          sessionId: '',
        };
        setGroups(function (previous) {
          return previous.map(function (group) {
            if (group.key !== groupKey) return group;
            return Object.assign({}, group, { members: group.members.concat([member]) });
          });
        });
        return true;
      }

      async function refresh() {
        if (busy !== null) return;
        const hadDirty = dirty;
        setBusy('refresh');
        const next = await load('force');
        loadModels();
        setBusy(null);
        if (next) setToast({ kind: 'ok', text: hadDirty ? t('refreshedDiscard') : t('refreshed') });
      }

      async function runDiagnose() {
        if (busy !== null) return;
        setBusy('diagnose');
        setActionError(null);
        try {
          const payload = await postJson('diagnose', {});
          setChecks(Array.isArray(payload.checks) ? payload.checks : []);
          setToast({ kind: 'ok', text: t('diagnoseDone') });
        } catch (error) {
          fail(error);
        } finally {
          setBusy(null);
        }
      }

      async function runCycle() {
        if (busy !== null || !data) return;
        const enabledNow = !!(data.config && data.config.enabled === true);
        if (!enabledNow) {
          fail(new Error(t('cycleDisabledOff')));
          return;
        }
        if (data.paused === true) {
          fail(new Error(t('cycleDisabledPaused')));
          return;
        }
        setBusy('cycle');
        setActionError(null);
        try {
          const payload = await postJson('cycle', {});
          if (payload.cycle && typeof payload.cycle === 'object') setLastCycleOverride(payload.cycle);
          const next = await load('silent');
          if (next && next.lastCycle) setLastCycleOverride(null);
          setToast({ kind: 'ok', text: t('cycleDone') });
        } catch (error) {
          fail(error);
        } finally {
          setBusy(null);
        }
      }

      async function togglePause(nextPaused) {
        if (busy !== null) return;
        setBusy('pause');
        setActionError(null);
        try {
          await postJson('pause', { paused: nextPaused === true });
          await load('silent');
          setToast({ kind: 'ok', text: nextPaused ? t('pausedOn') : t('pausedOff') });
        } catch (error) {
          fail(error);
        } finally {
          setBusy(null);
        }
      }

      async function save() {
        if (busy !== null || !data) return;
        const result = collectPatch(draft || {}, data.config || {}, groups);
        const errors = Array.from(new Set(result.errors));
        if (errors.length > 0) {
          setActionError(errors[0]);
          return;
        }
        if (Object.keys(result.patch).length === 0) {
          setToast({ kind: 'ok', text: t('noChanges') });
          return;
        }
        setBusy('save');
        setActionError(null);
        try {
          const payload = await postJson('config', { patch: result.patch });
          const next = await load('force');
          if (next) {
            const source = (next && next.configSource) || (payload && payload.configSource);
            setToast({ kind: 'ok', text: source === 'file' ? t('savedToastFile') : t('savedToast') });
          }
        } catch (error) {
          fail(error);
        } finally {
          setBusy(null);
        }
      }

      function revert() {
        if (!data) return;
        setDraft(cloneConfig(data.config));
        setGroups(buildGroupsFromContacts(data.config ? data.config.contacts : []));
        resetContactUi();
        setActionError(null);
        setToast(null);
      }

      async function confirmDraft(item, action) {
        if (busy !== null) return;
        const contact = item && item.contact !== null && item.contact !== undefined ? String(item.contact) : '';
        const itemKey = item && item.key !== null && item.key !== undefined ? String(item.key) : contact;
        if (!contact) {
          fail(new Error(t('draftMissingContact')));
          return;
        }
        setBusy('confirm:' + itemKey + ':' + action);
        setActionError(null);
        try {
          await postJson('confirm', { contact: contact, action: action });
          await load('silent');
          setToast({ kind: 'ok', text: action === 'send' ? t('sendDone') : t('discardDone') });
        } catch (error) {
          fail(error);
        } finally {
          setBusy(null);
        }
      }

      /* ---------------------------- 模拟回答 ---------------------------- */

      function currentReplyMarker() {
        const config = draft || data.config || {};
        return textOf(config.replyMarker).trim();
      }

      function testModelText(model) {
        if (!model || typeof model !== 'object') return t('notAvailable');
        const provider = textOf(model.provider).trim();
        const modelId = textOf(model.model).trim();
        const effort = textOf(model.reasoningEffort).trim();
        let text = provider && modelId ? provider + '/' + modelId : modelId || provider || t('notAvailable');
        if (effort) text += ' (' + effort + ')';
        return text;
      }

      function cancelTestReply() {
        if (testPhase !== 'running') return;
        testCancelRef.current = true;
        if (testAbortRef.current) {
          try {
            testAbortRef.current.abort();
          } catch (error) {
            /* 忽略 */
          }
        }
        if (testTimerRef.current) {
          clearInterval(testTimerRef.current);
          testTimerRef.current = null;
        }
        setTestPhase('cancelled');
      }

      async function runTestReply() {
        if (testPhase === 'running') return;
        const message = testMessage.trim();
        if (!message) {
          setTestPhase('error');
          setTestError(t('testEmptyHint'));
          setTestResult(null);
          setTestRaw('');
          setTestDurationMs(0);
          return;
        }
        testCancelRef.current = false;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        testAbortRef.current = controller;
        setTestPhase('running');
        setTestError('');
        setTestResult(null);
        setTestRaw('');
        setTestDurationMs(0);
        setTestElapsed(0);
        const startedAt = Date.now();
        if (testTimerRef.current) clearInterval(testTimerRef.current);
        testTimerRef.current = setInterval(function () {
          setTestElapsed(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        try {
          const payload = await postJsonPayload('test-reply', { message: message }, TEST_REPLY_TIMEOUT_MS, controller ? controller.signal : undefined);
          if (testCancelRef.current) return;
          if (payload.ok === true) {
            setTestResult(payload);
            setTestDurationMs(toCount(payload.durationMs));
            setTestPhase('done');
          } else {
            setTestResult(null);
            setTestError(textOf(payload.error) || t('unknownError'));
            setTestRaw(textOf(payload.raw));
            setTestDurationMs(toCount(payload.durationMs));
            setTestPhase('error');
          }
        } catch (error) {
          if (testCancelRef.current) return;
          const failure = error && error.name === 'AbortError' ? t('testTimeout') : messageOf(error);
          setTestResult(null);
          setTestError(failure);
          setTestRaw('');
          setTestDurationMs(0);
          setTestPhase('error');
        } finally {
          if (testTimerRef.current) {
            clearInterval(testTimerRef.current);
            testTimerRef.current = null;
          }
          testAbortRef.current = null;
        }
      }

      /* ---------------------------- 通讯录搜索 ---------------------------- */

      function defaultSearchState() {
        return { query: '', phase: 'idle', candidates: [], error: '', highlight: 0 };
      }

      function searchStateAt(groupKey) {
        const state = contactSearch[String(groupKey)];
        return state && typeof state === 'object' ? state : defaultSearchState();
      }

      function setSearchState(groupKey, patch) {
        const key = String(groupKey);
        setContactSearch(function (previous) {
          const base = Object.assign(defaultSearchState(), previous[key] && typeof previous[key] === 'object' ? previous[key] : {});
          return Object.assign({}, previous, { [key]: Object.assign(base, patch) });
        });
      }

      function deleteSearchState(groupKey) {
        const key = String(groupKey);
        setContactSearch(function (previous) {
          if (!(key in previous)) return previous;
          const next = Object.assign({}, previous);
          delete next[key];
          return next;
        });
      }

      function stopSearchTimer(groupKey) {
        const key = String(groupKey);
        const timer = searchTimers.current[key];
        if (timer) {
          clearTimeout(timer);
          delete searchTimers.current[key];
        }
      }

      function resetContactUi() {
        searchGeneration.current += 1;
        const timers = searchTimers.current;
        Object.keys(timers).forEach(function (key) {
          clearTimeout(timers[key]);
        });
        searchTimers.current = {};
        searchSeq.current = {};
        setContactSearch({});
        setPickerGroupKey(null);
      }

      async function runContactSearch(groupKey, query) {
        const key = String(groupKey);
        const generation = searchGeneration.current;
        const sequence = (searchSeq.current[key] || 0) + 1;
        searchSeq.current[key] = sequence;
        setSearchState(groupKey, { phase: 'searching', candidates: [], error: '', highlight: 0 });
        try {
          const payload = await postJson('contacts/search', { query: query });
          if (searchGeneration.current !== generation || (searchSeq.current[key] || 0) !== sequence) return;
          const candidates = Array.isArray(payload.candidates)
            ? payload.candidates.filter(function (candidate) {
                return candidate && typeof candidate === 'object';
              })
            : [];
          setSearchState(groupKey, { phase: 'done', candidates: candidates, error: '', highlight: 0 });
        } catch (error) {
          if (searchGeneration.current !== generation || (searchSeq.current[key] || 0) !== sequence) return;
          setSearchState(groupKey, { phase: 'error', candidates: [], error: messageOf(error), highlight: 0 });
        }
      }

      function handleSearchChange(groupKey, value) {
        stopSearchTimer(groupKey);
        searchSeq.current[String(groupKey)] = (searchSeq.current[String(groupKey)] || 0) + 1;
        const query = textOf(value);
        setSearchState(groupKey, { query: query, phase: query.trim() ? 'typing' : 'idle', candidates: [], error: '', highlight: 0 });
        if (!query.trim()) return;
        const key = String(groupKey);
        searchTimers.current[key] = setTimeout(function () {
          delete searchTimers.current[key];
          runContactSearch(groupKey, query.trim());
        }, 300);
      }

      function handleSearchKeyDown(groupKey, event) {
        const state = searchStateAt(groupKey);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (state.phase !== 'done' || !Array.isArray(state.candidates) || state.candidates.length === 0) return;
          event.preventDefault();
          const count = state.candidates.length;
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const highlight = typeof state.highlight === 'number' ? state.highlight : 0;
          setSearchState(groupKey, { highlight: (highlight + delta + count) % count });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (state.phase === 'done' && Array.isArray(state.candidates) && state.candidates.length > 0) {
            const highlight = typeof state.highlight === 'number' ? state.highlight : 0;
            const pick = state.candidates[Math.min(Math.max(highlight, 0), state.candidates.length - 1)];
            selectCandidate(groupKey, pick);
            return;
          }
          if (state.phase === 'typing' && textOf(state.query).trim()) {
            stopSearchTimer(groupKey);
            runContactSearch(groupKey, textOf(state.query).trim());
          }
          return;
        }
        if (event.key === 'Escape') {
          closeGroupPicker(groupKey);
        }
      }

      /** 选中候选 → 追加到「当前打开选择器的那一组」，不会串组。 */
      function selectCandidate(groupKey, candidate) {
        if (!candidate || typeof candidate !== 'object') return;
        stopSearchTimer(groupKey);
        searchSeq.current[String(groupKey)] = (searchSeq.current[String(groupKey)] || 0) + 1;
        if (appendMemberToGroup(groupKey, candidate)) {
          deleteSearchState(groupKey);
        }
      }

      /* ---------------------------- 各区块渲染 ---------------------------- */

      function renderChecks() {
        const list = Array.isArray(checks) ? checks : [];
        if (list.length === 0) return emptyHint(t('checksEmpty'));
        return h(
          'ul',
          { className: 'dws-checks' },
          list.map(function (check, index) {
            const ok = check && check.ok === true;
            return h(
              'li',
              { key: 'check-' + (check && check.id ? String(check.id) : String(index)), className: 'dws-check-row' },
              badge(ok ? 'ok' : 'error', ok ? t('checkOk') : t('checkFail')),
              h('span', { className: 'dws-check-name' }, check && check.label ? String(check.label) : ''),
              h('span', { className: 'dws-check-detail' }, check && check.detail ? String(check.detail) : '')
            );
          })
        );
      }

      function renderModelValue() {
        const model = data.model && typeof data.model === 'object' ? data.model : null;
        const readOnly = data.readOnly !== false;
        const provider = model ? textOf(model.provider).trim() : '';
        const modelId = model ? textOf(model.model).trim() : '';
        const effort = model ? textOf(model.reasoningEffort).trim() : '';
        const source = model ? textOf(model.source).trim() : '';
        const shown = provider && modelId ? provider + ' / ' + modelId : modelId || provider || t('notAvailable');
        const sourceText =
          source === 'config'
            ? t('modelSourceConfig')
            : source === 'default'
              ? t('modelSourceDefault')
              : source === 'profile'
                ? t('modelSourceProfile')
                : '';
        return h(
          'span',
          { className: 'dws-model-value' },
          h('span', { className: 'dws-mono' }, shown),
          effort ? h('span', { className: 'dws-hint' }, '· ' + t('modelEffortShort', { effort: effort })) : null,
          sourceText ? h('span', { className: 'dws-hint' }, sourceText) : null,
          h(
            'span',
            { className: readOnly ? 'dws-badge dws-badge-ok' : 'dws-badge dws-badge-warn' },
            h('span', { className: 'dws-dot' }),
            h('span', null, readOnly ? t('readOnlyOn') : t('readOnlyOff'))
          )
        );
      }

      function renderAgentModelSection() {
        const agent = draft && draft.agent && typeof draft.agent === 'object' ? draft.agent : {};
        const providerValue = textOf(agent.provider).trim();
        const modelValue = textOf(agent.model).trim();
        const effortValue = textOf(agent.reasoningEffort).trim();
        const readOnly = agent.readOnly !== false;
        const providers = modelProviders();
        const current = modelCurrent();
        const currentText = current.provider && current.model ? current.provider + ' / ' + current.model : t('notAvailable');
        const catalogError = modelLoadError || (modelCatalog && typeof modelCatalog.error === 'string' ? modelCatalog.error : '');
        let providerField;
        let modelField;
        let modelExtra = null;

        if (providers.length === 0) {
          providerField = h(
            'label',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('providerLabel')),
            h('input', {
              className: 'dws-input dws-mono',
              type: 'text',
              value: providerValue,
              placeholder: 'magpie',
              'aria-label': t('providerLabel'),
              onChange: function (event) {
                setAgentField('provider', event.target.value);
              },
            })
          );
          modelField = h(
            'label',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('modelLabel')),
            h('input', {
              className: 'dws-input dws-mono',
              type: 'text',
              value: modelValue,
              placeholder: 'opendesign/deepseek-v4.1-flash',
              'aria-label': t('modelLabel'),
              onChange: function (event) {
                setAgentField('model', event.target.value);
              },
            })
          );
          modelExtra = h(
            'p',
            { className: catalogError ? 'dws-banner' : 'dws-hint' },
            modelLoading ? t('modelLoading') : catalogError ? t('modelCatalogError', { message: catalogError }) : t('modelManualHint')
          );
        } else {
          const followLabel = t('modelFollowDefault', { current: currentText });
          const providerOptions = [h('option', { key: 'provider-follow', value: '' }, followLabel)];
          providers.forEach(function (provider, index) {
            const id = String(provider.id);
            providerOptions.push(h('option', { key: 'provider-' + String(index), value: id }, provider.name ? String(provider.name) : id));
          });
          const selectedProvider = providers.find(function (provider) {
            return String(provider.id) === providerValue;
          });
          if (providerValue && !selectedProvider) {
            // 配置里的 provider 不在清单里（宿主清单失败/旧值）时仍原样回填
            providerOptions.push(h('option', { key: 'provider-current', value: providerValue }, providerValue));
          }
          const models = selectedProvider && Array.isArray(selectedProvider.models)
            ? selectedProvider.models.filter(function (model) {
                return model && typeof model === 'object' && model.id !== null && model.id !== undefined;
              })
            : [];
          const providerError = selectedProvider && typeof selectedProvider.error === 'string' ? selectedProvider.error : '';

          providerField = h(
            'label',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('providerLabel')),
            h(
              'select',
              {
                className: 'dws-select',
                value: providerValue,
                'aria-label': t('providerLabel'),
                onChange: function (event) {
                  chooseProvider(event.target.value);
                },
              },
              providerOptions
            )
          );

          if (!providerValue) {
            modelField = h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('modelLabel')),
              h(
                'select',
                { className: 'dws-select', value: '', disabled: true, 'aria-label': t('modelLabel') },
                h('option', { value: '' }, t('modelFollowDefaultPlain'))
              )
            );
          } else if (models.length === 0 || providerError) {
            modelField = h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('modelLabel')),
              h('input', {
                className: 'dws-input dws-mono',
                type: 'text',
                value: modelValue,
                placeholder: 'model-id',
                'aria-label': t('modelLabel'),
                onChange: function (event) {
                  setAgentField('model', event.target.value);
                },
              })
            );
            if (providerError) {
              modelExtra = h('p', { className: 'dws-banner' }, t('modelProviderError', { message: providerError }));
            }
          } else {
            const modelOptions = [];
            const known = models.some(function (model) {
              return String(model.id) === modelValue;
            });
            if (modelValue && !known) modelOptions.push(h('option', { key: 'model-current', value: modelValue }, modelValue));
            models.forEach(function (model, index) {
              const id = String(model.id);
              modelOptions.push(h('option', { key: 'model-' + String(index), value: id }, model.name ? String(model.name) : id));
            });
            modelField = h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('modelLabel')),
              h(
                'select',
                {
                  className: 'dws-select',
                  value: modelValue,
                  'aria-label': t('modelLabel'),
                  onChange: function (event) {
                    setAgentField('model', event.target.value);
                  },
                },
                modelOptions
              )
            );
          }
        }

        const effortOptions = [h('option', { key: 'effort-default', value: '' }, t('effortDefault'))];
        EFFORT_OPTIONS.forEach(function (effort) {
          effortOptions.push(h('option', { key: 'effort-' + effort, value: effort }, effort));
        });
        if (effortValue && EFFORT_OPTIONS.indexOf(effortValue) < 0) {
          effortOptions.push(h('option', { key: 'effort-custom', value: effortValue }, effortValue));
        }

        return h(
          'div',
          { className: 'dws-agent-box' },
          h(
            'div',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('agentSectionTitle')),
            h('span', { className: 'dws-hint' }, t('agentSectionHint'))
          ),
          h(
            'div',
            { className: 'dws-grid' },
            providerField,
            modelField,
            h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('effortLabel')),
              h(
                'select',
                {
                  className: 'dws-select',
                  value: effortValue,
                  'aria-label': t('effortLabel'),
                  onChange: function (event) {
                    setAgentField('reasoningEffort', event.target.value);
                  },
                },
                effortOptions
              ),
              h('span', { className: 'dws-hint' }, t('effortHint'))
            ),
            modelExtra ? h('div', { className: 'dws-full' }, modelExtra) : null
          ),
          h(
            'label',
            { className: 'dws-check', title: readOnly ? t('readOnlyOnHint') : t('readOnlyOffHint') },
            h('input', {
              type: 'checkbox',
              checked: readOnly,
              'aria-label': t('readOnlyLabel'),
              onChange: function (event) {
                setAgentField('readOnly', event.target.checked);
              },
            }),
            h('span', null, t('readOnlyLabel'))
          ),
          h('p', { className: 'dws-hint' }, readOnly ? t('readOnlyOnHint') : t('readOnlyOffHint'))
        );
      }

      function renderLastCycle() {
        const override = lastCycleOverride && typeof lastCycleOverride === 'object' ? lastCycleOverride : null;
        const cycle = override || (data.lastCycle && typeof data.lastCycle === 'object' ? data.lastCycle : null);
        const label = h('span', { className: 'dws-kv-key' }, t('lastCycleLabel'));
        if (!cycle) {
          const enabledNow = !!(data.config && data.config.enabled === true);
          const contactCount = data.config && Array.isArray(data.config.contacts) ? data.config.contacts.length : 0;
          return h(
            'div',
            { className: 'dws-cycle-row' },
            label,
            h('span', { className: 'dws-cycle-muted' }, t('cycleNever')),
            enabledNow && contactCount > 0 ? h('span', { className: 'dws-hint' }, t('cycleFirstHint')) : null
          );
        }
        const skipped = textOf(cycle.skippedReason).trim();
        if (skipped) {
          return h('div', { className: 'dws-cycle-row' }, label, h('span', { className: 'dws-cycle-skipped' }, skipped));
        }
        const fetched = toCount(cycle.fetched);
        const fresh = toCount(cycle.fresh);
        const counters = [
          { key: 'drafts', labelKey: 'statDrafts', value: toCount(cycle.drafts) },
          { key: 'confirms', labelKey: 'cycleConfirms', value: toCount(cycle.confirms) },
          { key: 'sent', labelKey: 'statSent', value: toCount(cycle.sent) },
          { key: 'skipped', labelKey: 'statSkipped', value: toCount(cycle.skipped) },
          { key: 'blocked', labelKey: 'statBlocked', value: toCount(cycle.blocked) },
          { key: 'errors', labelKey: 'statErrors', value: toCount(cycle.errors) },
        ];
        const chips = [];
        counters.forEach(function (counter) {
          if (counter.value <= 0) return;
          chips.push(
            h(
              'span',
              { key: 'cycle-' + counter.key, className: 'dws-stat' },
              h('span', null, t(counter.labelKey)),
              h('strong', { className: 'dws-stat-num' }, String(counter.value))
            )
          );
        });
        const noNew = chips.length === 0 && fresh === 0;
        return h(
          'div',
          { className: 'dws-cycle-row' },
          label,
          h('span', { className: 'dws-cycle-time' }, formatClock(cycle.at, lang)),
          h('span', { className: 'dws-cycle-summary' }, t('cycleReadSummary', { fetched: fetched, fresh: fresh })),
          noNew ? h('span', { className: 'dws-cycle-muted' }, t('cycleNoNew')) : null,
          chips.length > 0 ? h('span', { className: 'dws-stats' }, chips) : null
        );
      }

      function renderStatus() {
        const plugin = data.plugin && typeof data.plugin === 'object' ? data.plugin : {};
        const auth = data.auth && typeof data.auth === 'object' ? data.auth : {};
        const stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
        const self = auth.self && typeof auth.self === 'object' ? auth.self : null;
        const authenticated = auth.authenticated === true;
        const authError = typeof auth.error === 'string' ? auth.error : '';
        const authFailed = auth.ok === false || auth.authenticated === false || (!!authError && !authenticated);
        const authKind = authFailed ? 'error' : authenticated ? 'ok' : 'warn';
        const authText = authFailed ? t('authFail') : authenticated ? t('authOk') : t('authUnknown');
        const paused = data.paused === true;
        const degraded = plugin.degraded === true;
        const configSource = typeof data.configSource === 'string' ? data.configSource : '';
        const enabledNow = !!(data.config && data.config.enabled === true);
        const cycleBlockedReason = !enabledNow ? t('cycleDisabledOff') : paused ? t('cycleDisabledPaused') : '';
        const sourceText =
          configSource === 'settings'
            ? t('configSourceSettings')
            : configSource === 'file'
              ? t('configSourceFile')
              : configSource === 'default'
                ? t('configSourceDefault')
                : configSource || t('notAvailable');

        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('statusTitle'))
            ),
            h(
              'div',
              { className: 'dws-head-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dws-btn',
                  disabled: busy !== null || cycleBlockedReason !== '',
                  title: cycleBlockedReason || t('cycleHint'),
                  onClick: runCycle,
                },
                busy === 'cycle' ? t('cycleChecking') : t('cycleManual')
              ),
              h(
                'button',
                { type: 'button', className: 'dws-btn', disabled: busy !== null, onClick: runDiagnose },
                busy === 'diagnose' ? t('diagnosing') : t('diagnose')
              ),
              h(
                'button',
                { type: 'button', className: 'dws-btn', disabled: busy !== null, onClick: refresh },
                busy === 'refresh' ? t('refreshing') : t('refresh')
              )
            )
          ),
          h(
            'div',
            { className: 'dws-row' },
            badge(authKind, authText),
            h('span', { className: 'dws-kv-key' }, t('selfUserId') + '：'),
            h('span', { className: 'dws-mono' }, self && self.userId ? String(self.userId) : t('notAvailable')),
            self && self.nick ? h('span', { className: 'dws-kv-key' }, t('selfNick') + '：') : null,
            self && self.nick ? h('span', { className: 'dws-mono' }, String(self.nick)) : null,
            h(
              'label',
              { className: 'dws-switch', title: paused ? t('pausedOn') : t('pausedOff') },
              h('input', {
                type: 'checkbox',
                checked: paused,
                disabled: busy !== null,
                'aria-label': t('pauseTitle'),
                onChange: function (event) {
                  togglePause(event.target.checked);
                },
              }),
              h('span', null, t('pauseTitle') + '：' + (paused ? t('pausedShort') : t('runningShort')))
            )
          ),
          authError && !authenticated ? h('p', { className: 'dws-banner dws-banner-error', role: 'alert' }, authError) : null,
          h(
            'div',
            { className: 'dws-kv' },
            kvItem(t('version'), plugin.version ? 'v' + String(plugin.version) : t('notAvailable')),
            kvItem(t('bootedAt'), formatTime(plugin.bootedAt, lang)),
            kvItem(t('dataDir'), plugin.dataDir ? String(plugin.dataDir) : t('notAvailable'), 'dws-mono'),
            kvItem(t('configSource'), sourceText),
            kvItem(t('replyModelLabel'), renderModelValue())
          ),
          renderLastCycle(),
          degraded ? h('p', { className: 'dws-banner' }, t('degradedWarn')) : null,
          data.configSource === 'settings' && data.overrideFile === true ? h('p', { className: 'dws-banner' }, t('overrideInfo')) : null,
          h(
            'div',
            { className: 'dws-stats' },
            h('span', { className: 'dws-label' }, t('statsTitle')),
            statChip(t('statDrafts'), stats.drafts),
            statChip(t('statSent'), stats.sent),
            statChip(t('statSkipped'), stats.skipped),
            statChip(t('statBlocked'), stats.blocked),
            statChip(t('statErrors'), stats.errors)
          ),
          checks !== null ? h('div', { className: 'dws-field' }, h('span', { className: 'dws-label' }, t('checksTitle')), renderChecks()) : null
        );
      }

      function renderMember(member, memberIndex, groupKey) {
        const item = member && typeof member === 'object' ? member : {};
        const name = textOf(item.name);
        const openId = textOf(item.openDingTalkId);
        const userId = textOf(item.userId);
        const idText = openId || (userId ? 'userId: ' + userId : t('notAvailable'));
        return h(
          'div',
          { key: 'member-' + String(memberIndex), className: 'dws-member' },
          h(
            'div',
            { className: 'dws-member-text' },
            h('span', { className: 'dws-member-name' }, name || t('notAvailable')),
            h('span', { className: 'dws-member-id dws-mono' }, idText)
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dws-btn dws-btn-small dws-btn-danger',
              disabled: busy !== null,
              onClick: function () {
                removeMember(groupKey, memberIndex);
              },
            },
            t('remove')
          )
        );
      }

      function renderPicker(groupKey) {
        const state = searchStateAt(groupKey);
        const phase = typeof state.phase === 'string' ? state.phase : 'idle';
        const candidates = Array.isArray(state.candidates) ? state.candidates : [];
        const highlight = typeof state.highlight === 'number' ? state.highlight : 0;
        const showMenu = phase === 'searching' || phase === 'done' || phase === 'error';
        const menu = showMenu
          ? h(
              'div',
              { className: 'dws-picker-menu', role: 'listbox' },
              phase === 'searching'
                ? h('div', { className: 'dws-picker-note' }, t('searching'))
                : phase === 'error'
                  ? h('div', { className: 'dws-picker-error', role: 'alert' }, textOf(state.error) || t('unknownError'))
                  : candidates.length === 0
                    ? h('div', { className: 'dws-picker-note' }, t('searchEmpty'))
                    : candidates.map(function (candidate, candidateIndex) {
                        const active = candidateIndex === highlight;
                        const idText = textOf(candidate.openDingTalkId) || (candidate.userId ? 'userId: ' + textOf(candidate.userId) : '');
                        return h(
                          'button',
                          {
                            key: 'candidate-' + String(candidateIndex),
                            type: 'button',
                            role: 'option',
                            'aria-selected': active ? 'true' : 'false',
                            className: active ? 'dws-picker-item dws-picker-item-active' : 'dws-picker-item',
                            onMouseEnter: function () {
                              setSearchState(groupKey, { highlight: candidateIndex });
                            },
                            onClick: function () {
                              selectCandidate(groupKey, candidate);
                            },
                          },
                          h('span', { className: 'dws-picker-item-name' }, textOf(candidate.name) || t('notAvailable')),
                          idText ? h('span', { className: 'dws-picker-item-id dws-mono' }, idText) : null
                        );
                      })
            )
          : null;
        return h(
          'div',
          { className: 'dws-picker' },
          h(
            'div',
            { className: 'dws-picker-row' },
            h('input', {
              className: 'dws-input',
              type: 'text',
              value: textOf(state.query),
              placeholder: t('searchPlaceholder'),
              'aria-label': t('searchAria'),
              autoComplete: 'off',
              onChange: function (event) {
                handleSearchChange(groupKey, event.target.value);
              },
              onKeyDown: function (event) {
                handleSearchKeyDown(groupKey, event);
              },
            })
          ),
          menu
        );
      }

      function renderGroupCard(group, index, workspaces) {
        const workspaceId = textOf(group.workspaceId);
        const members = Array.isArray(group.members) ? group.members : [];
        const options = [h('option', { key: 'ws-empty', value: '' }, t('workspacePlaceholder'))];
        workspaces.forEach(function (workspace, wsIndex) {
          if (!workspace || typeof workspace !== 'object' || workspace.id === null || workspace.id === undefined) return;
          const id = String(workspace.id);
          if (!id) return;
          options.push(
            h(
              'option',
              { key: 'ws-' + String(wsIndex), value: id, title: workspace.path ? String(workspace.path) : id },
              workspace.title ? String(workspace.title) : id
            )
          );
        });
        const known = workspaces.some(function (workspace) {
          return workspace && typeof workspace === 'object' && workspace.id !== null && workspace.id !== undefined && String(workspace.id) === workspaceId;
        });
        if (workspaceId && !known) {
          options.push(h('option', { key: 'ws-current', value: workspaceId }, t('workspaceMissing', { id: workspaceId })));
        }
        const allTrue = members.length > 0 && members.every(function (member) {
          return member.autoReply === true;
        });
        const anyTrue = members.some(function (member) {
          return member.autoReply === true;
        });
        const mixed = members.length > 1 && anyTrue && !allTrue;
        const pickerOpen = pickerGroupKey === group.key;
        return h(
          'section',
          { key: group.key, className: 'dws-contact' },
          // 第一行：绑定工作区（整行）
          h(
            'label',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('groupIndex', { n: index + 1 }) + ' · ' + t('colWorkspace')),
            h(
              'select',
              {
                className: 'dws-select',
                value: workspaceId,
                'aria-label': t('colWorkspace'),
                onChange: function (event) {
                  setGroupWorkspace(group.key, event.target.value);
                },
              },
              options
            )
          ),
          // 组内成员 chip
          members.length === 0
            ? h('p', { className: 'dws-empty' }, t('groupNoMembers'))
            : h(
                'div',
                { className: 'dws-member-list' },
                members.map(function (member, memberIndex) {
                  return renderMember(member, memberIndex, group.key);
                })
              ),
          // 组内通讯录搜索器（同一时间只打开一组）
          pickerOpen ? renderPicker(group.key) : null,
          // 组底部：添加联系人 / 组级开关 / 删除本组
          h(
            'div',
            { className: 'dws-group-actions' },
            h(
              'div',
              { className: 'dws-group-actions-left' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dws-btn dws-btn-small',
                  disabled: busy !== null,
                  onClick: function () {
                    toggleGroupPicker(group.key);
                  },
                },
                pickerOpen ? t('cancel') : t('addContactToGroup')
              )
            ),
            h(
              'div',
              { className: 'dws-group-actions-right' },
              h(
                'label',
                { className: 'dws-check', title: allTrue ? t('autoOn') : t('autoOff') },
                h('input', {
                  type: 'checkbox',
                  checked: allTrue,
                  disabled: members.length === 0 || busy !== null,
                  'aria-label': t('colAuto'),
                  onChange: function (event) {
                    toggleGroupAutoReply(group.key, event.target.checked);
                  },
                }),
                h('span', null, t('colAuto') + '：' + (allTrue ? t('autoOn') : t('autoOff')))
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dws-btn dws-btn-small dws-btn-danger',
                  disabled: busy !== null,
                  onClick: function () {
                    removeGroup(group.key);
                  },
                },
                t('deleteGroup')
              )
            )
          ),
          mixed ? h('p', { className: 'dws-hint' }, t('groupMixedHint')) : null
        );
      }

      function renderContacts() {
        const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
        let memberTotal = 0;
        groups.forEach(function (group) {
          memberTotal += Array.isArray(group.members) ? group.members.length : 0;
        });
        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('contactsTitleGroups', { groups: groups.length, contacts: memberTotal })),
              h('p', { className: 'dws-sub' }, t('contactsHint'))
            ),
            h(
              'div',
              { className: 'dws-head-actions' },
              h('button', { type: 'button', className: 'dws-btn', onClick: addGroup }, t('addGroup'))
            )
          ),
          workspaces.length === 0 ? h('p', { className: 'dws-banner' }, t('noWorkspaces')) : null,
          groups.length === 0
            ? emptyHint(t('contactsEmpty'))
            : h(
                'div',
                { className: 'dws-contact-list' },
                groups.map(function (group, index) {
                  return renderGroupCard(group, index, workspaces);
                })
              ),
          h('p', { className: 'dws-hint' }, t('contactsIdentityHint'))
        );
      }

      function renderBehavior() {
        const config = draft || data.config || {};
        const mode = EDIT_MODES[config.mode] ? config.mode : 'draft';
        const replyFormat = config.replyFormat === 'text' ? 'text' : 'markdown';
        const renderConfig = config.render && typeof config.render === 'object' ? config.render : {};
        const renderEnabled = renderConfig.enabled === true;
        const renderBlocks = renderConfig.maxBlocks !== undefined ? renderConfig.maxBlocks : 1;
        const renderRows = renderConfig.maxRows !== undefined ? renderConfig.maxRows : 10;
        const attachments = config.attachments && typeof config.attachments === 'object' ? config.attachments : {};
        const attachmentsEnabled = attachments.enabled === true;
        const attachmentsCount = attachments.maxCount !== undefined ? attachments.maxCount : 2;
        const attachmentsMb =
          attachments.maxMb !== undefined
            ? textOf(attachments.maxMb)
            : Number.isFinite(Number(attachments.maxBytes)) && Number(attachments.maxBytes) > 0
              ? String(Math.round(Number(attachments.maxBytes) / (1024 * 1024)))
              : '10';
        const quiet = normalizeQuietHours(config.quietHours, undefined);
        const limits = config.limits && typeof config.limits === 'object' ? config.limits : {};
        const timeZone = textOf(config.timeZone);
        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('behaviorTitle')),
              timeZone ? h('p', { className: 'dws-sub' }, t('timeZoneNote', { tz: timeZone })) : null
            ),
            h(
              'div',
              { className: 'dws-head-actions' },
              h(
                'label',
                { className: 'dws-switch' },
                h('input', {
                  type: 'checkbox',
                  checked: config.enabled === true,
                  'aria-label': t('enabledLabel'),
                  onChange: function (event) {
                    setField('enabled', event.target.checked);
                  },
                }),
                h('span', null, t('enabledLabel'))
              )
            )
          ),
          h('p', { className: 'dws-hint' }, t('enabledHint')),
          h(
            'div',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('modeLabel')),
            h(
              'div',
              { className: 'dws-radio-row' },
              MODE_OPTIONS.map(function (option) {
                const active = mode === option.value;
                return h(
                  'label',
                  { key: 'mode-' + option.value, className: active ? 'dws-radio dws-radio-active' : 'dws-radio' },
                  h('input', {
                    type: 'radio',
                    name: 'dws-mode',
                    value: option.value,
                    checked: active,
                    onChange: function () {
                      setField('mode', option.value);
                    },
                  }),
                  h(
                    'span',
                    { className: 'dws-radio-text' },
                    h('span', { className: 'dws-radio-title' }, t(option.labelKey)),
                    h('span', { className: 'dws-radio-hint' }, t(option.hintKey))
                  )
                );
              })
            )
          ),
          h(
            'label',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('replyMarkerLabel')),
            h('input', {
              className: 'dws-input',
              type: 'text',
              value: textOf(config.replyMarker),
              'aria-label': t('replyMarkerLabel'),
              onChange: function (event) {
                setField('replyMarker', event.target.value);
              },
            }),
            h('span', { className: 'dws-hint' }, t('replyMarkerHint'))
          ),
          h(
            'div',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('replyFormatLabel')),
            h(
              'div',
              { className: 'dws-radio-row' },
              ['markdown', 'text'].map(function (value) {
                const active = replyFormat === value;
                return h(
                  'label',
                  { key: 'reply-format-' + value, className: active ? 'dws-radio dws-radio-active' : 'dws-radio' },
                  h('input', {
                    type: 'radio',
                    name: 'dws-reply-format',
                    value: value,
                    checked: active,
                    onChange: function () {
                      setField('replyFormat', value);
                    },
                  }),
                  h(
                    'span',
                    { className: 'dws-radio-text' },
                    h('span', { className: 'dws-radio-title' }, t(value === 'markdown' ? 'replyFormatMarkdown' : 'replyFormatText'))
                  )
                );
              })
            ),
            h('span', { className: 'dws-hint' }, replyFormat === 'text' ? t('replyFormatTextHint') : t('replyFormatMarkdownHint'))
          ),
          h(
            'div',
            { className: 'dws-agent-box' },
            h(
              'div',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('attachmentsTitle')),
              h('span', { className: 'dws-hint' }, t('attachmentsHint'))
            ),
            h(
              'label',
              { className: 'dws-check', title: t('attachmentsEnabled') },
              h('input', {
                type: 'checkbox',
                checked: attachmentsEnabled,
                'aria-label': t('attachmentsEnabled'),
                onChange: function (event) {
                  setAttachmentField('enabled', event.target.checked);
                },
              }),
              h('span', null, t('attachmentsEnabled'))
            ),
            h(
              'div',
              { className: 'dws-grid' },
              h(
                'label',
                { className: 'dws-field' },
                h('span', { className: 'dws-label' }, t('attachmentsMaxCount')),
                h('input', {
                  className: 'dws-input',
                  type: 'number',
                  min: 0,
                  max: 5,
                  step: 1,
                  disabled: !attachmentsEnabled,
                  value: textOf(attachmentsCount),
                  'aria-label': t('attachmentsMaxCount'),
                  onChange: function (event) {
                    setAttachmentField('maxCount', event.target.value);
                  },
                }),
                h('span', { className: 'dws-hint' }, t('attachmentsCountHint'))
              ),
              h(
                'label',
                { className: 'dws-field' },
                h('span', { className: 'dws-label' }, t('attachmentsMaxBytes')),
                h('input', {
                  className: 'dws-input',
                  type: 'number',
                  min: 1,
                  max: 50,
                  step: 1,
                  disabled: !attachmentsEnabled,
                  value: attachmentsMb,
                  'aria-label': t('attachmentsMaxBytes'),
                  onChange: function (event) {
                    setAttachmentField('maxMb', event.target.value);
                  },
                }),
                h('span', { className: 'dws-hint' }, t('attachmentsBytesHint'))
              )
            )
          ),
          h(
            'div',
            { className: 'dws-agent-box' },
            h(
              'div',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('renderTitle')),
              h('span', { className: 'dws-hint' }, t('renderHint'))
            ),
            h(
              'label',
              { className: 'dws-check', title: t('renderEnabled') },
              h('input', {
                type: 'checkbox',
                checked: renderEnabled,
                'aria-label': t('renderEnabled'),
                onChange: function (event) {
                  setRenderField('enabled', event.target.checked);
                },
              }),
              h('span', null, t('renderEnabled'))
            ),
            h(
              'div',
              { className: 'dws-grid' },
              h(
                'label',
                { className: 'dws-field' },
                h('span', { className: 'dws-label' }, t('renderMaxBlocks')),
                h('input', {
                  className: 'dws-input',
                  type: 'number',
                  min: 0,
                  max: 3,
                  step: 1,
                  disabled: !renderEnabled,
                  value: textOf(renderBlocks),
                  'aria-label': t('renderMaxBlocks'),
                  onChange: function (event) {
                    setRenderField('maxBlocks', event.target.value);
                  },
                }),
                h('span', { className: 'dws-hint' }, t('renderBlocksHint'))
              ),
              h(
                'label',
                { className: 'dws-field' },
                h('span', { className: 'dws-label' }, t('renderMaxRows')),
                h('input', {
                  className: 'dws-input',
                  type: 'number',
                  min: 1,
                  max: 30,
                  step: 1,
                  disabled: !renderEnabled,
                  value: textOf(renderRows),
                  'aria-label': t('renderMaxRows'),
                  onChange: function (event) {
                    setRenderField('maxRows', event.target.value);
                  },
                }),
                h('span', { className: 'dws-hint' }, t('renderRowsHint'))
              )
            )
          ),
          renderAgentModelSection(),
          h(
            'div',
            { className: 'dws-grid' },
            h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('pollLabel')),
              h('input', {
                className: 'dws-input',
                type: 'number',
                min: 10,
                max: 3600,
                step: 5,
                value: valueText(config.pollIntervalSeconds),
                onChange: function (event) {
                  setField('pollIntervalSeconds', event.target.value);
                },
              }),
              h('span', { className: 'dws-hint' }, t('pollHint'))
            ),
            h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('maxRepliesLabel')),
              h('input', {
                className: 'dws-input',
                type: 'number',
                min: 1,
                max: 120,
                step: 1,
                value: valueText(limits.maxRepliesPerHour),
                onChange: function (event) {
                  setLimit('maxRepliesPerHour', event.target.value);
                },
              })
            ),
            h(
              'label',
              { className: 'dws-field' },
              h('span', { className: 'dws-label' }, t('maxCharsLabel')),
              h('input', {
                className: 'dws-input',
                type: 'number',
                min: 20,
                max: 4000,
                step: 10,
                value: valueText(limits.maxReplyChars),
                onChange: function (event) {
                  setLimit('maxReplyChars', event.target.value);
                },
              })
            )
          ),
          h(
            'div',
            { className: 'dws-field' },
            h(
              'label',
              { className: 'dws-check' },
              h('input', {
                type: 'checkbox',
                checked: quiet.enabled,
                'aria-label': t('quietLabel'),
                onChange: function (event) {
                  setQuietHours({ enabled: event.target.checked });
                },
              }),
              h('span', null, t('quietLabel'))
            ),
            h('span', { className: 'dws-hint' }, t('quietHint')),
            h(
              'div',
              { className: 'dws-row' },
              h(
                'label',
                { className: 'dws-field-inline' },
                h('span', { className: 'dws-label' }, t('quietStart')),
                h('input', {
                  className: 'dws-input',
                  type: 'time',
                  value: quiet.start,
                  disabled: !quiet.enabled,
                  onChange: function (event) {
                    setQuietHours({ start: event.target.value });
                  },
                })
              ),
              h(
                'label',
                { className: 'dws-field-inline' },
                h('span', { className: 'dws-label' }, t('quietEnd')),
                h('input', {
                  className: 'dws-input',
                  type: 'time',
                  value: quiet.end,
                  disabled: !quiet.enabled,
                  onChange: function (event) {
                    setQuietHours({ end: event.target.value });
                  },
                })
              )
            )
          )
        );
      }

      function renderTestReply() {
        const running = testPhase === 'running';
        const empty = testMessage.trim().length === 0;
        const marker = currentReplyMarker();
        const result = testResult && typeof testResult === 'object' ? testResult : null;
        const renders = result && Array.isArray(result.renders) ? result.renders.filter(function (item) { return item && typeof item === 'object'; }) : [];
        const attachments = result && Array.isArray(result.attachments) ? result.attachments.filter(function (item) { return item && typeof item === 'object'; }) : [];
        const durationText = testDurationMs > 0 ? formatDurationMs(testDurationMs) : '';
        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('testReplyTitle')),
              h('p', { className: 'dws-sub' }, t('testNote'))
            )
          ),
          h(
            'label',
            { className: 'dws-field' },
            h('span', { className: 'dws-label' }, t('testMessageLabel')),
            h('textarea', {
              className: 'dws-input dws-textarea',
              rows: 3,
              value: testMessage,
              placeholder: t('testMessagePlaceholder'),
              'aria-label': t('testMessageLabel'),
              disabled: running,
              onChange: function (event) {
                setTestMessage(event.target.value);
              },
            })
          ),
          h(
            'div',
            { className: 'dws-row' },
            h(
              'button',
              { type: 'button', className: 'dws-btn dws-btn-primary', disabled: running || empty, onClick: runTestReply },
              running ? t('testGenerating') : t('testGenerate')
            ),
            running ? h('button', { type: 'button', className: 'dws-btn', onClick: cancelTestReply }, t('cancel')) : null,
            running ? h('span', { className: 'dws-hint' }, t('testElapsed', { seconds: String(testElapsed) })) : null,
            !running && empty ? h('span', { className: 'dws-hint' }, t('testEmptyHint')) : null
          ),
          testPhase === 'cancelled' ? h('p', { className: 'dws-banner' }, t('testCancelled')) : null,
          testPhase === 'done' && result
            ? h(
                'div',
                { className: 'dws-test-result' },
                h('p', { className: 'dws-test-reply-text' }, textOf(result.reply)),
                result.truncated === true
                  ? h(
                      'p',
                      { className: 'dws-warn-text' },
                      t('testTruncatedWarning', {
                        limitChars: typeof result.limitChars === 'number' ? String(result.limitChars) : t('dash'),
                      })
                    )
                  : null,
                h('p', { className: 'dws-hint' }, t('testMarkerNote', { marker: marker || t('testMarkerNone') })),
                h(
                  'p',
                  { className: 'dws-hint' },
                  t('testMeta', {
                    model: testModelText(result.model),
                    permission: result.readOnly === false ? t('readOnlyOff') : t('readOnlyOn'),
                    duration: formatDurationMs(result.durationMs),
                  }) +
                    ' · ' +
                    t('testChars', { chars: String(textOf(result.reply).length) })
                ),
                renders.length > 0
                  ? h(
                      'div',
                      { className: 'dws-render-list' },
                      h('p', { className: 'dws-label' }, t('testRendersTitle')),
                      renders.map(function (item, index) {
                        if (item.ok === true) {
                          const dataUrl = textOf(item.dataUrl);
                          const meta = [renderTypeLabel(item.type), textOf(item.title), item.bytes !== undefined ? formatBytes(item.bytes) : ''].filter(function (part) {
                            return part !== '';
                          });
                          return h(
                            'div',
                            { key: 'render-' + String(index), className: 'dws-render-item' },
                            dataUrl
                              ? h('img', {
                                  className: 'dws-render-img',
                                  src: dataUrl,
                                  alt: textOf(item.title) || t('testRenderAlt'),
                                  loading: 'lazy',
                                })
                              : null,
                            h(
                              'p',
                              { className: 'dws-hint' },
                              dataUrl
                                ? meta.join(' · ')
                                : t('testRenderNoPreview', {
                                    name: textOf(item.name) || t('notAvailable'),
                                    size: formatBytes(item.bytes),
                                  })
                            )
                          );
                        }
                        return h(
                          'p',
                          { key: 'render-' + String(index), className: 'dws-warn-text' },
                          t('testRenderFailed', { error: textOf(item.error) || t('unknownError') })
                        );
                      })
                    )
                  : null,
                renders.length > 0 ? h('p', { className: 'dws-hint' }, t('testPreviewNote')) : null,
                attachments.length > 0
                  ? h(
                      'div',
                      { className: 'dws-attach-list' },
                      h('p', { className: 'dws-label' }, t('testAttachmentsTitle')),
                      attachments.map(function (item, index) {
                        if (item.ok === true) {
                          const name = textOf(item.name) || t('notAvailable');
                          return h(
                            'p',
                            { key: 'attach-' + String(index), className: 'dws-attach-item' },
                            name + (item.bytes !== undefined ? ' · ' + formatBytes(item.bytes) : '')
                          );
                        }
                        return h(
                          'p',
                          { key: 'attach-' + String(index), className: 'dws-warn-text' },
                          t('testAttachFailed', {
                            path: textOf(item.request) || textOf(item.path) || t('notAvailable'),
                            error: textOf(item.error) || t('unknownError'),
                          })
                        );
                      })
                    )
                  : null,
              )
            : null,
          testPhase === 'error'
            ? h(
                'div',
                { className: 'dws-test-error' },
                h('p', { className: 'dws-error-text', role: 'alert' }, t('testFailed') + '：' + (testError || t('unknownError'))),
                durationText ? h('p', { className: 'dws-hint' }, t('testDurationOnly', { duration: durationText })) : null,
                testRaw
                  ? h(
                      'details',
                      { className: 'dws-test-raw' },
                      h('summary', null, t('testRawToggle')),
                      h('pre', { className: 'dws-pre' }, testRaw)
                    )
                  : null
              )
            : null
        );
      }

      function renderPendingDrafts() {
        const list = Array.isArray(data.pendingConfirm) ? data.pendingConfirm : [];
        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('draftsTitle') + '（' + String(list.length) + '）'),
              h('p', { className: 'dws-sub' }, t('draftsHint'))
            ),
            null
          ),
          list.length === 0
            ? emptyHint(t('draftsEmpty'))
            : h(
                'div',
                { className: 'dws-field' },
                list.map(function (pending, index) {
                  const item = pending && typeof pending === 'object' ? pending : {};
                  const contact = textOf(item.contact);
                  const itemKey = item.key !== null && item.key !== undefined ? String(item.key) : contact || String(index);
                  const sending = busy === 'confirm:' + itemKey + ':send';
                  const discarding = busy === 'confirm:' + itemKey + ':discard';
                  return h(
                    'div',
                    { key: 'pending-' + itemKey, className: 'dws-draft' },
                    h(
                      'div',
                      { className: 'dws-draft-head' },
                      h(
                        'span',
                        null,
                        h('strong', null, contact || t('notAvailable')),
                        h('span', { className: 'dws-hint' }, ' · ' + t('draftAt', { time: formatTime(item.createdAt, lang) }))
                      ),
                      h(
                        'div',
                        { className: 'dws-head-actions' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dws-btn dws-btn-small dws-btn-primary',
                            disabled: busy !== null,
                            onClick: function () {
                              confirmDraft(item, 'send');
                            },
                          },
                          sending ? t('sending') : t('send')
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dws-btn dws-btn-small',
                            disabled: busy !== null,
                            onClick: function () {
                              confirmDraft(item, 'discard');
                            },
                          },
                          discarding ? t('discarding') : t('discard')
                        )
                      )
                    ),
                    h('p', { className: 'dws-draft-text' }, textOf(item.text))
                  );
                })
              )
        );
      }

      function renderRecentDrafts() {
        const all = Array.isArray(data.drafts) ? data.drafts : [];
        const list = all.slice(0, 6);
        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('recentDraftsTitle')),
              h('p', { className: 'dws-sub' }, t('recentDraftsHint'))
            ),
            null
          ),
          list.length === 0
            ? emptyHint(t('recentDraftsEmpty'))
            : h(
                'div',
                { className: 'dws-field' },
                list.map(function (item, index) {
                  const draftItem = item && typeof item === 'object' ? item : {};
                  return h(
                    'div',
                    { key: 'recent-' + String(index), className: 'dws-draft' },
                    h(
                      'div',
                      { className: 'dws-draft-head' },
                      h('strong', null, textOf(draftItem.contact) || t('notAvailable')),
                      h('span', { className: 'dws-hint' }, t('draftAt', { time: formatTime(draftItem.createdAt, lang) }))
                    ),
                    h('p', { className: 'dws-draft-text' }, textOf(draftItem.preview))
                  );
                })
              )
        );
      }

      function renderAudit() {
        const all = Array.isArray(data.audit) ? data.audit : [];
        const list = all.slice(0, 10);
        return h(
          'section',
          { className: 'dws-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('auditTitle')),
              h('p', { className: 'dws-sub' }, t('auditHint'))
            ),
            null
          ),
          list.length === 0
            ? emptyHint(t('auditEmpty'))
            : h(
                'ul',
                { className: 'dws-audit' },
                list.map(function (entry, index) {
                  const item = entry && typeof entry === 'object' ? entry : {};
                  return h(
                    'li',
                    { key: 'audit-' + String(index), className: 'dws-audit-row' },
                    h('span', { className: 'dws-audit-time' }, formatTime(item.at, lang)),
                    h('span', { className: 'dws-badge dws-badge-brand' }, auditKindLabel(item.kind)),
                    h('span', null, textOf(item.contact)),
                    h('span', { className: 'dws-audit-detail' }, textOf(item.detail))
                  );
                })
              )
        );
      }

      function renderSaveBar() {
        return h(
          'section',
          { className: 'dws-card dws-savebar-card' },
          h(
            'div',
            { className: 'dws-card-head' },
            h(
              'div',
              { className: 'dws-head-text' },
              h('h3', { className: 'dws-title' }, t('saveTitle')),
              h('p', { className: 'dws-sub' }, t('dirty') + ' · ' + t('saveHint'))
            ),
            h(
              'div',
              { className: 'dws-head-actions' },
              h('button', { type: 'button', className: 'dws-btn', disabled: busy !== null, onClick: revert }, t('revert')),
              h(
                'button',
                { type: 'button', className: 'dws-btn dws-btn-primary', disabled: busy !== null, onClick: save },
                busy === 'save' ? t('saving') : t('save')
              )
            )
          ),
          patchResult.errors.length > 0 ? h('p', { className: 'dws-error-text', role: 'alert' }, patchResult.errors[0]) : null
        );
      }

      /* ---------------------------- 三种顶层状态 ---------------------------- */

      const styleNode = h('style', { key: 'dws-style' }, CSS);
      const pageHead = h(
        'header',
        { className: 'dws-page-head' },
        h('h2', { className: 'dws-page-title' }, t('sectionLabel')),
        h('p', { className: 'dws-page-desc' }, t('sectionDesc'))
      );

      if (status === 'loading' && !data) {
        return h('div', { className: 'dws-root' }, styleNode, pageHead, h('section', { className: 'dws-card' }, h('p', { className: 'dws-muted' }, t('loading'))));
      }

      if (!data) {
        return h(
          'div',
          { className: 'dws-root' },
          styleNode,
          pageHead,
          h(
            'section',
            { className: 'dws-card' },
            h('h3', { className: 'dws-title' }, t('loadFailed')),
            h('p', { className: 'dws-error-text', role: 'alert' }, loadError || t('unknownError')),
            h(
              'div',
              { className: 'dws-head-actions' },
              h(
                'button',
                { type: 'button', className: 'dws-btn dws-btn-primary', disabled: busy !== null, onClick: refresh },
                busy === 'refresh' ? t('refreshing') : t('retry')
              ),
              h(
                'button',
                { type: 'button', className: 'dws-btn', disabled: busy !== null, onClick: runDiagnose },
                busy === 'diagnose' ? t('diagnosing') : t('diagnose')
              )
            )
          ),
          checks !== null ? h('section', { className: 'dws-card' }, h('h3', { className: 'dws-title' }, t('checksTitle')), renderChecks()) : null
        );
      }

      return h(
        'div',
        { className: 'dws-root' },
        styleNode,
        pageHead,
        actionError ? h('p', { className: 'dws-banner dws-banner-error', role: 'alert' }, actionError) : null,
        renderStatus(),
        renderContacts(),
        renderTestReply(),
        renderBehavior(),
        renderPendingDrafts(),
        renderRecentDrafts(),
        renderAudit(),
        dirty ? renderSaveBar() : null,
        toast
          ? h(
              'div',
              {
                key: 'dws-toast',
                className: toast.kind === 'error' ? 'dws-toast dws-toast-error' : 'dws-toast dws-toast-ok',
                role: 'status',
              },
              toast.text
            )
          : null
      );
    }

    /* ============================== 插件装配 ============================== */

    function installLocale(ctx) {
      try {
        localeService = ctx && ctx.locale ? ctx.locale : null;
      } catch (error) {
        localeService = null;
      }

      const service = localeService;
      if (!service) return;

      const register = typeof service.register === 'function' ? service.register : null;
      const canBind = typeof service.bind === 'function';

      function registerDictionaries() {
        const disposers = [];
        if (register) {
          try {
            const offZh = register.call(service, LOCALE_NS, 'zh', ZH);
            if (typeof offZh === 'function') disposers.push(offZh);
          } catch (error) {
            /* 中文语言包注册失败不阻塞设置页 */
          }
          try {
            const offEn = register.call(service, LOCALE_NS, 'en', EN);
            if (typeof offEn === 'function') disposers.push(offEn);
          } catch (error) {
            /* 英文语言包注册失败时回退到内置词典 */
          }
        }
        if (canBind) {
          try {
            const bound = service.bind(LOCALE_NS);
            if (typeof bound === 'function') boundTranslate = bound;
          } catch (error) {
            boundTranslate = null;
          }
        }
        return function () {
          boundTranslate = null;
          for (let index = 0; index < disposers.length; index += 1) {
            try {
              disposers[index]();
            } catch (error) {
              /* 忽略 */
            }
          }
        };
      }

      try {
        if (typeof ctx.effect === 'function') {
          ctx.effect(registerDictionaries, 'dsh-dingtalk-self: locale dictionaries');
        } else {
          registerDictionaries();
        }
      } catch (error) {
        /* 忽略：没有 ctx.effect 时语言切换退化为初始语言 */
      }

      try {
        if (typeof service.subscribe === 'function' && typeof ctx.effect === 'function') {
          ctx.effect(
            function () {
              let off = null;
              try {
                off = service.subscribe(notifyLocale);
              } catch (error) {
                off = null;
              }
              return function () {
                try {
                  if (typeof off === 'function') off();
                } catch (error) {
                  /* 忽略 */
                }
              };
            },
            'dsh-dingtalk-self: locale changes'
          );
        }
      } catch (error) {
        /* 忽略：订阅失败时语言只在打开页面时确定一次 */
      }

      try {
        if (typeof ctx.on === 'function' && typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return ctx.on('locale/change', notifyLocale);
          }, 'dsh-dingtalk-self: locale event');
        }
      } catch (error) {
        /* 忽略：事件名在旧宿主上可能不存在 */
      }
    }

    function apply(ctx) {
      installLocale(ctx);
      try {
        ctx.slots.inject('settings.section', function () {
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dingtalk-self',
              order: 45,
              label: () => '钉钉代答',
            },
            SettingsPage
          );
        });
      } catch (error) {
        try {
          if (typeof console !== 'undefined' && console.error) console.error('[dsh-dingtalk-self] 注册设置页失败', error);
        } catch (ignored) {
          /* 忽略 */
        }
      }
    }

    return { inject: ['slots'], apply: apply };
  },
});
