/**
 * 宿主侧 HTTP API（客户端设置页唯一的数据通道）。
 *
 * 契约见 docs/client-host-api.md。选择 `ctx.webServer.register` 而不是包内 RPC：
 * `WebRoute { kind, path, handler }` 是宿主公开文档化的注册点（dshmarket 同款做法），
 * 而 client 的 `host.call` 在宿主侧没有可核对的注册契约。
 *
 * 所有 handler 自行 try/catch：任何异常都必须变成 { ok: false, error }，不能穿透到 HTTP 服务器。
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { contactKey } from './core/policy.js';
import { confirmAndSend, discardConfirm } from './core/pipeline.js';

export const ROUTE_PREFIX = '/dsh-dingtalk-self/';
export const API_PREFIX = '/dsh-dingtalk-self/api/';

/**
 * 逐个端点注册的 exact 路由。
 * 实测 `kind: 'prefix'` 在本宿主只匹配注册路径本身（子路径落到 SPA fallback），
 * dshmarket 也是全部用 exact，所以这里按端点显式声明。
 */
export const API_ROUTE_PATHS = [
  `${API_PREFIX}state`,
  `${API_PREFIX}config`,
  `${API_PREFIX}pause`,
  `${API_PREFIX}confirm`,
  `${API_PREFIX}diagnose`,
  `${API_PREFIX}contacts/search`,
  `${API_PREFIX}cycle`,
  `${API_PREFIX}models`,
  `${API_PREFIX}test-reply`
];

const MAX_BODY_BYTES = 256 * 1024;
const AUTH_CACHE_MS = 10_000;
const AUDIT_SHOWN = 30;
const DRAFTS_SHOWN = 20;

function sendJson(res, status, payload) {
  let body;
  try {
    body = JSON.stringify(payload);
  } catch (err) {
    body = JSON.stringify({ ok: false, error: `响应序列化失败：${err.message}` });
    status = 500;
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish({ ok: false, error: `请求体超过 ${MAX_BODY_BYTES} 字节` });
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return finish({ ok: true, value: {} });
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return finish({ ok: false, error: '请求体必须是 JSON 对象' });
        }
        finish({ ok: true, value: parsed });
      } catch (err) {
        finish({ ok: false, error: `请求体不是合法 JSON：${err.message}` });
      }
    });
    req.on('error', (err) => finish({ ok: false, error: `读取请求体失败：${err.message}` }));
  });
}

function runCommand(command, args, { timeoutMs = 15_000 } = {}) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, code: err.code, message: String(stderr || err.message || '').trim().slice(0, 500) });
          return;
        }
        resolve({ ok: true, stdout: String(stdout || '').trim() });
      });
    } catch (err) {
      resolve({ ok: false, code: err.code, message: err.message });
    }
  });
}

function auditDetail(entry) {
  const model = typeof entry.model === 'string' && entry.model !== '' ? ` · ${entry.model}` : '';
  if (entry.reason) return `${entry.reason}${model}`;
  if (entry.error) return `${entry.stage ? `[${entry.stage}] ` : ''}${String(entry.error).slice(0, 200)}`;
  if (entry.reply) return `回复：${String(entry.reply).slice(0, 120)}${model}${entry.truncated ? ' · 已截断' : ''}`;
  return entry.stage ? `[${entry.stage}]${model}` : '';
}

/** 把 dws 的原始错误翻成用户能动手处理的中文。 */
function describeDwsFailure(error) {
  const raw = String(error?.message || error || '').trim();
  if (raw === '') return 'dws 调用失败：请检查 dws 是否已安装并登录';
  const low = raw.toLowerCase();
  if (low.includes('enoent') || low.includes('command not found') || low.includes('not found')) {
    return '找不到 dws 命令：请先安装 dws CLI，或在插件配置里填写 dwsPath';
  }
  if (/login|auth|unauthor|登录|授权|token|credential/i.test(raw)) {
    // 原始报错是多行 JSON，直接塞进 UI 很脏；只给可操作的一句话。
    return 'dws 未登录：请先在终端执行 dws auth login';
  }
  // 其余错误压成单行并截断，避免把 dws 的 JSON 糊到界面上。
  return raw.replace(/\s+/g, ' ').slice(0, 240);
}

/**
 * @param {object} deps
 * @param {() => { config: object, source: string, overrideFile: boolean }} deps.getInfo
 * @param {(patch: object) => Promise<{ ok: boolean, error?: string, source?: string }>} deps.saveConfig
 * @param {object} deps.store  createStore() 的返回值
 * @param {object} deps.dws    createDws() 的返回值
 * @param {string} deps.dataDir
 * @param {string} deps.version
 * @param {string} deps.bootedAt
 * @param {() => Array<{id: string, title: string, path: string}>} deps.listWorkspaces
 * @param {(contact: object, action: 'send' | 'discard') => Promise<{ ok: boolean, error?: string }>} deps.handleConfirm
 * @param {(...args: unknown[]) => void} [deps.log]
 */
export function createApi(deps) {
  const log = deps.log || (() => {});
  let authCache = { at: 0, value: null, self: null };

  async function authInfo({ force = false } = {}) {
    const now = Date.now();
    if (!force && authCache.value && now - authCache.at < AUTH_CACHE_MS) {
      return { auth: authCache.value, self: authCache.self };
    }
    const res = await deps.dws.authStatus();
    const auth = res.ok
      ? {
          ok: true,
          authenticated: res.authenticated === true,
          error: res.authenticated === true ? null : '请先在终端执行 dws auth login'
        }
      : { ok: false, authenticated: false, error: res.error?.message || 'dws 调用失败' };

    let self = null;
    if (auth.authenticated) {
      const me = await deps.dws.whoAmI();
      if (me.ok && me.user) {
        self = {
          userId: me.user.userId || '',
          nick: me.user.nick || me.user.name || me.user.userName || ''
        };
      }
    }
    authCache = { at: now, value: auth, self };
    return { auth, self };
  }

  function buildState({ force }) {
    const info = deps.getInfo();
    const state = deps.store.load();
    const contactNames = new Map();
    for (const c of info.config.contacts || []) contactNames.set(contactKey(c), c.name);

    const pendingConfirm = Object.entries(state.confirm || {}).map(([key, entry]) => ({
      key,
      contact: entry?.contact || contactNames.get(key) || key,
      text: String(entry?.reply || ''),
      createdAt: entry?.createdAt || null
    }));

    const drafts = (state.audit || [])
      .filter((e) => e.action === 'draft')
      .slice(-DRAFTS_SHOWN)
      .reverse()
      .map((e) => ({
        contact: e.contact || '',
        file: null,
        createdAt: e.ts || null,
        preview: String(e.reply || '').slice(0, 200)
      }));

    const audit = (state.audit || []).slice(-AUDIT_SHOWN).reverse().map((e) => ({
      at: e.ts || null,
      kind: e.action || 'unknown',
      contact: e.contact || '',
      detail: auditDetail(e)
    }));

    return { info, state, pendingConfirm, drafts, audit };
  }

  const handlers = {
    async 'GET state'(req, res) {
      const { info, state, pendingConfirm, drafts, audit } = buildState({ force: false });
      const { auth, self } = await authInfo({});
      sendJson(res, 200, {
        ok: true,
        plugin: {
          name: 'dsh-dingtalk-self',
          version: deps.version,
          bootedAt: deps.bootedAt,
          dataDir: deps.dataDir,
          degraded: deps.store.degraded === true
        },
        config: {
          ...info.config,
          contacts: (info.config.contacts || []).map((c) => ({
            ...c,
            cursor: state.cursors?.[contactKey(c)] ?? null
          }))
        },
        configSource: info.source,
        overrideFile: info.overrideFile,
        paused: deps.store.isPaused(),
        auth: {
          ok: auth.ok,
          authenticated: auth.authenticated,
          self,
          error: auth.error
        },
        workspaces: deps.listWorkspaces(),
        pendingConfirm,
        drafts,
        audit,
        stats: state.stats || {},
        lastCycle: state.lastCycle || null,
        model: typeof deps.getModelInfo === 'function' ? deps.getModelInfo() : null,
        readOnly: typeof deps.isReadOnly === 'function' ? deps.isReadOnly() : null,
        diagnostics: typeof deps.diagnostics === 'function' ? deps.diagnostics() : null
      });
    },

    async 'POST config'(req, res) {
      const body = await readBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const { patch } = body.value;
      if (!patch || typeof patch !== 'object') {
        return sendJson(res, 400, { ok: false, error: '缺少 patch 字段' });
      }
      const saved = await deps.saveConfig(patch);
      if (!saved.ok) return sendJson(res, 200, { ok: false, error: saved.error || '保存失败' });
      const info = deps.getInfo();
      sendJson(res, 200, { ok: true, config: info.config, configSource: saved.source || info.source });
    },

    async 'POST pause'(req, res) {
      const body = await readBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      deps.store.setPaused(body.value.paused === true);
      sendJson(res, 200, { ok: true, paused: deps.store.isPaused() });
    },

    async 'POST confirm'(req, res) {
      const body = await readBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const { contact, action } = body.value;
      if (typeof contact !== 'string' || contact === '') {
        return sendJson(res, 400, { ok: false, error: '缺少 contact' });
      }
      if (action !== 'send' && action !== 'discard') {
        return sendJson(res, 400, { ok: false, error: 'action 只能是 send 或 discard' });
      }
      const info = deps.getInfo();
      const target = (info.config.contacts || []).find((c) => c.name === contact);
      if (!target) return sendJson(res, 200, { ok: false, error: `未找到联系人：${contact}` });
      const result = await deps.handleConfirm(target, action);
      sendJson(res, 200, result.ok ? { ok: true } : { ok: false, error: result.error || '操作失败' });
    },

    async 'POST diagnose'(req, res) {
      const info = deps.getInfo();
      const checks = [];

      checks.push({
        id: 'node',
        label: 'Node 版本',
        ok: true,
        detail: process.version
      });

      checks.push({
        id: 'state-dir',
        label: '状态目录可写',
        ok: deps.store.degraded !== true,
        detail: deps.store.degraded === true
          ? `${deps.dataDir} 不可写，急停与去重游标重启后不保留`
          : deps.dataDir
      });

      const dwsPath = info.config.dwsPath || 'dws';
      const version = await runCommand(dwsPath, ['--version'], { timeoutMs: 10_000 });
      checks.push({
        id: 'dws',
        label: 'dws 可执行',
        ok: version.ok,
        detail: version.ok
          ? version.stdout.split('\n')[0]
          : `无法执行 ${dwsPath}：${version.message}（需要先安装 dws CLI）`
      });

      if (version.ok) {
        const { auth, self } = await authInfo({ force: true });
        checks.push({
          id: 'auth',
          label: '个人身份登录',
          ok: auth.authenticated === true,
          detail: auth.authenticated
            ? `已登录${self?.nick ? `：${self.nick}` : ''}${self?.userId ? `（${self.userId}）` : ''}`
            : `未登录：${auth.error || '请先在终端执行 dws auth login'}`
        });
      } else {
        checks.push({ id: 'auth', label: '个人身份登录', ok: false, detail: 'dws 不可用，无法检查登录态' });
      }

      const dshCli = typeof deps.resolveDshCli === 'function' ? deps.resolveDshCli() : '';
      const dshVersion = await runCommand(dshCli || 'dsh', ['--version'], { timeoutMs: 15_000 });
      checks.push({
        id: 'dsh',
        label: 'dsh CLI（生成回复用）',
        ok: dshVersion.ok,
        detail: dshVersion.ok
          ? `${dshVersion.stdout.split('\n')[0]}（${dshCli || 'PATH 中的 dsh'}）`
          : `找不到可执行的 dsh（尝试过 ${dshCli || 'PATH 中的 dsh'}）：生成回复会失败，请在配置里填 dshCliPath`
      });

      const model = typeof deps.getModelInfo === 'function' ? deps.getModelInfo() : null;
      const modelSourceText = model?.source === 'config'
        ? '插件配置'
        : model?.source === 'default' ? '跟随 DSH 当前默认模型' : 'headless profile 默认';
      checks.push({
        id: 'model',
        label: '生成回复的模型',
        ok: Boolean(model?.provider && model?.model),
        detail: model?.provider && model?.model
          ? `${model.provider} / ${model.model}${model.reasoningEffort ? `（推理 ${model.reasoningEffort}）` : ''} · ${modelSourceText}`
          : `由 headless profile 自己决定（${modelSourceText}）`
      });

      const readOnly = typeof deps.isReadOnly === 'function' ? deps.isReadOnly() : true;
      checks.push({
        id: 'readonly',
        label: '生成权限',
        ok: readOnly === true,
        detail: readOnly === true
          ? '只读：只在工作区里查资料，不改任何文件'
          : '可写：允许在工作区内修改文件（谨慎）'
      });

      const cred = typeof deps.getCredentialInfo === 'function' ? deps.getCredentialInfo() : null;
      const credKeys = cred && Array.isArray(cred.keys) ? cred.keys.length : 0;
      checks.push({
        id: 'credentials',
        label: '模型凭据',
        ok: credKeys > 0,
        detail: credKeys > 0
          ? `子进程将注入 ${credKeys} 个凭据（来自 ${cred.file || '.credentials.yaml'}）`
          : `没从 ${cred?.file || '.credentials.yaml'} 读到凭据；headless 子进程只能靠环境变量，生成会失败`
      });

      const workspaces = deps.listWorkspaces();
      checks.push({
        id: 'workspaces',
        label: 'DSH 工作区',
        ok: workspaces.length > 0,
        detail: workspaces.length > 0 ? `可用 ${workspaces.length} 个` : '未取到工作区列表，联系人无法绑定'
      });

      const contacts = info.config.contacts || [];
      const unbound = contacts.filter((c) => !workspaces.some((w) => w.id === c.workspaceId));
      checks.push({
        id: 'contacts',
        label: '联系人绑定',
        ok: contacts.length > 0 && unbound.length === 0,
        detail: contacts.length === 0
          ? '还没有监听联系人'
          : unbound.length > 0
            ? `有 ${unbound.length} 个联系人绑定的工作区不存在：${unbound.map((c) => c.name).join('、')}`
            : `${contacts.length} 个联系人绑定正常`
      });

      log('诊断完成：', checks.map((c) => `${c.id}=${c.ok ? 'ok' : 'fail'}`).join(' '));
      sendJson(res, 200, { ok: true, checks });
    },

    /** 模拟回复：跑一次真实生成但不发送（设置页「模拟回答」）。 */
    async 'POST test-reply'(req, res) {
      const body = await readBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const message = typeof body.value.message === 'string' ? body.value.message : '';
      if (typeof deps.simulate !== 'function') {
        return sendJson(res, 200, { ok: false, error: '宿主没有提供模拟生成能力' });
      }
      const result = await deps.simulate(message);
      log('模拟回复：', result.ok ? `成功（${result.durationMs}ms）` : `失败：${result.error}`);
      sendJson(res, 200, result);
    },

    /** 可选的生成模型清单（设置页的下拉数据）。 */
    async 'GET models'(req, res) {
      let providers = [];
      let error = null;
      try {
        providers = typeof deps.listModels === 'function' ? await deps.listModels() : [];
      } catch (err) {
        error = err?.message || String(err);
      }
      sendJson(res, 200, {
        ok: true,
        providers,
        current: typeof deps.getModelInfo === 'function' ? deps.getModelInfo() : null,
        error
      });
    },

    /** 立即跑一轮（设置页「立即检查一次」）。绕过轮询间隔，但仍尊重总开关与急停。 */
    async 'POST cycle'(req, res) {
      const result = await deps.runNow();
      sendJson(res, 200, result);
    },

    /**
     * 通讯录搜索：设置页选人只能从这里来，不接受手填 ID。
     * dws 未登录 / 未装时返回 ok:false + 中文原因，客户端原样展示。
     */
    async 'POST contacts/search'(req, res) {
      const body = await readBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const query = typeof body.value.query === 'string' ? body.value.query.trim() : '';
      if (query === '') return sendJson(res, 400, { ok: false, error: '请先输入姓名关键词' });
      if (query.length > 64) return sendJson(res, 400, { ok: false, error: '关键词过长（最多 64 字）' });

      const found = await deps.dws.resolveContact(query);
      if (!found.ok) {
        sendJson(res, 200, { ok: false, error: describeDwsFailure(found.error) });
        return;
      }

      const seen = new Set();
      const candidates = [];
      for (const person of found.candidates || []) {
        const id = person.openDingTalkId || person.userId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        candidates.push({
          name: person.name || person.nick || id,
          openDingTalkId: person.openDingTalkId || '',
          userId: person.userId || ''
        });
        if (candidates.length >= 20) break;
      }
      log(`通讯录搜索「${query}」：${candidates.length} 个结果`);
      sendJson(res, 200, { ok: true, candidates });
    }
  };

  async function dispatch(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (!url.pathname.startsWith(API_PREFIX)) {
        return sendJson(res, 404, { ok: false, error: `未知路径：${url.pathname}` });
      }
      const endpoint = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '');
      const key = `${req.method || 'GET'} ${endpoint}`;
      const handler = handlers[key];
      if (!handler) {
        return sendJson(res, 404, { ok: false, error: `未知端点：${key}` });
      }
      await handler(req, res);
    } catch (err) {
      try {
        sendJson(res, 500, { ok: false, error: `内部错误：${err?.message || String(err)}` });
      } catch { /* 连接已断开 */ }
    }
  }

  return { dispatch, handlers, invalidateAuth: () => { authCache = { at: 0, value: null, self: null }; } };
}

/** 宿主回调：确认/丢弃草稿。抽出来方便单测。 */
export function makeConfirmHandler({ getConfig, store, adapters }) {
  return async function handleConfirm(contact, action) {
    const key = contactKey(contact);
    const state = store.load();
    try {
      const result = action === 'send'
        ? await confirmAndSend({ state, store, adapters, key, contact })
        : discardConfirm({ state, store, key });
      store.save(state);
      return result;
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  };
}

export function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function configFilePath(dataDir) {
  return path.join(dataDir, 'config.json');
}
