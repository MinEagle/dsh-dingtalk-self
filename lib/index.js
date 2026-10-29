import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Config, {
  SETTINGS_NAMESPACE,
  DEFAULTS,
  schemaAvailable,
  schemaStatus,
  withDefaults,
  validatePatch
} from './settings.js';
import { createStore } from './core/state.js';
import { createDws } from './core/dws.js';
import { runCycle } from './core/pipeline.js';
import { contactKey, tidyReply } from './core/policy.js';
import { guardReply } from './core/guard.js';
import { readCredentialEnv } from './core/credentials.js';
import { renderToPng } from './core/render.js';
import { buildSimulationPayload } from './core/simulate.js';
import { createHeadlessAgent, resolveDshPath } from './agents/headless.js';
import { createSessionAgent } from './agents/session.js';
import { createApi, makeConfirmHandler, API_ROUTE_PATHS } from './rpc.js';

const name = 'dsh-dingtalk-self';
const inject = ['settings'];

/** profile 里的条目 id（== 包名），settings.describe/update 按它寻址。 */
const ENTRY_ID = 'dsh-dingtalk-self';

const HEARTBEAT_MS = 5_000;
const SETTINGS_CACHE_MS = 3_000;

const log = (...a) => console.log('[dingtalk-self]', ...a);
const warn = (...a) => console.warn('[dingtalk-self]', ...a);

const PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readOwnVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function dataDir() {
  return path.join(dshHome(), 'data', 'dsh-dingtalk-self');
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

function apply(ctx, config) {
  const version = readOwnVersion();
  const bootedAt = new Date().toISOString();
  const dir = dataDir();
  const fileConfigPath = path.join(dir, 'config.json');
  let fileConfigMtime = -1;
  let cachedFileConfig = null;

  // 启动心跳：stdout 看不到时，这是"插件到底有没有在真实宿主里加载"的唯一凭据。
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'boot.log'),
      `${bootedAt} loaded pid=${process.pid} version=${version} schema=${schemaAvailable ? 'yes' : 'no'} mode=${config?.mode ?? '?'} contacts=${config?.contacts?.length ?? 0} enabled=${config?.enabled ?? '?'}\n`
    );
  } catch { /* 目录不可写时忽略 */ }

  const store = createStore(dir);
  if (store.degraded) {
    warn('状态目录不可写，已降级为内存存储：急停与去重游标在重启后不会保留');
  }

  function readFileConfig() {
    try {
      const st = fs.statSync(fileConfigPath);
      if (st.mtimeMs === fileConfigMtime) return cachedFileConfig;
      fileConfigMtime = st.mtimeMs;
      cachedFileConfig = JSON.parse(fs.readFileSync(fileConfigPath, 'utf8'));
      return cachedFileConfig;
    } catch {
      fileConfigMtime = -1;
      cachedFileConfig = null;
      return null;
    }
  }

  // ---- 生成回复用的模型与凭据 ----
  const credentialsFile = path.join(dshHome(), '.credentials.yaml');
  const credentialCache = {};

  function credentialEnv() {
    const source = getInfo().config.agent?.credentialSource || 'auto';
    if (source === 'env') return {}; // 明确要求不碰凭据文件
    return readCredentialEnv(credentialsFile, credentialCache);
  }

  /** 生效模型：插件配置 → DSH 当前默认模型 → 由 headless profile 自己决定。 */
  function effectiveModel() {
    const agentCfg = getInfo().config.agent || {};
    if (agentCfg.provider && agentCfg.model) {
      return {
        provider: agentCfg.provider,
        model: agentCfg.model,
        reasoningEffort: agentCfg.reasoningEffort || '',
        source: 'config'
      };
    }
    try {
      const svc = safeGet('agentDefaultModel');
      const current = svc && typeof svc.currentSelection === 'function' ? svc.currentSelection() : null;
      if (current && current.provider && current.model) {
        return {
          provider: current.provider,
          model: current.model,
          reasoningEffort: current.reasoningEffort ? String(current.reasoningEffort) : '',
          source: 'default'
        };
      }
    } catch { /* 宿主没提供就退回 profile 默认 */ }
    return { provider: '', model: '', reasoningEffort: '', source: 'profile' };
  }

  function safeGet(service) {
    try {
      const direct = ctx.get?.(service);
      if (direct) return direct;
      return ctx[service];
    } catch {
      return undefined;
    }
  }

  // ---- 配置来源：settings 命名空间（DSH 原生）→ 覆盖文件 → 默认值 ----
  let settingsCache = { at: 0, row: null };
  let registeredNamespace = null;
  let registerError = null;
  const runtimeFlags = { toolsInjected: false, toolsRegistered: 0, settingsSource: null };

  function settingsRow({ force = false } = {}) {
    const now = Date.now();
    if (!force && settingsCache.row && now - settingsCache.at < SETTINGS_CACHE_MS) return settingsCache.row;
    let row = null;
    try {
      const settings = safeGet('settings');
      if (settings && typeof settings.describe === 'function') {
        const list = settings.describe();
        const rows = Array.isArray(list) ? list : [];
        row = rows.find((r) => r && (r.ns === SETTINGS_NAMESPACE || r.ns === ENTRY_ID)) || null;
      }
    } catch (err) {
      warn('读取 settings 失败：', err.message);
    }
    settingsCache = { at: now, row };
    return row;
  }

  function getInfo({ force = false } = {}) {
    const row = settingsRow({ force });
    const base = row && row.value && typeof row.value === 'object' ? row.value : {};
    const fromFile = readFileConfig();
    const merged = withDefaults(deepMerge(base, fromFile || {}));
    return {
      config: merged,
      source: fromFile ? 'file' : (row ? 'settings' : 'default'),
      overrideFile: Boolean(fromFile),
      revision: row?.revision ?? null
    };
  }

  async function saveConfig(patch) {
    const checked = validatePatch(patch);
    if (!checked.ok) return { ok: false, error: checked.error };
    const normalized = checked.normalized;

    const settings = safeGet('settings');
    if (settings && typeof settings.update === 'function') {
      let row = settingsRow({ force: true });
      for (const ns of [ENTRY_ID, SETTINGS_NAMESPACE]) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await settings.update(ns, normalized, row?.revision);
            settingsCache = { at: 0, row: null };
            return { ok: true, source: 'settings' };
          } catch (err) {
            if (attempt === 0 && /revision/i.test(String(err?.message))) {
              row = settingsRow({ force: true });
              continue;
            }
            break;
          }
        }
      }
    }

    // 降级：写 dataDir/config.json（优先级高于 settings 之外的其余来源）
    try {
      fs.mkdirSync(dir, { recursive: true });
      const current = readFileConfig() || {};
      const next = deepMerge(current, normalized);
      fs.writeFileSync(fileConfigPath, JSON.stringify(next, null, 2));
      fileConfigMtime = -1;
      cachedFileConfig = null;
      return { ok: true, source: 'file' };
    } catch (err) {
      return { ok: false, error: `写入 ${fileConfigPath} 失败：${err.message}` };
    }
  }

  // 设置命名空间：让 DSH 的设置页知道本插件有 Config（自动表单兜底）
  // 插件已声明 inject = ['settings']，apply 执行时 ctx.settings 必定可用；
  // 不要再套一层 ctx.inject（实测那层回调在真实宿主里不会触发，导致命名空间静默缺失）。
  if (!schemaAvailable) {
    warn('未解析到 @deepseek-ai/schemastery：跳过设置命名空间注册，插件以默认配置运行', JSON.stringify(schemaStatus()));
  } else {
    try {
      const settings = ctx.settings ?? safeGet('settings');
      runtimeFlags.settingsAvailable = Boolean(settings);
      runtimeFlags.settingsKeys = settings && typeof settings === 'object'
        ? Object.keys(settings).slice(0, 24)
        : [];
      if (settings && typeof settings.register === 'function') {
        settings.register(SETTINGS_NAMESPACE, Config);
        registeredNamespace = SETTINGS_NAMESPACE;
        // 让宿主为本次条目自动生成设置页（自定义客户端页存在时宿主会让位）
        if (typeof settings.configure === 'function') {
          try {
            settings.configure({ auto: true }, ctx.fiber);
          } catch (err) {
            warn('settings.configure(auto) 失败：', err.message);
          }
        }
      } else {
        // 本版本的 settings 服务没有 register（Config schema 由 Loader 负责），
        // 配置读写走 dataDir/config.json —— 不是错误，只记录来源。
        registerError = `settings 服务未提供 register（register=${typeof settings?.register}），配置存 dataDir/config.json`;
      }
    } catch (err) {
      registerError = err.message;
      warn('注册设置命名空间失败：', err.message);
    }
  }

  for (const eventName of ['settings/changed', 'settings/updated']) {
    try {
      ctx.on(eventName, () => {
        settingsCache = { at: 0, row: null };
      });
    } catch { /* ignore */ }
  }

  const dws = createDws({ dwsPath: getInfo().config.dwsPath || 'dws', profile: getInfo().config.dwsProfile || '' });

  function listWorkspaces() {
    try {
      const registry = safeGet('workspaceRegistry');
      if (registry && typeof registry.list === 'function') {
        return registry.list()
          .map((w) => ({
            id: String(w?.id ?? w?.workspaceId ?? ''),
            title: String(w?.title ?? w?.name ?? w?.path ?? ''),
            path: String(w?.path ?? '')
          }))
          .filter((w) => w.id !== '');
      }
    } catch (err) {
      warn('读取工作区列表失败：', err.message);
    }
    return [];
  }

  const adapters = {
    async listMessages(contact, sinceMs) {
      return dws.listMessages(contact, {
        sinceMs,
        limit: getInfo().config.limits?.maxFetchPerPoll ?? 50,
        timeZone: getInfo().config.timeZone || 'Asia/Shanghai'
      });
    },
    async generate({ contact, messages, sessionId }) {
      return agentFor(contact).generate({ contact, messages, sessionId });
    },
    async send(contact, text, idempotencyKey) {
      return dws.sendMessage(contact, text, { aiTag: false, idempotencyKey });
    },
    async sendFile(contact, filePath, idempotencyKey) {
      return dws.sendFile(contact, filePath, { aiTag: false, idempotencyKey });
    },
    attachmentScope(contact) {
      return { roots: attachmentRoots(contact), baseDir: resolveWorkspaceCwd(contact.workspaceId) };
    },
    async renderSpec(spec) {
      const cfg = getInfo().config;
      return renderToPng(spec, {
        pythonPath: cfg.render?.pythonPath || '',
        outDir: path.join(dir, 'outbox'),
        width: cfg.render?.width || 960
      });
    }
  };

  function attachmentRoots(contact) {
    const roots = [resolveWorkspaceCwd(contact.workspaceId), dir, path.join(dir, 'outbox')].filter(Boolean);
    return [...new Set(roots)];
  }

  function agentFor(contact) {
    const cfg = getInfo().config;
    const agentCfg = cfg.agent || {};
    if (agentCfg.kind === 'session') {
      return createSessionAgent({
        sessions: safeGet('sessions'),
        workspaceId: contact.workspaceId,
        timeoutSeconds: agentCfg.timeoutSeconds,
        persona: agentCfg.persona
      });
    }
    return createHeadlessAgent({
      dshPath: cfg.dshCliPath || '',
      profile: agentCfg.profile || 'headless',
      timeoutSeconds: agentCfg.timeoutSeconds || 120,
      cwd: resolveWorkspaceCwd(contact.workspaceId),
      persona: agentCfg.persona,
      model: effectiveModel(),
      readOnly: agentCfg.readOnly !== false,
      credentialEnv: credentialEnv(),
      replyFormat: cfg.replyFormat === 'text' ? 'text' : 'markdown',
      attachments: cfg.attachments?.enabled === true,
      attachmentMaxCount: cfg.attachments?.maxCount ?? 2,
      renderImages: cfg.render?.enabled === true,
      renderMaxRows: cfg.render?.maxRows ?? 10
    });
  }

  function resolveWorkspaceCwd(workspaceId) {
    if (!workspaceId) return '';
    const found = listWorkspaces().find((w) => w.id === workspaceId);
    return found?.path || '';
  }

  const handleConfirm = makeConfirmHandler({ getConfig: () => getInfo().config, store, adapters });

  function settingsDiagnostics() {
    const namespaces = [];
    try {
      const settings = safeGet('settings');
      if (settings && typeof settings.describe === 'function') {
        for (const row of settings.describe() || []) {
          if (row && typeof row.ns === 'string') namespaces.push(row.ns);
        }
      }
    } catch (err) {
      namespaces.push(`<describe 失败：${err.message}>`);
    }
    return {
      registeredNamespace,
      registerError,
      toolsInjected: runtimeFlags.toolsInjected,
      toolsRegistered: runtimeFlags.toolsRegistered,
      settingsAvailable: runtimeFlags.settingsAvailable ?? null,
      settingsKeys: runtimeFlags.settingsKeys ?? [],
      namespaces,
      schema: schemaStatus(),
      routes: API_ROUTE_PATHS,
      dshCli: resolveDshPath(getInfo().config.dshCliPath || ''),
      model: effectiveModel(),
      readOnly: getInfo().config.agent?.readOnly !== false,
      credentialKeys: Object.keys(credentialEnv()).length
    };
  }

  /**
   * 模拟回复：用真实生成通道跑一遍，但不发送、不动游标、不写待确认队列。
   * 用来在设置页里直接试「这条消息它到底会怎么答」。
   */
  async function simulateReply(message) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (text === '') return { ok: false, error: '先填一条对方可能发来的消息' };
    const cfg = getInfo().config;
    const contact = (cfg.contacts || [])[0];
    if (!contact) return { ok: false, error: '还没有联系人：先在设置页加一个，模拟回复会用它绑定的工作区' };

    const agent = agentFor(contact);
    const started = Date.now();
    const gen = await agent.generate({
      contact,
      messages: [{ messageId: `sim-${started}`, text, createTime: started }],
      sessionId: ''
    });
    const durationMs = Date.now() - started;
    if (!gen.ok) return { ok: false, error: gen.error, durationMs, model: effectiveModel() };

    const payload = await buildSimulationPayload({
      rawReply: gen.reply,
      cfg,
      contact,
      attachmentScope: adapters.attachmentScope,
      renderSpec: async (spec) => {
        const rendered = await renderToPng(spec, {
          pythonPath: cfg.render?.pythonPath || '',
          outDir: path.join(dir, 'outbox'),
          width: cfg.render?.width || 960
        });
        if (!rendered.ok) return rendered;
        let dataUrl = null;
        try {
          if (rendered.bytes <= 600 * 1024) {
            dataUrl = `data:image/png;base64,${fs.readFileSync(rendered.path).toString('base64')}`;
          }
        } catch { /* 读不到就不给缩略图 */ }
        return { ...rendered, dataUrl };
      }
    });

    if (!payload.ok) {
      return { ok: false, error: payload.error, durationMs, raw: payload.raw, model: effectiveModel() };
    }
    return {
      ...payload,
      durationMs,
      model: effectiveModel(),
      readOnly: cfg.agent?.readOnly !== false,
      workspace: contact.workspaceId,
      note: '模拟不会发送；每次模拟都会新建一个会话，不影响该联系人的真实上下文'
    };
  }

  /** 列出宿主当前注册的 provider 与模型，供设置页选择（失败不致命）。 */
  async function listModelChoices() {
    const llm = safeGet('llm');
    if (!llm || typeof llm.listProviders !== 'function') return [];
    let providers = [];
    try {
      providers = llm.listProviders() || [];
    } catch (err) {
      warn('枚举 provider 失败：', err.message);
      return [];
    }
    const out = [];
    for (const provider of providers) {
      const id = String(provider?.id || '');
      if (id === '') continue;
      const entry = { id, name: String(provider?.name || id), models: [] };
      try {
        const models = typeof llm.listModels === 'function'
          ? await Promise.race([
              llm.listModels(id),
              new Promise((resolve) => setTimeout(() => resolve([]), 4_000))
            ])
          : [];
        entry.models = (Array.isArray(models) ? models : [])
          .slice(0, 80)
          .map((m) => ({ id: String(m?.id || ''), name: String(m?.name || m?.id || '') }))
          .filter((m) => m.id !== '');
      } catch (err) {
        entry.error = err.message;
      }
      out.push(entry);
    }
    return out;
  }

  const api = createApi({
    getInfo,
    getModelInfo: effectiveModel,
    isReadOnly: () => getInfo().config.agent?.readOnly !== false,
    listModels: listModelChoices,
    getCredentialInfo: () => ({ file: credentialsFile, keys: Object.keys(credentialEnv()) }),
    simulate: simulateReply,
    diagnostics: settingsDiagnostics,
    saveConfig,
    store,
    dws,
    dataDir: dir,
    version,
    bootedAt,
    listWorkspaces,
    handleConfirm,
    runNow: () => runOneCycle('manual'),
    resolveDshCli: () => resolveDshPath(getInfo().config.dshCliPath || ''),
    log
  });

  // ---- HTTP 路由：客户端设置页的数据通道 ----
  // 注意：实测本宿主 `kind: 'prefix'` 只匹配注册路径本身，子路径不会命中（dshmarket 也全部用 exact）。
  // 所以按端点逐个注册 exact 路由，method 交给 dispatch 判定。
  try {
    ctx.inject(['webServer'], (wctx) => {
      const webServer = wctx.get ? wctx.get('webServer') : wctx.webServer;
      if (!webServer || typeof webServer.register !== 'function') {
        warn('宿主没有暴露 webServer.register，设置页数据通道不可用');
        return;
      }
      const disposers = [];
      for (const routePath of API_ROUTE_PATHS) {
        try {
          const dispose = webServer.register({
            kind: 'exact',
            path: routePath,
            handler: (req, res) => api.dispatch(req, res)
          });
          if (typeof dispose === 'function') disposers.push(dispose);
        } catch (err) {
          warn(`注册路由 ${routePath} 失败：`, err.message);
        }
      }
      if (disposers.length === 0) return;
      log(`HTTP 路由已注册（${disposers.length} 条）：${API_ROUTE_PATHS.join(' ')}`);
      try {
        wctx.effect(() => () => {
          for (const dispose of disposers) {
            try { dispose(); } catch { /* ignore */ }
          }
        }, 'dingtalk-self http routes');
      } catch { /* 作用域不支持 effect 时交给宿主销毁 */ }
    });
  } catch (err) {
    warn('HTTP 路由通道不可用：', err.message);
  }

  let running = false;
  let lastRunAt = 0;
  let lastSummary = null;

  /** 把一轮的结论压成一行，给设置页和状态文件用（"查了、没新消息"也要看得见）。 */
  function summarizeCycle(summary, reason, at) {
    const skippedReason = summary.skippedReason || null;
    return {
      at,
      reason,
      skippedReason,
      contacts: summary.contacts || 0,
      fetched: summary.fetched || 0,
      fresh: summary.fresh || 0,
      drafts: summary.drafts.length,
      confirms: summary.confirms.length,
      sent: summary.sent.length,
      blocked: summary.blocked.length,
      skipped: summary.skipped.length,
      deferred: summary.deferred.length,
      errors: summary.errors.length
    };
  }

  /**
   * 跑一轮。`manual` 时由设置页「立即检查一次」触发，绕过轮询间隔；
   * 仍然尊重总开关与急停——手动按钮不该能把停用的插件跑起来。
   */
  async function runOneCycle(reason) {
    if (running) return { ok: false, error: '上一轮还在跑，请稍后再试' };
    const cfg = getInfo().config;
    if (!cfg.enabled) return { ok: false, error: '插件未启用：先打开「总开关」' };
    if (store.isPaused()) return { ok: false, error: '已急停：先解除急停再检查' };

    running = true;
    lastRunAt = Date.now();
    const at = new Date(lastRunAt).toISOString();
    try {
      const state = store.load();
      const summary = await runCycle({
        config: cfg, state, store, adapters, now: lastRunAt,
        logger: { info: log, warn, error: warn }
      });
      const compact = summarizeCycle(summary, reason, at);
      state.lastCycle = compact;
      store.save(state);
      lastSummary = summary;
      const touched = compact.drafts + compact.confirms + compact.sent + compact.blocked + compact.errors;
      if (touched > 0 || reason === 'manual') {
        log(`一轮完成（${reason}）：`, JSON.stringify(compact));
      }
      return { ok: true, cycle: compact };
    } catch (err) {
      warn('轮询周期异常：', err.message);
      return { ok: false, error: `轮询周期异常：${err.message}` };
    } finally {
      running = false;
    }
  }

  async function tick() {
    if (running) return;
    const cfg = getInfo().config;
    if (!cfg.enabled) return;
    const intervalMs = Math.max(10, cfg.pollIntervalSeconds || 60) * 1000;
    const now = Date.now();
    if (now - lastRunAt < intervalMs) return;
    await runOneCycle('auto');
  }

  try {
    ctx.effect(() => {
      const timer = setInterval(tick, HEARTBEAT_MS);
      timer.unref?.();
      return () => clearInterval(timer);
    }, 'dingtalk-self polling');
  } catch (err) {
    warn('启动轮询失败：', err.message);
  }

  registerTools(ctx, {
    runtimeFlags,
    store,
    dws,
    getInfo,
    getLastSummary: () => lastSummary,
    handleConfirm,
    listWorkspaces,
    version
  });

  const info = getInfo();
  log(`已加载 v${version}：mode=${info.config.mode} contacts=${info.config.contacts.length} enabled=${info.config.enabled} source=${info.source} schema=${schemaAvailable ? 'yes' : 'no'}`);
}

function registerTools(ctx, deps) {
  const defs = [
    {
      name: 'dingtalk_self_status',
      description: '查看钉钉代答插件的登录态、监控名单、待确认草稿与统计',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => String(value ?? '')
      },
      execute: async () => {
        const info = deps.getInfo();
        const auth = await deps.dws.authStatus();
        const state = deps.store.load();
        return JSON.stringify({
          version: deps.version,
          authenticated: auth.ok ? auth.authenticated : false,
          authError: auth.ok ? null : auth.error?.message,
          paused: deps.store.isPaused(),
          mode: info.config.mode,
          enabled: info.config.enabled,
          configSource: info.source,
          contacts: (info.config.contacts || []).map((c) => ({
            name: c.name,
            workspaceId: c.workspaceId,
            autoReply: c.autoReply,
            cursor: state.cursors[contactKey(c)] ?? null
          })),
          pendingConfirm: Object.keys(state.confirm || {}).length,
          stats: state.stats,
          recentAudit: (state.audit || []).slice(-10)
        }, null, 2);
      }
    },
    {
      name: 'dingtalk_self_confirm',
      description: '发送或丢弃等待确认的钉钉回复草稿。action=send 发送，action=discard 丢弃',
      parameters: {
        type: 'object',
        properties: {
          contact: { type: 'string', description: '联系人名称' },
          action: { type: 'string', enum: ['send', 'discard'] }
        },
        required: ['contact', 'action']
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => String(value ?? '')
      },
      execute: async (args) => {
        const target = (deps.getInfo().config.contacts || []).find((c) => c.name === args.contact);
        if (!target) return `未找到联系人：${args.contact}`;
        const result = await deps.handleConfirm(target, args.action === 'send' ? 'send' : 'discard');
        return result.ok ? '已完成' : `失败：${result.error}`;
      }
    },
    {
      name: 'dingtalk_self_pause',
      description: '急停或恢复钉钉自动回复',
      parameters: {
        type: 'object',
        properties: { paused: { type: 'boolean' } },
        required: ['paused']
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => String(value ?? '')
      },
      execute: async (args) => {
        deps.store.setPaused(args.paused === true);
        return args.paused === true ? '已急停' : '已恢复';
      }
    },
    {
      name: 'dingtalk_self_config',
      description: '读取或写入钉钉自动回复插件配置（开关、模式、联系人名单）。action=read 读取，action=write 写入 patch',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write'] },
          patch: { type: 'object', description: 'action=write 时要合并的字段' }
        },
        required: ['action']
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => String(value ?? '')
      },
      execute: async (args) => {
        const info = deps.getInfo({ force: true });
        if (args.action !== 'write') {
          return JSON.stringify({ config: info.config, configSource: info.source, workspaces: deps.listWorkspaces() }, null, 2);
        }
        const saved = await deps.saveConfig(args.patch || {});
        return JSON.stringify(saved, null, 2);
      }
    }
  ];

  try {
    ctx.inject(['tools'], (tctx) => {
      deps.runtimeFlags.toolsInjected = true;
      const tools = (tctx.get ? tctx.get('tools') : null) ?? tctx.tools;
      if (!tools || typeof tools.register !== 'function') {
        warn('宿主没有暴露 tools.register，跳过工具注册');
        return;
      }
      let count = 0;
      for (const def of defs) {
        try {
          tools.register(def);
          count += 1;
        } catch (err) {
          warn(`注册工具 ${def.name} 失败：`, err.message);
        }
      }
      deps.runtimeFlags.toolsRegistered = count;
    });
  } catch (err) {
    warn('工具注册通道不可用：', err.message);
  }
}

export { Config, apply, inject, name };
