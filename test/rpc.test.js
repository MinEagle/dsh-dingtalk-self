import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApi } from '../lib/rpc.js';
import { createStore } from '../lib/core/state.js';
import { withDefaults, validatePatch } from '../lib/settings.js';

function makeReq(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status; },
    end(chunk) { this.body = chunk; }
  };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-rpc-'));
}

function harness(overrides = {}) {
  const dir = overrides.dataDir || tempDir();
  const store = createStore(dir);
  let config = withDefaults(overrides.config || {});
  const saved = [];
  const dws = overrides.dws || {
    async authStatus() { return { ok: true, authenticated: true }; },
    async whoAmI() { return { ok: true, user: { userId: 'u_me', nick: '本人' } }; },
    async resolveContact(query) {
      return {
        ok: true,
        candidates: [
          { name: '张三', userId: 'u_1', openDingTalkId: 'odt_1' },
          { name: '张三丰', userId: 'u_2', openDingTalkId: 'odt_2' },
          { name: '重复', userId: 'u_1', openDingTalkId: 'odt_1' },
          { name: '只有 userId', userId: 'u_3', openDingTalkId: '' },
          { name: '没有 ID', userId: '', openDingTalkId: '' }
        ]
      };
    }
  };

  const api = createApi({
    getInfo: () => ({ config, source: 'settings', overrideFile: false, revision: 1 }),
    saveConfig: overrides.saveConfig || (async (patch) => {
      const checked = validatePatch(patch);
      if (!checked.ok) return { ok: false, error: checked.error };
      saved.push(checked.normalized);
      config = withDefaults({ ...config, ...checked.normalized });
      return { ok: true, source: 'settings' };
    }),
    store,
    dws,
    dataDir: dir,
    version: '9.9.9-test',
    bootedAt: '2026-01-01T00:00:00.000Z',
    listWorkspaces: () => overrides.workspaces || [{ id: 'ws1', title: 'ws1', path: '/tmp/ws1' }],
    handleConfirm: overrides.handleConfirm || (async () => ({ ok: true })),
    getModelInfo: overrides.getModelInfo || (() => ({ provider: 'magpie', model: 'opendesign/deepseek-v4.1-flash', reasoningEffort: 'max', source: 'default' })),
    isReadOnly: overrides.isReadOnly || (() => true),
    getCredentialInfo: overrides.getCredentialInfo || (() => ({ file: '/tmp/fake/.credentials.yaml', keys: ['DEEPSEEK_API_KEY', 'MAGPIE_GATEWAY_KEY'] })),
    simulate: overrides.simulate || (async (message) => ({ ok: true, reply: `模拟：${message}`, outbound: `模拟：${message}\n（本条由助手代答）`, durationMs: 1234, model: { provider: 'magpie', model: 'x', source: 'default' }, readOnly: true })),
    listModels: overrides.listModels || (async () => [{ id: 'magpie', name: 'Magpie', models: [{ id: 'opendesign/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }] }]),
    runNow: overrides.runNow || (async () => ({ ok: true, cycle: { at: '2026-01-01T00:00:00.000Z', reason: 'manual', contacts: 1, fetched: 0, fresh: 0, drafts: 0, confirms: 0, sent: 0, blocked: 0, skipped: 0, deferred: 0, errors: 0 } })),
    log: () => {}
  });

  async function call(method, endpoint, body) {
    const res = makeRes();
    await api.dispatch(makeReq(method, `/dsh-dingtalk-self/api/${endpoint}`, body), res);
    let json = null;
    try { json = JSON.parse(res.body); } catch { /* 非 JSON 视为空 */ }
    return { status: res.status, json };
  }

  return { api, store, call, dir, get config() { return config; }, saved };
}

test('GET state 返回完整视图', async () => {
  const h = harness({ config: { enabled: true, mode: 'confirm', contacts: [{ name: '张三', openDingTalkId: 'abc', workspaceId: 'ws1' }] } });
  const { status, json } = await h.call('GET', 'state');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.plugin.version, '9.9.9-test');
  assert.equal(json.config.mode, 'confirm');
  assert.equal(json.config.contacts.length, 1);
  assert.equal(json.config.contacts[0].cursor, null);
  assert.equal(json.configSource, 'settings');
  assert.equal(json.auth.authenticated, true);
  assert.equal(json.auth.self.userId, 'u_me');
  assert.deepEqual(json.workspaces.map((w) => w.id), ['ws1']);
  assert.deepEqual(json.drafts, []);
  assert.deepEqual(json.audit, []);
});

test('GET state 的 audit / drafts 是新的在前', async () => {
  const h = harness();
  const state = h.store.load();
  h.store.audit(state, { contact: '张三', action: 'draft', reply: '第一条' });
  h.store.audit(state, { contact: '张三', action: 'draft', reply: '第二条' });
  h.store.audit(state, { contact: '张三', action: 'sent', reply: '发出去的' });
  h.store.save(state);

  const { json } = await h.call('GET', 'state');
  assert.equal(json.audit[0].kind, 'sent');
  assert.equal(json.audit.at(-1).kind, 'draft');
  assert.equal(json.drafts.length, 2);
  assert.equal(json.drafts[0].preview, '第二条');
  assert.equal(json.drafts[0].file, null);
});

test('GET state 汇总待确认草稿', async () => {
  const h = harness();
  const state = h.store.load();
  state.confirm['张三-abc'] = { contact: '张三', reply: '待发的回复', idempotencyKey: 'k', createdAt: '2026-01-01T00:00:00.000Z' };
  h.store.save(state);
  const { json } = await h.call('GET', 'state');
  assert.equal(json.pendingConfirm.length, 1);
  assert.equal(json.pendingConfirm[0].contact, '张三');
  assert.equal(json.pendingConfirm[0].text, '待发的回复');
});

test('未登录时 auth 带中文原因', async () => {
  const h = harness({ dws: { async authStatus() { return { ok: true, authenticated: false }; }, async whoAmI() { return { ok: false }; } } });
  const { json } = await h.call('GET', 'state');
  assert.equal(json.auth.authenticated, false);
  assert.match(json.auth.error, /dws auth login/);
});

test('dws 不可用时 auth 传递底层错误', async () => {
  const h = harness({ dws: { async authStatus() { return { ok: false, error: { message: 'spawn dws ENOENT' } }; } } });
  const { json } = await h.call('GET', 'state');
  assert.equal(json.auth.ok, false);
  assert.match(json.auth.error, /ENOENT/);
});

test('POST config 校验失败不落盘', async () => {
  const h = harness({ saveConfig: async (patch) => {
    const checked = validatePatch(patch);
    return checked.ok ? { ok: true, source: 'settings' } : { ok: false, error: checked.error };
  } });
  const { status, json } = await h.call('POST', 'config', { patch: { contacts: [{ name: '张三' }] } });
  assert.equal(status, 200);
  assert.equal(json.ok, false);
  assert.match(json.error, /workspaceId/);
});

test('POST config 缺 patch 返回 400', async () => {
  const h = harness();
  const { status, json } = await h.call('POST', 'config', {});
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('POST config 成功返回新配置', async () => {
  const h = harness();
  const patch = { enabled: true, contacts: [{ name: '张三', openDingTalkId: 'abc', workspaceId: 'ws1', autoReply: true }] };
  const { json } = await h.call('POST', 'config', { patch });
  assert.equal(json.ok, true);
  assert.equal(json.config.enabled, true);
  assert.equal(json.config.contacts[0].autoReply, true);
  assert.equal(json.configSource, 'settings');
  assert.equal(h.saved.length, 1);
});

test('POST pause 写 PAUSE 标记并可撤销', async () => {
  const h = harness();
  const first = await h.call('POST', 'pause', { paused: true });
  assert.equal(first.json.paused, true);
  assert.equal(h.store.isPaused(), true);
  const second = await h.call('POST', 'pause', { paused: false });
  assert.equal(second.json.paused, false);
  assert.equal(h.store.isPaused(), false);
});

test('POST confirm 校验 contact 与 action', async () => {
  const h = harness();
  assert.equal((await h.call('POST', 'confirm', { action: 'send' })).status, 400);
  assert.equal((await h.call('POST', 'confirm', { contact: '张三' })).status, 400);
  const unknown = await h.call('POST', 'confirm', { contact: '李四', action: 'send' });
  assert.equal(unknown.json.ok, false);
  assert.match(unknown.json.error, /李四/);
});

test('POST confirm 转交给 handleConfirm', async () => {
  let seen = null;
  const h = harness({
    config: { contacts: [{ name: '张三', openDingTalkId: 'abc', workspaceId: 'ws1' }] },
    handleConfirm: async (contact, action) => { seen = { contact, action }; return { ok: true }; }
  });
  const { json } = await h.call('POST', 'confirm', { contact: '张三', action: 'discard' });
  assert.equal(json.ok, true);
  assert.equal(seen.action, 'discard');
  assert.equal(seen.contact.openDingTalkId, 'abc');
});

test('POST diagnose 逐项给出检查结果', async () => {
  const h = harness();
  const { json } = await h.call('POST', 'diagnose');
  assert.equal(json.ok, true);
  const ids = json.checks.map((c) => c.id);
  assert.deepEqual(ids, ['node', 'state-dir', 'dws', 'auth', 'dsh', 'model', 'readonly', 'credentials', 'workspaces', 'contacts']);
  const dwsCheck = json.checks.find((c) => c.id === 'dws');
  assert.equal(typeof dwsCheck.ok, 'boolean');
  for (const check of json.checks) {
    assert.equal(typeof check.label, 'string');
    assert.equal(typeof check.detail, 'string');
  }
});

test('未知端点 404、坏 JSON 400、超长请求体拒绝', async () => {
  const h = harness();
  assert.equal((await h.call('GET', 'nope')).status, 404);
  assert.equal((await h.call('DELETE', 'state')).status, 404);

  const res = makeRes();
  await h.api.dispatch(makeReq('POST', '/dsh-dingtalk-self/api/config', '{oops'), res);
  assert.equal(res.status, 400);
  assert.match(JSON.parse(res.body).error, /JSON/);

  const tooBig = makeRes();
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/dsh-dingtalk-self/api/config';
  const promise = h.api.dispatch(req, tooBig);
  req.emit('data', Buffer.alloc(300 * 1024));
  req.emit('end');
  await promise;
  assert.equal(tooBig.status, 400);
  assert.match(JSON.parse(tooBig.body).error, /超过/);
});

test('validatePatch 归一化联系人字段', () => {
  const ok = validatePatch({ contacts: [{ name: '  张三  ', openDingTalkId: ' abc ', workspaceId: ' ws1 ' }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.normalized.contacts[0], {
    name: '张三', openDingTalkId: 'abc', userId: '', workspaceId: 'ws1', autoReply: false, sessionId: ''
  });
});

test('validatePatch 拒绝非法 mode / 缺 ID / 非数组 contacts', () => {
  assert.match(validatePatch({ mode: 'chaos' }).error, /mode/);
  assert.match(validatePatch({ contacts: 'oops' }).error, /数组/);
  assert.match(validatePatch({ contacts: [{ name: '张三', workspaceId: 'ws1' }] }).error, /openDingTalkId/);
  assert.equal(validatePatch(null).ok, false);
});

test('POST contacts/search 去重、过滤无 ID、限制 20 条', async () => {
  const h = harness();
  const { status, json } = await h.call('POST', 'contacts/search', { query: '张三' });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(json.candidates.map((c) => c.openDingTalkId || c.userId), ['odt_1', 'odt_2', 'u_3']);
  assert.equal(json.candidates[0].name, '张三');
});

test('POST contacts/search 空关键词 400、错误原因中文化', async () => {
  const h = harness();
  assert.equal((await h.call('POST', 'contacts/search', { query: '   ' })).status, 400);

  const denied = harness({
    dws: {
      async authStatus() { return { ok: true, authenticated: false }; },
      async resolveContact() { return { ok: false, error: { message: 'not logged in: please run auth login' } }; }
    }
  });
  const out = await denied.call('POST', 'contacts/search', { query: '张三' });
  assert.equal(out.json.ok, false);
  assert.match(out.json.error, /dws auth login/);

  const broken = harness({
    dws: {
      async authStatus() { return { ok: true, authenticated: false }; },
      async resolveContact() { return { ok: false, error: { message: 'spawn dws ENOENT' } }; }
    }
  });
  const out2 = await broken.call('POST', 'contacts/search', { query: '张三' });
  assert.match(out2.json.error, /找不到 dws/);
});

test('state 暴露 lastCycle，POST cycle 触发立即检查', async () => {
  let ran = 0;
  const h = harness({
    runNow: async () => {
      ran += 1;
      const cycle = { at: '2026-01-01T00:00:05.000Z', reason: 'manual', contacts: 1, fetched: 3, fresh: 1, drafts: 0, confirms: 1, sent: 0, blocked: 0, skipped: 0, deferred: 0, errors: 0 };
      const state = h.store.load();
      state.lastCycle = cycle;
      h.store.save(state);
      return { ok: true, cycle };
    }
  });

  const before = await h.call('GET', 'state');
  assert.equal(before.json.lastCycle, null);

  const run = await h.call('POST', 'cycle', {});
  assert.equal(run.json.ok, true);
  assert.equal(run.json.cycle.confirms, 1);
  assert.equal(ran, 1);

  const after = await h.call('GET', 'state');
  assert.equal(after.json.lastCycle.fetched, 3);
  assert.equal(after.json.lastCycle.reason, 'manual');
});

test('POST cycle 透传失败原因（未启用/急停/正在跑）', async () => {
  const h = harness({ runNow: async () => ({ ok: false, error: '插件未启用：先打开「总开关」' }) });
  const { status, json } = await h.call('POST', 'cycle', {});
  assert.equal(status, 200);
  assert.equal(json.ok, false);
  assert.match(json.error, /总开关/);
});

test('resolveDshPath 优先返回真实存在的绝对路径，而不是裸 dsh', async () => {
  const { resolveDshPath, dshCandidates } = await import('../lib/agents/headless.js');
  assert.equal(resolveDshPath('/custom/path/dsh'), '/custom/path/dsh');
  const resolved = resolveDshPath('');
  assert.equal(typeof resolved, 'string');
  if (resolved !== 'dsh') {
    assert.ok(resolved.startsWith('/'), '应解析成绝对路径');
    assert.ok(dshCandidates().includes(resolved));
  }
});

test('state 暴露生效模型与只读状态', async () => {
  const h = harness();
  const { json } = await h.call('GET', 'state');
  assert.equal(json.model.provider, 'magpie');
  assert.equal(json.model.source, 'default');
  assert.equal(json.readOnly, true);
});

test('GET models 返回可选模型清单', async () => {
  const h = harness();
  const { status, json } = await h.call('GET', 'models');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.providers[0].id, 'magpie');
  assert.equal(json.providers[0].models[0].id, 'opendesign/deepseek-v4.1-flash');
  assert.equal(json.current.provider, 'magpie');
});

test('agent 补丁：provider/model 必须成对，单独一半被拒', () => {
  assert.equal(validatePatch({ agent: { provider: 'magpie' } }).ok, false);
  assert.match(validatePatch({ agent: { provider: 'magpie' } }).error, /一起填/);
  const both = validatePatch({ agent: { provider: ' magpie ', model: ' opendesign/deepseek-v4.1-flash ', reasoningEffort: ' max ' } });
  assert.equal(both.ok, true);
  assert.deepEqual(both.normalized.agent, { provider: 'magpie', model: 'opendesign/deepseek-v4.1-flash', reasoningEffort: 'max', readOnly: true });
  assert.equal(validatePatch({ agent: { provider: '', model: '' } }).ok, true, '都留空 = 跟随默认');
});

test('审计 detail 里带上产生这条回复的模型', async () => {
  const h = harness();
  const state = h.store.load();
  h.store.audit(state, { contact: '张三', action: 'sent', reply: '好的\n（本条由助手代答）', model: 'magpie/opendesign/deepseek-v4.1-flash' });
  h.store.save(state);
  const { json } = await h.call('GET', 'state');
  assert.match(json.audit[0].detail, /magpie\/opendesign\/deepseek-v4\.1-flash/);
  assert.match(json.audit[0].detail, /本条由助手代答/);
});

test('POST test-reply 走模拟生成并回显结果', async () => {
  const h = harness();
  const { status, json } = await h.call('POST', 'test-reply', { message: '这个接口是干什么的' });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.match(json.reply, /这个接口是干什么的/);
  assert.match(json.outbound, /本条由助手代答/);
  assert.equal(json.durationMs, 1234);
});

test('POST test-reply 空消息由宿主拒绝', async () => {
  const h = harness({ simulate: async (message) => (message.trim() === '' ? { ok: false, error: '先填一条对方可能发来的消息' } : { ok: true }) });
  const { status, json } = await h.call('POST', 'test-reply', { message: '   ' });
  assert.equal(status, 200);
  assert.equal(json.ok, false);
  assert.match(json.error, /先填/);
});
