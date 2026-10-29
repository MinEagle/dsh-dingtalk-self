/**
 * 设置 schema 与配置默认值。
 *
 * `@deepseek-ai/schemastery` 由宿主侧提供，但**不能假设顶层裸导入一定能解析**：
 * 本插件以 `link:` 方式装进 profile（node_modules/dsh-dingtalk-self → 工作区目录），
 * ESM 按真实路径解析依赖，于是工作区里没有 node_modules 时裸导入直接 ERR_MODULE_NOT_FOUND，
 * 插件会带着 `schemaAvailable = false` 静默降级 —— 设置页因此不出现（实测踩过）。
 *
 * 解决：先试裸导入；失败则从 profile 目录（DSH_PROFILE_DIR / ~/.dsh/profiles/*）用
 * createRequire 解析同一份 schemastery 再动态导入。profile 里各插件共享同一份 hoist 副本，
 * 拿到的是与宿主一致的那个实例。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const SCHEMA_SPEC = '@deepseek-ai/schemastery';
export const SETTINGS_NAMESPACE = 'dingtalk-self';

function resolutionBases() {
  const bases = [
    process.env.DSH_PROFILE_DIR,
    process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'profiles') : '',
    path.join(os.homedir(), '.dsh', 'profiles'),
    process.cwd()
  ].filter((v) => typeof v === 'string' && v !== '');
  return [...new Set(bases)];
}

async function loadSchema() {
  try {
    const mod = await import(SCHEMA_SPEC);
    const schema = mod?.default ?? mod;
    if (schema) return { schema, via: 'bare' };
  } catch { /* 工作区里没有依赖：继续按 profile 解析 */ }

  for (const base of resolutionBases()) {
    let resolved = '';
    try {
      const req = createRequire(path.join(base, 'package.json'));
      resolved = req.resolve(SCHEMA_SPEC);
    } catch {
      continue;
    }
    try {
      const mod = await import(pathToFileURL(resolved).href);
      const schema = mod?.default ?? mod;
      if (schema) return { schema, via: base };
    } catch { /* 试下一个 */ }
  }
  return { schema: null, via: null };
}

const loaded = await loadSchema();
const Schema = loaded.schema;

export const schemaAvailable = Schema !== null;
export const schemaSource = loaded.via;

/** 纯对象默认值：无 schema 时的兜底，也是运行时合并配置的基线。 */
export const DEFAULTS = {
  enabled: false,
  mode: 'draft',
  timeZone: 'Asia/Shanghai',
  selfUserId: '',
  pollIntervalSeconds: 60,
  overlapSeconds: 120,
  initialLookbackSeconds: 900,
  mergeWindowSeconds: 20,
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  contacts: [],
  limits: {
    maxRepliesPerHour: 10,
    minSecondsBetweenReplies: 30,
    maxReplyChars: 1200,
    maxFetchPerPoll: 50
  },
  replyFormat: 'markdown',
  attachments: { enabled: false, maxCount: 2, maxBytes: 10 * 1024 * 1024 },
  render: { enabled: false, maxBlocks: 1, maxRows: 10, minRows: 3, width: 960, pythonPath: '' },
  replyMarker: '（本条由助手代答）',
  guard: {
    enabled: true,
    stripCodeBlocks: true,
    redactPaths: true,
    redactInternalUrls: true,
    blockedWords: []
  },
  dwsPath: 'dws',
  dwsProfile: '',
  dshCliPath: '',
  agent: {
    kind: 'headless',
    profile: 'headless',
    sessionTitlePrefix: '钉钉·',
    timeoutSeconds: 240,
    persona: '语气自然、简洁，像本人在手机上随手回复',
    provider: '',
    model: '',
    reasoningEffort: '',
    readOnly: true,
    credentialSource: 'auto'
  }
};

function buildSchema(S) {
  const contact = S.object({
    name: S.string().description('联系人名称，用于日志与会话标题').required(),
    openDingTalkId: S.string().description('对方的 openDingTalkId（推荐，发送时无需反查）').default(''),
    userId: S.string().description('对方的 userId（可选）').default(''),
    workspaceId: S.string().description('绑定到哪个 DSH 工作区').required(),
    autoReply: S.boolean().description('是否允许真实发送（关掉则只出草稿）').default(false),
    sessionId: S.string().description('固定会话 ID；留空则首次自动生成并固定').default('')
  }).description('一条监听：一个联系人 × 一个 DSH 工作区');

  return S.object({
    enabled: S.boolean().description('总开关').default(false),
    mode: S.union(['draft', 'confirm', 'auto'])
      .description('draft=只出草稿；confirm=人工确认后发送；auto=直接发送')
      .default('draft'),
    timeZone: S.string().description('时区').default('Asia/Shanghai'),
    selfUserId: S.string().description('你自己的 userId，用于过滤自己发的消息').default(''),

    pollIntervalSeconds: S.natural().min(10).max(3600).description('轮询间隔（秒）').default(60),
    overlapSeconds: S.natural().min(0).max(3600).description('每次多回溯的秒数，配合去重防漏').default(120),
    initialLookbackSeconds: S.natural().min(60).max(86400)
      .description('首次启用（还没有游标）时回看多久的私聊，默认 15 分钟').default(900),
    mergeWindowSeconds: S.natural().min(0).max(600).description('连发合并窗口（秒）').default(20),

    quietHours: S.object({
      enabled: S.boolean().default(false),
      start: S.string().description('开始 HH:MM').default('22:00'),
      end: S.string().description('结束 HH:MM').default('08:00')
    }).description('静默时段：命中则转为草稿'),

    contacts: S.array(contact).description('监控名单；为空时插件什么都不做').default([]),

    limits: S.object({
      maxRepliesPerHour: S.natural().min(1).max(120).description('每个联系人每小时最多回复条数').default(10),
      minSecondsBetweenReplies: S.natural().min(0).max(3600).description('两条回复之间的最小间隔（秒）').default(30),
      maxReplyChars: S.natural().min(20).max(4000)
        .description('回复最大字数；超过会被截断并在末尾加省略号')
        .default(1200),
      maxFetchPerPoll: S.natural().min(1).max(200).description('每次轮询最多读取条数').default(50)
    }).description('限流'),

    replyFormat: S.union(['markdown', 'text'])
      .description('回复格式：markdown=钉钉会渲染加粗/列表/标题；text=纯文本')
      .default('markdown'),

    attachments: S.object({
      enabled: S.boolean().description('允许回复附带工作区里的图片/PDF').default(false),
      maxCount: S.natural().min(0).max(5).description('单条回复最多几个附件').default(2),
      maxBytes: S.natural().min(0).description('单个附件大小上限（字节）').default(10 * 1024 * 1024)
    }).description('附件：模型用 [[attach:路径]] 指令引用工作区里的文件'),

    render: S.object({
      enabled: S.boolean().description('允许模型输出表格/步骤块，由插件渲染成 PNG 一并发出').default(false),
      maxBlocks: S.natural().min(0).max(3).description('单条回复最多几张配图').default(1),
      maxRows: S.natural().min(1).max(30).description('表格/步骤最多几行').default(10),
      minRows: S.natural().min(1).max(10)
        .description('少于这么多行就不出图（避免一句话也配图）')
        .default(3),
      width: S.natural().min(480).max(1600).description('图片宽度（像素）').default(960),
      pythonPath: S.string().description('渲染用的 Python（需带 Pillow）；留空用 DSH 自带的').default('')
    }).description('配图渲染：表格 / 步骤'),

    replyMarker: S.string()
      .description('发出去的消息末尾附带的标识，说明这条是助手代答；留空则不附')
      .default('（本条由助手代答）'),

    guard: S.object({
      enabled: S.boolean().description('开启出站护栏').default(true),
      stripCodeBlocks: S.boolean().description('剥掉代码块').default(true),
      redactPaths: S.boolean().description('抹掉绝对路径').default(true),
      redactInternalUrls: S.boolean().description('抹掉 localhost / 内网地址').default(true),
      blockedWords: S.array(S.string()).description('出现即整条拦下不发').default([])
    }).description('出站护栏：防止把工作区里的代码/路径发给同事'),

    dwsPath: S.string().description('dws 可执行文件路径').default('dws'),
    dwsProfile: S.string().description('多组织时指定 profile').default(''),
    dshCliPath: S.string().description('dsh 可执行文件路径（headless 模式用）').default(''),

    agent: S.object({
      kind: S.union(['session', 'headless'])
        .description('session=在宿主内驱动会话；headless=调用 dsh headless 子进程')
        .default('headless'),
      profile: S.string().description('headless 模式使用的 profile 名').default('headless'),
      sessionTitlePrefix: S.string().description('自动创建会话的标题前缀').default('钉钉·'),
      timeoutSeconds: S.natural().min(10).max(900)
        .description('单次生成超时（秒）；查资料型回答通常要 1–3 分钟')
        .default(240),
      persona: S.string().description('回复口吻补充说明').default('语气自然、简洁，像本人在手机上随手回复'),
      provider: S.string().description('生成回复用的 provider；留空则跟随 DSH 当前默认模型').default(''),
      model: S.string().description('生成回复用的模型 id；留空则跟随 DSH 当前默认模型').default(''),
      reasoningEffort: S.string().description('推理档位（如 low/medium/high/max）；留空用模型默认').default(''),
      readOnly: S.boolean()
        .description('只读：生成回复时不改任何文件，只在工作区里查资料')
        .default(true),
      credentialSource: S.union(['auto', 'env', 'file'])
        .description('模型凭据来源：auto=环境变量优先、缺失时读 DSH 凭据文件；env=只读环境变量（不碰凭据文件）；file=只用凭据文件')
        .default('auto')
    }).description('生成回复的方式')
  }).description('钉钉代答：以你本人身份替你在钉钉上直接答复');
}

export const Config = Schema ? buildSchema(Schema) : DEFAULTS;

const MODES = new Set(['draft', 'confirm', 'auto']);

export function withDefaults(config) {
  const merged = { ...DEFAULTS, ...(config || {}) };
  merged.limits = { ...DEFAULTS.limits, ...(config?.limits || {}) };
  merged.guard = { ...DEFAULTS.guard, ...(config?.guard || {}) };
  merged.agent = { ...DEFAULTS.agent, ...(config?.agent || {}) };
  merged.quietHours = { ...DEFAULTS.quietHours, ...(config?.quietHours || {}) };
  merged.attachments = { ...DEFAULTS.attachments, ...(config?.attachments || {}) };
  merged.render = { ...DEFAULTS.render, ...(config?.render || {}) };
  if (!MODES.has(merged.mode)) merged.mode = DEFAULTS.mode;
  if (!Array.isArray(merged.contacts)) merged.contacts = [];
  merged.contacts = merged.contacts
    .filter((c) => c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim() !== '')
    .map((c) => ({
      name: c.name.trim(),
      openDingTalkId: typeof c.openDingTalkId === 'string' ? c.openDingTalkId.trim() : '',
      userId: typeof c.userId === 'string' ? c.userId.trim() : '',
      workspaceId: typeof c.workspaceId === 'string' ? c.workspaceId.trim() : '',
      autoReply: c.autoReply === true,
      sessionId: typeof c.sessionId === 'string' ? c.sessionId : ''
    }));
  return merged;
}

/** 校验来自 UI 的 patch；返回 { ok, error?, normalized? }。 */
export function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'patch 必须是对象' };
  }
  if (patch.mode !== undefined && !MODES.has(patch.mode)) {
    return { ok: false, error: `mode 只能是 draft / confirm / auto，收到 ${String(patch.mode)}` };
  }
  if (patch.agent !== undefined) {
    if (!patch.agent || typeof patch.agent !== 'object' || Array.isArray(patch.agent)) {
      return { ok: false, error: 'agent 必须是对象' };
    }
    const provider = typeof patch.agent.provider === 'string' ? patch.agent.provider.trim() : '';
    const model = typeof patch.agent.model === 'string' ? patch.agent.model.trim() : '';
    // 宿主只在两者都非空时才临时覆盖模型；只填一半会让「选了却静默不生效」。
    if ((provider === '') !== (model === '')) {
      return { ok: false, error: '模型要 provider 和 model 一起填（都留空＝跟随 DSH 默认）' };
    }
  }
  if (patch.contacts !== undefined) {
    if (!Array.isArray(patch.contacts)) return { ok: false, error: 'contacts 必须是数组' };
    for (const [i, c] of patch.contacts.entries()) {
      if (!c || typeof c !== 'object') return { ok: false, error: `第 ${i + 1} 个联系人不是对象` };
      if (typeof c.name !== 'string' || c.name.trim() === '') return { ok: false, error: `第 ${i + 1} 个联系人缺少 name` };
      if (typeof c.workspaceId !== 'string' || c.workspaceId.trim() === '') {
        return { ok: false, error: `联系人「${c.name}」缺少 workspaceId（必须先绑定一个 DSH 工作区）` };
      }
      if (!c.openDingTalkId && !c.userId) {
        return { ok: false, error: `联系人「${c.name}」需要 openDingTalkId 或 userId 之一` };
      }
    }
  }
  const normalized = { ...patch };
  if (normalized.agent !== undefined) {
    const agent = { ...normalized.agent };
    for (const key of ['provider', 'model', 'reasoningEffort']) {
      if (typeof agent[key] === 'string') agent[key] = agent[key].trim();
    }
    if (agent.readOnly === undefined) agent.readOnly = true;
    normalized.agent = agent;
  }
  if (normalized.contacts !== undefined) {
    normalized.contacts = withDefaults({ contacts: patch.contacts }).contacts;
  }
  return { ok: true, normalized };
}

export default Config;

/** 供宿主启动日志使用：schema 是否可用、从哪儿解析到的。 */
export function schemaStatus() {
  return { available: schemaAvailable, source: schemaSource, version: Schema?.version ?? null };
}

/** 判断某个路径能否作为配置目录写（用于降级提示，不抛错）。 */
export function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
