/**
 * apply() 级别的集成测试：用假 ctx 把宿主插件的真实注册路径跑一遍。
 * 目的：在没有 DSH 进程的情况下，验证「设置命名空间 + HTTP 路由 + 配置读写 + 工具注册」这条线是通的。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-home-'));
process.env.DSH_HOME = HOME;

const { apply } = await import('../lib/index.js');

function makeReq(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
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

function boot({ withSettings = true, withWebServer = true } = {}) {
  const routes = [];
  const effects = [];
  const tools = [];
  const calls = [];
  let settingsValue = {};

  const ctx = {
    fiber: { id: 'test-fiber' },
    get(serviceName) {
      if (serviceName === 'settings' && withSettings) {
        return {
          register(ns, schema) { calls.push(['register', ns, typeof schema]); },
          configure(presentation, owner) { calls.push(['configure', presentation, Boolean(owner)]); },
          describe() { return [{ ns: 'dsh-dingtalk-self', value: settingsValue, revision: 3 }]; },
          async update(ns, patch, revision) {
            calls.push(['update', ns, patch, revision]);
            settingsValue = { ...settingsValue, ...patch };
          }
        };
      }
      if (serviceName === 'webServer' && withWebServer) {
        return { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1); } };
      }
      if (serviceName === 'tools') return { register(def) { tools.push(def); return () => {}; } };
      if (serviceName === 'workspaceRegistry') return { list: () => [{ id: 'my-workspace', title: 'my-workspace', path: '/tmp/my-workspace' }] };
      return undefined;
    },
    inject(deps, callback) {
      // 宿主服务全配齐时才回调，符合 Cordis 的依赖语义
      const available = deps.every((d) => ctx.get(d) !== undefined);
      if (available) callback(ctx);
    },
    on() { return () => {}; },
    effect(factory) { const dispose = factory(); effects.push(dispose); return dispose; }
  };

  apply(ctx, {});
  return { routes, effects, tools, calls, ctx };
}

test('apply() 注册设置命名空间、自动页策略与 HTTP 路由', () => {
  const { routes, tools, calls } = boot();
  assert.deepEqual(routes.map((r) => r.path), [
    '/dsh-dingtalk-self/api/state',
    '/dsh-dingtalk-self/api/config',
    '/dsh-dingtalk-self/api/pause',
    '/dsh-dingtalk-self/api/confirm',
    '/dsh-dingtalk-self/api/diagnose',
    '/dsh-dingtalk-self/api/contacts/search',
    '/dsh-dingtalk-self/api/cycle',
    '/dsh-dingtalk-self/api/models',
    '/dsh-dingtalk-self/api/test-reply'
  ]);
  assert.ok(routes.every((r) => r.kind === 'exact'), 'exact 路由：prefix 在本宿主不匹配子路径');
  assert.deepEqual(calls.map((c) => c[0]), ['register', 'configure']);
  assert.equal(calls[0][1], 'dingtalk-self');
  assert.deepEqual(calls[1][1], { auto: true });
  assert.deepEqual(tools.map((t) => t.name), [
    'dingtalk_self_status', 'dingtalk_self_confirm', 'dingtalk_self_pause', 'dingtalk_self_config'
  ]);
});

test('没有 webServer / settings 时 apply() 不抛异常', () => {
  assert.doesNotThrow(() => boot({ withSettings: false, withWebServer: false }));
});

test('HTTP state → 保存配置 → 再读回来（走 settings.update）', async () => {
  const { routes, calls } = boot();

  const call = async (method, endpoint, body) => {
    const pathName = `/dsh-dingtalk-self/api/${endpoint}`;
    const route = routes.find((r) => r.path === pathName);
    assert.ok(route, `应有 ${pathName} 的 exact 路由`);
    const res = makeRes();
    await route.handler(makeReq(method, pathName, body), res);
    return { status: res.status, json: JSON.parse(res.body) };
  };

  const before = await call('GET', 'state');
  assert.equal(before.json.config.enabled, false);
  assert.equal(before.json.configSource, 'settings');
  assert.equal(before.json.workspaces[0].id, 'my-workspace');

  const save = await call('POST', 'config', {
    patch: { enabled: true, mode: 'confirm', contacts: [{ name: '张三', openDingTalkId: 'abc', workspaceId: 'my-workspace' }] }
  });
  assert.equal(save.json.ok, true);
  assert.equal(save.json.configSource, 'settings');

  const updateCall = calls.find((c) => c[0] === 'update');
  assert.ok(updateCall, '应当调用 settings.update');
  assert.equal(updateCall[1], 'dsh-dingtalk-self', '按 profile 条目 id 寻址');
  assert.equal(updateCall[3], 3, '带上 describe 返回的 revision');

  const after = await call('GET', 'state');
  assert.equal(after.json.config.enabled, true);
  assert.equal(after.json.config.mode, 'confirm');
  assert.equal(after.json.config.contacts.length, 1);
  assert.equal(after.json.config.contacts[0].cursor, null);
});

test('settings.update 一直失败时降级写 config.json', async () => {
  const routes = [];
  const breakingCtx = {
    fiber: {},
    get(serviceName) {
      if (serviceName === 'settings') {
        return {
          register() {},
          configure() {},
          describe() { return [{ ns: 'dsh-dingtalk-self', value: {}, revision: 1 }]; },
          async update() { throw new Error('boom'); }
        };
      }
      if (serviceName === 'webServer') return { register(r) { routes.push(r); return () => {}; } };
      if (serviceName === 'tools') return { register() { return () => {}; } };
      return undefined;
    },
    inject(deps, callback) { if (deps.every((d) => breakingCtx.get(d) !== undefined)) callback(breakingCtx); },
    on() { return () => {}; },
    effect(factory) { const d = factory(); return d; }
  };
  apply(breakingCtx, {});
  const route = routes.find((r) => r.path === '/dsh-dingtalk-self/api/config');
  assert.ok(route, '路由仍要注册');

  const res = makeRes();
  await route.handler(makeReq('POST', '/dsh-dingtalk-self/api/config', { patch: { enabled: true } }), res);
  const json = JSON.parse(res.body);
  assert.equal(json.ok, true);
  assert.equal(json.configSource, 'file');

  const file = path.join(HOME, 'data', 'dsh-dingtalk-self', 'config.json');
  assert.equal(fs.existsSync(file), true);
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(written.enabled, true);

  const res2 = makeRes();
  await route.handler(makeReq('GET', '/dsh-dingtalk-self/api/state'), res2);
  assert.equal(JSON.parse(res2.body).configSource, 'file');
  assert.equal(JSON.parse(res2.body).overrideFile, true);
});
