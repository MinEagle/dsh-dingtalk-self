import test from 'node:test';
import assert from 'node:assert/strict';
import * as plugin from '../lib/index.js';
import { withDefaults, DEFAULTS, schemaAvailable } from '../lib/settings.js';

test('插件导出符合 Cordis 插件契约', () => {
  assert.equal(typeof plugin.name, 'string');
  assert.ok(plugin.name.length > 0);
  assert.ok(Array.isArray(plugin.inject));
  assert.equal(typeof plugin.apply, 'function');
});

test('apply() 在最小宿主环境下不抛异常', () => {
  const effects = [];
  const ctx = {
    inject: (_deps, cb) => { try { cb({ get: () => undefined }); } catch { /* 宿主服务缺失属正常 */ } },
    on: () => {},
    get: () => undefined,
    effect: (factory) => { const dispose = factory(); effects.push(dispose); return dispose; }
  };
  assert.doesNotThrow(() => plugin.apply(ctx, { enabled: false }));
  // apply 期间的定时器要被清理，避免测试进程挂住
  for (const dispose of effects) {
    if (typeof dispose === 'function') dispose();
  }
});

test('withDefaults 补齐嵌套默认值', () => {
  const cfg = withDefaults({ mode: 'auto', limits: { maxReplyChars: 100 } });
  assert.equal(cfg.mode, 'auto');
  assert.equal(cfg.limits.maxReplyChars, 100);
  assert.equal(cfg.limits.maxRepliesPerHour, DEFAULTS.limits.maxRepliesPerHour);
  assert.equal(cfg.guard.enabled, true);
  assert.deepEqual(cfg.contacts, []);
});

test('withDefaults 对非法 contacts 兜底为空数组', () => {
  assert.deepEqual(withDefaults({ contacts: 'oops' }).contacts, []);
});

test('schema 解析：可用时是 schemastery 对象，不可用时退回纯对象默认值', async () => {
  const { schemaStatus, Config } = await import('../lib/settings.js');
  const status = schemaStatus();
  assert.equal(typeof schemaAvailable, 'boolean');
  if (schemaAvailable) {
    // 链接安装（workspace 里没有 node_modules）时应当从 profile 目录解析到
    assert.ok(status.source === 'bare' || typeof status.source === 'string');
    assert.equal(typeof Config, 'function');
    assert.equal(typeof Config.toString, 'function');
    assert.ok(JSON.stringify(Config).includes('contacts'), 'schema 应当能序列化成 JSON Schema');
  } else {
    assert.equal(Config, DEFAULTS);
  }
  assert.equal(DEFAULTS.mode, 'draft');
  assert.equal(DEFAULTS.enabled, false);
});
