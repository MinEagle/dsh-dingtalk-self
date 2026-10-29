import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyState } from '../lib/core/state.js';
import { runCycle } from '../lib/core/pipeline.js';
import { guardReply } from '../lib/core/guard.js';
import {
  checkSendPolicy, contactKey, isIncomingFromContact, recordSend, tidyReply
} from '../lib/core/policy.js';
import { createDws } from '../lib/core/dws.js';

const BASE = Date.UTC(2026, 9, 28, 7, 0, 0); // 2026-10-28T07:00:00Z

function msg(id, text, { from = 'OD1', at = BASE - 600_000, type = 'text' } = {}) {
  return { messageId: id, text, senderId: from, createTime: at, messageType: type };
}

function baseConfig(overrides = {}) {
  return {
    enabled: true,
    mode: 'draft',
    selfUserId: 'ME',
    pollIntervalSeconds: 60,
    overlapSeconds: 120,
    mergeWindowSeconds: 0,
    quietHours: { enabled: false, start: '22:00', end: '08:00' },
    contacts: [{ name: '张三', openDingTalkId: 'OD1', userId: '', workspaceId: 'ws1', autoReply: false, sessionId: '' }],
    limits: { maxRepliesPerHour: 10, minSecondsBetweenReplies: 0, maxReplyChars: 300, maxFetchPerPoll: 50 },
    guard: { enabled: true, stripCodeBlocks: true, redactPaths: true, redactInternalUrls: true, blockedWords: [] },
    agent: { kind: 'headless', profile: 'headless', timeoutSeconds: 120, persona: '简洁' },
    ...overrides
  };
}

function memStore({ paused = false } = {}) {
  const holder = { state: emptyState(), paused };
  return {
    isPaused: () => holder.paused,
    setPaused: (v) => { holder.paused = v === true; },
    load: () => holder.state,
    save: (s) => { holder.state = s; },
    audit: (s, e) => s.audit.push({ ts: new Date().toISOString(), ...e }),
    peek: () => holder.state
  };
}

function harness({ messages = [], reply = '收到，我看一下。', sendOk = true, config = {}, paused = false, sendFileOk = true, scope = null } = {}) {
  const calls = { list: 0, generate: 0, send: [], files: [] };
  const store = memStore({ paused });
  const adapters = {
    async listMessages() { calls.list += 1; return { ok: true, messages }; },
    async generate() { calls.generate += 1; return { ok: true, reply }; },
    async send(contact, text, key) { calls.send.push({ contact, text, key }); return { ok: sendOk, error: { message: '模拟发送失败' } }; },
    async sendFile(contact, filePath, key) { calls.files.push({ contact, filePath, key }); return { ok: sendFileOk, error: { message: '模拟附件发送失败' } }; },
    attachmentScope() { return scope || { roots: [], baseDir: '' }; }
  };
  const cfg = baseConfig(config);
  const run = (now = BASE) => runCycle({ config: cfg, state: store.load(), store, adapters, now });
  return { calls, store, adapters, cfg, run };
}

// ---------- 护栏 ----------

test('护栏：剥掉代码块，不把代码发出去', () => {
  const r = guardReply('好的，代码如下：\n```js\nconst a = 1;\n```\n我改完再发你', { maxChars: 300 });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.text, /const a/);
  assert.match(r.text, /我改完再发你/);
});

test('护栏：抹掉绝对路径', () => {
  const r = guardReply('文件在 /Users/example/projects/my-workspace/src/app.ts 里', { maxChars: 300 });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.text, /\/Users\//);
  assert.match(r.text, /\[路径\]/);
});

test('护栏：抹掉内网/本地地址', () => {
  const r = guardReply('打开 http://127.0.0.1:3000/admin 看看', { maxChars: 300 });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.text, /127\.0\.0\.1/);
});

test('护栏：命中禁用词整条拦下', () => {
  const r = guardReply('这个是数据库密码 abc123', { blockedWords: ['密码'], maxChars: 300 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /禁用词/);
});

test('护栏：原文全是代码时视为无有效内容', () => {
  const r = guardReply('```\nsecret code\n```', { maxChars: 300 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /无有效内容/);
});

test('护栏：超长截断到上限', () => {
  const r = guardReply('x'.repeat(500), { maxChars: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.text.length, 100);
  assert.ok(r.text.endsWith('…'));
});

test('护栏：关闭后不做任何减法', () => {
  const raw = '文件在 /Users/a/b.ts';
  const r = guardReply(raw, { enabled: false, maxChars: 300 });
  assert.equal(r.ok, true);
  assert.equal(r.text, raw);
});

// ---------- 策略 ----------

test('策略：静默时段判定（跨零点）', () => {
  const quiet = { enabled: true, start: '22:00', end: '08:00' };
  const at = (h) => Date.UTC(2026, 9, 28, h - 8, 0, 0); // 上海时间 h 点
  assert.equal(checkSendPolicy({ limits: { maxRepliesPerHour: 9, minSecondsBetweenReplies: 0 }, quietHours: quiet, state: emptyState(), key: 'k', epochMs: at(23) }).ok, false);
  assert.equal(checkSendPolicy({ limits: { maxRepliesPerHour: 9, minSecondsBetweenReplies: 0 }, quietHours: quiet, state: emptyState(), key: 'k', epochMs: at(7) }).ok, false);
  assert.equal(checkSendPolicy({ limits: { maxRepliesPerHour: 9, minSecondsBetweenReplies: 0 }, quietHours: quiet, state: emptyState(), key: 'k', epochMs: at(12) }).ok, true);
});

test('策略：每小时上限', () => {
  const state = emptyState();
  const limits = { maxRepliesPerHour: 2, minSecondsBetweenReplies: 0 };
  recordSend(state, 'k', BASE - 120_000);
  recordSend(state, 'k', BASE - 60_000);
  const res = checkSendPolicy({ limits, quietHours: { enabled: false }, state, key: 'k', epochMs: BASE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /上限/);
});

test('策略：最小间隔', () => {
  const state = emptyState();
  const limits = { maxRepliesPerHour: 10, minSecondsBetweenReplies: 30 };
  recordSend(state, 'k', BASE - 1_000);
  const tooSoon = checkSendPolicy({ limits, quietHours: { enabled: false }, state, key: 'k', epochMs: BASE });
  assert.equal(tooSoon.ok, false);
  assert.match(tooSoon.reason, /最小间隔/);

  const later = checkSendPolicy({ limits, quietHours: { enabled: false }, state, key: 'k', epochMs: BASE + 60_000 });
  assert.equal(later.ok, true);
});

test('策略：只认对方发来的消息', () => {
  const contact = { name: '张三', openDingTalkId: 'OD1', userId: 'U1' };
  assert.equal(isIncomingFromContact({ senderId: 'ME', selfUserId: 'ME', contact }), false);
  assert.equal(isIncomingFromContact({ senderId: 'OD1', selfUserId: 'ME', contact }), true);
  assert.equal(isIncomingFromContact({ senderId: 'U1', selfUserId: 'ME', contact }), true);
  assert.equal(isIncomingFromContact({ senderId: 'OTHER', selfUserId: 'ME', contact }), false);
});

test('策略：tidyReply 只去引号与前缀（围栏归护栏）', () => {
  assert.equal(tidyReply('“好的”'), '好的');
  assert.equal(tidyReply('回复：收到'), '收到');
  assert.equal(tidyReply('```\n收到\n```'), '```\n收到\n```');
});

// ---------- 主流程 ----------

test('草稿模式：只出草稿，不发送', async () => {
  const h = harness({ messages: [msg('m1', '方案什么时候给我')] });
  const s = await h.run();
  assert.equal(s.drafts.length, 1);
  assert.equal(h.calls.send.length, 0);
});

test('确认模式：进入待确认队列，不发送', async () => {
  const h = harness({ messages: [msg('m2', '在吗')], config: { mode: 'confirm', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true, sessionId: '' }] } });
  const s = await h.run();
  assert.equal(s.confirms.length, 1);
  assert.equal(h.store.peek().confirm[contactKey(h.cfg.contacts[0])].reply, '收到，我看一下。');
  assert.equal(h.calls.send.length, 0);
});

test('自动模式：发送时带幂等键，内容经过护栏', async () => {
  const h = harness({
    messages: [msg('m3', '明天几点')],
    reply: '十点，在 /Users/a/b.md 里写了，代码：\n```js\nx\n```',
    config: { mode: 'auto', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true, sessionId: '' }] }
  });
  const s = await h.run();
  assert.equal(s.sent.length, 1);
  assert.equal(h.calls.send.length, 1);
  const sent = h.calls.send[0];
  assert.doesNotMatch(sent.text, /\/Users\//);
  assert.doesNotMatch(sent.text, /x/);
  assert.match(sent.key, /^dshdt-[0-9a-f]{32}$/);
});

test('autoReply 未开启时即便 mode=auto 也只出草稿', async () => {
  const h = harness({ messages: [msg('m4', '在吗')], config: { mode: 'auto' } });
  const s = await h.run();
  assert.equal(s.drafts.length, 1);
  assert.equal(h.calls.send.length, 0);
});

test('自己发的消息不回复', async () => {
  const h = harness({ messages: [msg('m5', '我自己发的', { from: 'ME' })] });
  const s = await h.run();
  assert.equal(s.drafts.length, 0);
});

test('非目标发送人的消息不回复', async () => {
  const h = harness({ messages: [msg('m6', '别人', { from: 'OTHER' })] });
  const s = await h.run();
  assert.equal(s.drafts.length, 0);
});

test('同一条消息不会处理两次', async () => {
  const h = harness({ messages: [msg('m7', '收到请回复')] });
  const first = await h.run();
  const second = await h.run(BASE + 60_000);
  assert.equal(first.drafts.length, 1);
  assert.equal(second.drafts.length, 0);
});

test('连发合并成一次任务', async () => {
  const h = harness({
    messages: [msg('m8', '帮我看个事', { at: BASE - 600_000 }), msg('m9', '就是排期', { at: BASE - 599_000 }), msg('m10', '明天行吗', { at: BASE - 598_000 })]
  });
  const s = await h.run();
  assert.equal(s.drafts.length, 1);
  assert.equal(h.calls.generate, 1);
});

test('合并窗口内先缓冲，不生成', async () => {
  const h = harness({ messages: [msg('m11', '刚发的', { at: BASE - 5_000 })], config: { mergeWindowSeconds: 60 } });
  const s = await h.run();
  assert.equal(s.deferred.length, 1);
  assert.equal(h.calls.generate, 0);
});

test('生成失败：保留待处理，游标不前进', async () => {
  const store = memStore();
  const adapters = {
    async listMessages() { return { ok: true, messages: [msg('m12', '在吗')] }; },
    async generate() { return { ok: false, error: '模型超时' }; },
    async send() { return { ok: true }; }
  };
  const cfg = baseConfig();
  await runCycle({ config: cfg, state: store.load(), store, adapters, now: BASE });
  const key = contactKey(cfg.contacts[0]);
  assert.equal(store.peek().pending[key].length, 1);
  assert.equal(store.peek().cursors[key], undefined);
});

test('发送失败：记录错误，不重复尝试', async () => {
  const h = harness({
    messages: [msg('m13', '在吗')], sendOk: false,
    config: { mode: 'auto', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true, sessionId: '' }] }
  });
  const s = await h.run();
  assert.equal(s.errors.length, 1);
  assert.equal(s.errors[0].stage, 'send');
  assert.equal(s.sent.length, 0);
});

test('模型输出 SKIP 时不草稿不发送', async () => {
  const h = harness({ messages: [msg('m14', '嗯')], reply: 'SKIP', config: { mode: 'auto', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true, sessionId: '' }] } });
  const s = await h.run();
  assert.equal(s.skipped.length, 1);
  assert.equal(h.calls.send.length, 0);
});

test('护栏拦截后不发送且留审计', async () => {
  const h = harness({
    messages: [msg('m15', '把配置发我')],
    reply: '```\nsecret\n```',
    config: { mode: 'auto', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true, sessionId: '' }] }
  });
  const s = await h.run();
  assert.equal(s.blocked.length, 1);
  assert.equal(h.calls.send.length, 0);
  const last = h.store.peek().audit.at(-1);
  assert.equal(last.action, 'blocked');
});

test('未启用 / 空名单 / 急停：都不读消息', async () => {
  const disabled = harness({ messages: [msg('m16', 'x')], config: { enabled: false } });
  assert.equal((await disabled.run()).skippedReason, '插件未启用');
  assert.equal(disabled.calls.list, 0);

  const empty = harness({ messages: [msg('m17', 'x')], config: { contacts: [] } });
  assert.equal((await empty.run()).skippedReason, '监控名单为空');
  assert.equal(empty.calls.list, 0);

  const paused = harness({ messages: [msg('m18', 'x')], paused: true });
  assert.match((await paused.run()).skippedReason, /急停/);
  assert.equal(paused.calls.list, 0);
});

test('非文本消息跳过', async () => {
  const h = harness({ messages: [{ messageId: 'm19', senderId: 'OD1', createTime: BASE - 600_000, messageType: 'image' }] });
  const s = await h.run();
  assert.equal(s.drafts.length, 0);
  assert.equal(h.calls.generate, 0);
});

// ---------- dws 参数 ----------

test('dws 发送参数：--ai-tag=false 与幂等键必须出现', async () => {
  const seen = [];
  const dws = createDws({ runner: async (args) => { seen.push(args); return { ok: true, json: { success: true } }; } });
  const res = await dws.sendMessage({ openDingTalkId: 'OD1' }, '好的', { aiTag: false, idempotencyKey: 'k123' });
  assert.equal(res.ok, true);
  const argv = seen.at(-1).join(' ');
  assert.match(argv, /--open-dingtalk-id OD1/);
  assert.match(argv, /--ai-tag=false/);
  assert.match(argv, /--idempotency-key k123/);
  assert.match(argv, /--content 好的/);
});

test('dws 读取参数：优先 open-dingtalk-id，带时间方向与条数上限', async () => {
  const seen = [];
  const dws = createDws({ runner: async (args) => { seen.push(args); return { ok: true, json: { messages: [] } }; } });
  const res = await dws.listMessages({ openDingTalkId: 'OD1' }, { sinceMs: BASE, limit: 20 });
  assert.equal(res.ok, true);
  const argv = seen.at(-1).join(' ');
  assert.match(argv, /--open-dingtalk-id OD1/);
  assert.doesNotMatch(argv, /--user /);
  assert.match(argv, /--direction newer/);
  assert.match(argv, /--limit 20/);
});

test('dws 发送返回 success=false 时视为失败', async () => {
  const dws = createDws({ runner: async () => ({ ok: true, json: { success: false, error: 'no perm' } }) });
  const res = await dws.sendMessage({ openDingTalkId: 'OD1' }, 'x', {});
  assert.equal(res.ok, false);
});

// ---------- 首次回看窗口 ----------

test('首次启用没有游标时回看 initialLookbackSeconds，之后只用 overlapSeconds', async () => {
  const seenSince = [];
  const holder = { state: emptyState() };
  const store = {
    isPaused: () => false,
    load: () => holder.state,
    save: (x) => { holder.state = x; },
    audit: (x, e) => x.audit.push({ ts: new Date().toISOString(), ...e })
  };
  const adapters = {
    async listMessages(_contact, sinceMs) { seenSince.push(sinceMs); return { ok: true, messages: [] }; },
    async generate() { return { ok: true, reply: 'ok' }; },
    async send() { return { ok: true }; }
  };
  const cfg = baseConfig({ initialLookbackSeconds: 900, overlapSeconds: 120, contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1' }] });

  await runCycle({ config: cfg, state: store.load(), store, adapters, now: BASE });
  assert.equal(seenSince[0], BASE - 900 * 1000, '首轮回看 15 分钟');

  // 造一个游标，第二轮应只回看 overlapSeconds
  const state = store.load();
  state.cursors['张三-OD1'] = BASE - 60_000;
  await runCycle({ config: cfg, state, store, adapters, now: BASE });
  assert.equal(seenSince[1], BASE - 60_000 - 120 * 1000, '有游标后只看重叠窗口');

  const summary = { fetched: 0 };
  assert.equal(summary.fetched, 0);
});

test('一轮的摘要里有 fetched / fresh 计数', async () => {
  const messages = [
    { messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' },
    { messageId: 'm2', text: '这个月费用多少', senderId: 'OD1', createTime: '2026-03-01 10:00:30' }
  ];
  const h = harness({ messages, config: { mergeWindowSeconds: 0 } });
  const summary = await h.run(BASE);
  assert.equal(summary.fetched, 2);
  assert.equal(summary.fresh, 2);
});

test('首次生成的会话 id 会记到 state.sessions，下一条消息续用同一会话', async () => {
  const seenSessionIds = [];
  const holder = { state: emptyState() };
  const store = {
    isPaused: () => false,
    load: () => holder.state,
    save: (x) => { holder.state = x; },
    audit: (x, e) => x.audit.push({ ts: new Date().toISOString(), ...e })
  };
  let messages = [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }];
  const adapters = {
    async listMessages() { return { ok: true, messages }; },
    async generate({ sessionId }) {
      seenSessionIds.push(sessionId);
      return { ok: true, reply: '在的', sessionId: sessionId || 'session-created-1' };
    },
    async send() { return { ok: true }; }
  };
  const cfg = baseConfig({
    mergeWindowSeconds: 0,
    contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1' }]
  });

  await runCycle({ config: cfg, state: store.load(), store, adapters, now: BASE });
  assert.deepEqual(seenSessionIds, [''], '第一次没有会话 id');
  assert.equal(holder.state.sessions['张三-OD1'], 'session-created-1', '新建的会话 id 被记住');

  // 第二轮：对方又发了一条新消息
  messages = [{ messageId: 'm2', text: '帮我查下这个月费用', senderId: 'OD1', createTime: '2026-03-01 10:05:00' }];
  await runCycle({ config: cfg, state: store.load(), store, adapters, now: BASE + 300_000 });
  assert.deepEqual(seenSessionIds, ['', 'session-created-1'], '第二轮续用记住的会话');
});

// ---------- 出站标识 ----------

test('发出去的消息带出站标识，且待确认队列里也是带标识的正文', async () => {
  const h = harness({
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: { mode: 'auto', mergeWindowSeconds: 0, replyMarker: '（本条由助手代答）', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }] }
  });
  await h.run(BASE);
  assert.equal(h.calls.send.length, 1);
  assert.match(h.calls.send[0].text, /收到，我看一下。\n\n（本条由助手代答）$/);
});

test('标识留空时不追加', async () => {
  const h = harness({
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: { mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }] }
  });
  await h.run(BASE);
  assert.equal(h.calls.send[0].text, '收到，我看一下。');
});

test('草稿/待确认里存的是带标识的正文，审计里记录模型', async () => {
  const h = harness({
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'confirm', mergeWindowSeconds: 0, replyMarker: '（AI代答）',
      agent: { kind: 'headless', provider: 'magpie', model: 'opendesign/deepseek-v4.1-flash' },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: false }]
    }
  });
  const summary = await h.run(BASE);
  assert.equal(summary.confirms.length, 1);
  assert.match(summary.confirms[0].reply, /（AI代答）$/);
  const entry = h.store.peek().audit.find((a) => a.action === 'draft');
  assert.equal(entry.model, 'magpie/opendesign/deepseek-v4.1-flash');
  assert.match(entry.reply, /（AI代答）$/);
});

test('标识会占用字数预算，正文按 (上限 - 标识长度) 截断', async () => {
  const h = harness({
    reply: '好'.repeat(400),
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '[AI]',
      limits: { maxRepliesPerHour: 10, minSecondsBetweenReplies: 0, maxReplyChars: 100, maxFetchPerPoll: 50 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  await h.run(BASE);
  const text = h.calls.send[0].text;
  assert.ok(text.length <= 100 + 1 + 4, `总长度应受控：${text.length}`);
  assert.match(text, /\[AI\]$/);
});

// ---------- 排版 ----------

test('回复会被整理成适合钉钉的纯文本：列表转 •、去 Markdown、保留分段', async () => {
  const h = harness({
    reply: '## 结论\n**可以**，但有两条限制：\n- 只支持保养合同\n- 号段固定 SH-\n\n注意：菱伴不走这个切换',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: { mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', replyFormat: 'text', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }] }
  });
  await h.run(BASE);
  const text = h.calls.send[0].text;
  assert.match(text, /^结论\n可以，但有两条限制：/);
  assert.match(text, /\n• 只支持保养合同\n• 号段固定 SH-/);
  assert.match(text, /\n\n注意：菱伴不走这个切换$/);
  assert.doesNotMatch(text, /#|\*\*/);
});

test('一长段话会被折成多行（中文句号断句）', async () => {
  const h = harness({
    reply: '这个接口是维保 APP 保养员提交客户签名和把工单签收的接口。它会更新工单状态推到已签名。同时把签名信息写进工单客户签名表，同一张工单只保留一条。它还会记录客户邮箱，然后异步重新生成工单 PDF。现在这个接口还加了签名材料完备性校验，按电梯配置的签名方式判断。',
    messages: [{ messageId: 'm1', text: '这个接口干嘛的', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: { mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', replyFormat: 'text', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }] }
  });
  await h.run(BASE);
  assert.ok(h.calls.send[0].text.includes('\n'), '应当分行');
});

// ---------- Markdown 模式（钉钉支持渲染） ----------

test('markdown 模式保留加粗与标题，只做归一化', async () => {
  const h = harness({
    reply: '## 结论\n**可以**，但有两条限制：\n* 只支持保养合同\n1) 号段固定 SH-',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: { mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', replyFormat: 'markdown', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }] }
  });
  await h.run(BASE);
  const text = h.calls.send[0].text;
  assert.equal(text, '### 结论\n**可以**，但有两条限制：\n- 只支持保养合同\n1. 号段固定 SH-');
});

test('默认（未配置 replyFormat）走 markdown', async () => {
  const h = harness({
    reply: '**要点**：只支持保养合同',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: { mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }] }
  });
  await h.run(BASE);
  assert.match(h.calls.send[0].text, /\*\*要点\*\*/);
});

// ---------- 附件 ----------

test('回复里的 [[attach:]] 会被抽出，文字照发、文件补发', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-pipeline-attach-'));
  fs.writeFileSync(path.join(root, 'arch.png'), 'x'.repeat(64));

  const h = harness({
    reply: '结论：看架构图。\n- 要点一\n\n[[attach:arch.png]]',
    scope: { roots: [root], baseDir: root },
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', attachments: { enabled: true, maxCount: 2, maxBytes: 1024 * 1024 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  await h.run(BASE);
  const text = h.calls.send[0].text;
  assert.doesNotMatch(text, /\[\[attach:/, '正文里不应残留指令');
  assert.doesNotMatch(text, /arch\.png/, '正文里不应出现文件名路径');
  assert.equal(h.calls.files.length, 1);
  assert.equal(path.basename(h.calls.files[0].filePath), 'arch.png');
});

test('附件被护栏/白名单拒绝时，只记审计，不影响文字发送', async () => {
  const h = harness({
    reply: '结论\n\n[[attach:/etc/passwd]]',
    scope: { roots: ['/tmp/nowhere'], baseDir: '/tmp/nowhere' },
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '', attachments: { enabled: true, maxCount: 2, maxBytes: 1024 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  const summary = await h.run(BASE);
  assert.equal(h.calls.send.length, 1);
  assert.equal(h.calls.files.length, 0);
  const rejected = summary && h.store.peek().audit.find((a) => a.action === 'attachment');
  assert.ok(rejected, '应留下附件拒绝的审计');
  assert.match(rejected.detail, /只允许|不在允许的目录|不存在/);
});

test('草稿模式把附件存进待确认队列，确认发送时一并补发', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-confirm-attach-'));
  fs.writeFileSync(path.join(root, 'a.png'), 'x'.repeat(32));

  const h = harness({
    reply: '结论\n\n[[attach:a.png]]',
    scope: { roots: [root], baseDir: root },
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'confirm', mergeWindowSeconds: 0, replyMarker: '', attachments: { enabled: true, maxCount: 2, maxBytes: 1024 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: false }]
    }
  });
  await h.run(BASE);
  const state = h.store.peek();
  const entry = Object.values(state.confirm)[0];
  assert.equal(entry.attachments.length, 1);

  const { confirmAndSend } = await import('../lib/core/pipeline.js');
  const res = await confirmAndSend({ state, store: h.store, adapters: h.adapters, key: Object.keys(state.confirm)[0], contact: { name: '张三', openDingTalkId: 'OD1' } });
  assert.equal(res.ok, true);
  assert.equal(h.calls.files.length, 1);
});

// ---------- 配图渲染 ----------

test('渲染块由宿主生成 PNG 并作为附件补发，正文不含渲染块', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-render-pipe-'));
  const png = path.join(root, 'render-1.png');
  fs.writeFileSync(png, 'x'.repeat(128));

  const rendered = [];
  const h = harness({
    reply: '结论：见下表。\n\n[[render:table|订单分布]]\n类别 | 条数\n华东 | 1399\n[[/render]]',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '',
      render: { enabled: true, maxBlocks: 1, maxRows: 10, minRows: 1, width: 960 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  // 用假的渲染器，避免测试依赖 Python
  h.adapters.renderSpec = async (spec) => {
    rendered.push(spec);
    return { ok: true, path: png, name: 'render-1.png', bytes: 128 };
  };
  await h.run(BASE);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].type, 'table');
  assert.equal(rendered[0].title, '订单分布');
  const text = h.calls.send[0].text;
  assert.doesNotMatch(text, /\[\[render/);
  assert.doesNotMatch(text, /华东 \| 1399/);
  assert.equal(h.calls.files.length, 1);
  assert.equal(path.basename(h.calls.files[0].filePath), 'render-1.png');
});

test('渲染失败只记审计，文字照发', async () => {
  const h = harness({
    reply: '结论\n\n[[render:table|T]]\na | b\n1 | 2\n[[/render]]',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '',
      render: { enabled: true, maxBlocks: 1, maxRows: 10, minRows: 1 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  h.adapters.renderSpec = async () => ({ ok: false, error: '渲染进程错误：boom' });
  const summary = await h.run(BASE);
  assert.equal(h.calls.send.length, 1);
  assert.equal(h.calls.files.length, 0);
  const audit = h.store.peek().audit.find((a) => a.action === 'render');
  assert.ok(audit);
  assert.match(audit.detail, /boom/);
  assert.equal(summary.errors.length, 0, '渲染失败不算发送错误');
});

test('不合法渲染块被拒并记审计', async () => {
  const h = harness({
    reply: '结论\n\n[[render:table|T]]\n只有表头\n[[/render]]',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '',
      render: { enabled: true, maxBlocks: 1, maxRows: 10, minRows: 1 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  h.adapters.renderSpec = async () => ({ ok: true, path: '/nope.png', name: 'nope.png', bytes: 1 });
  await h.run(BASE);
  assert.equal(h.calls.files.length, 0);
  const audit = h.store.peek().audit.find((a) => a.action === 'render');
  assert.match(audit.detail, /至少要有表头/);
});

test('行数太少不出图（避免一句话也配图）', async () => {
  const h = harness({
    reply: '结论\n\n[[render:table|T]]\na | b\n1 | 2\n[[/render]]',
    messages: [{ messageId: 'm1', text: '在吗', senderId: 'OD1', createTime: '2026-03-01 10:00:00' }],
    config: {
      mode: 'auto', mergeWindowSeconds: 0, replyMarker: '',
      render: { enabled: true, maxBlocks: 1, maxRows: 10, minRows: 3 },
      contacts: [{ name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1', autoReply: true }]
    }
  });
  let rendered = 0;
  h.adapters.renderSpec = async () => { rendered += 1; return { ok: true, path: '/x.png', name: 'x.png', bytes: 1 }; };
  await h.run(BASE);
  assert.equal(rendered, 0, '少于 minRows 时不应渲染');
  assert.equal(h.calls.send.length, 1, '文字照发');
  const audit = h.store.peek().audit.find((a) => a.action === 'render');
  assert.match(audit.detail, /少于 3 行/);
});
