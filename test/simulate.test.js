import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildSimulationPayload } from '../lib/core/simulate.js';

const baseCfg = (over = {}) => ({
  limits: { maxReplyChars: 1200 },
  guard: { enabled: true, stripCodeBlocks: true, redactPaths: true, redactInternalUrls: true, blockedWords: [] },
  replyMarker: '（本条由助手代答）',
  render: { enabled: true, maxBlocks: 1, maxRows: 10, minRows: 3 },
  attachments: { enabled: true, maxCount: 2, maxBytes: 1024 * 1024 },
  ...over
});

const contact = { name: '张三', workspaceId: 'ws1', openDingTalkId: 'OD1' };

test('模拟结果：正文去掉渲染块、带上标识，并返回渲染缩略图', async () => {
  const calls = [];
  const payload = await buildSimulationPayload({
    rawReply: '结论：见下表。\n\n[[render:table|订单分布]]\n类别 | 条数\n华东 | 1399\n华北 | 1344\n华南 | 361\n[[/render]]\n\n注意：这是快照。',
    cfg: baseCfg(),
    contact,
    renderSpec: async (spec) => {
      calls.push(spec);
      return { ok: true, path: '/tmp/x.png', name: 'x.png', bytes: 1024, dataUrl: 'data:image/png;base64,AAA' };
    }
  });
  assert.equal(payload.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'table');
  assert.doesNotMatch(payload.reply, /\[\[render/);
  assert.match(payload.reply, /注意：这是快照。/);
  assert.match(payload.outbound, /（本条由助手代答）$/);
  assert.equal(payload.renders.length, 1);
  assert.equal(payload.renders[0].ok, true);
  assert.equal(payload.renders[0].dataUrl, 'data:image/png;base64,AAA');
});

test('模拟结果：行数太少时说明不出图，而不是静默丢弃', async () => {
  const payload = await buildSimulationPayload({
    rawReply: '结论\n\n[[render:table|T]]\na | b\n1 | 2\n[[/render]]',
    cfg: baseCfg(),
    contact,
    renderSpec: async () => ({ ok: true, path: '/tmp/y.png', name: 'y.png', bytes: 10 })
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.renders.length, 1);
  assert.equal(payload.renders[0].ok, false);
  assert.match(payload.renders[0].error, /少于 3 行/);
});

test('模拟结果：附件只校验不发送，成功与失败都列出来', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-sim-attach-'));
  fs.writeFileSync(path.join(root, 'arch.png'), 'x'.repeat(64));

  const payload = await buildSimulationPayload({
    rawReply: '结论\n\n[[attach:arch.png]]\n[[attach:missing.pdf]]',
    cfg: baseCfg({ render: { enabled: false } }),
    contact,
    attachmentScope: () => ({ roots: [root], baseDir: root }),
    renderSpec: async () => ({ ok: true })
  });
  assert.equal(payload.attachments.length, 2);
  assert.equal(payload.attachments[0].ok, true);
  assert.equal(payload.attachments[0].name, 'arch.png');
  assert.equal(payload.attachments[1].ok, false);
  assert.match(payload.attachments[1].error, /不存在/);
  assert.doesNotMatch(payload.reply, /\[\[attach/);
});

test('模拟结果：超过单张上限会明说', async () => {
  const payload = await buildSimulationPayload({
    rawReply: '结论\n\n[[render:bar|A]]\n甲 | 1\n乙 | 2\n[[/render]]\n\n[[render:bar|B]]\n丙 | 3\n丁 | 4\n[[/render]]',
    cfg: baseCfg({ render: { enabled: true, maxBlocks: 1, maxRows: 10, minRows: 2 } }),
    contact,
    renderSpec: async (spec) => ({ ok: true, path: '/tmp/z.png', name: 'z.png', bytes: 10, dataUrl: 'data:x' })
  });
  assert.equal(payload.renders.filter((r) => r.ok).length, 1);
  assert.ok(payload.renders.some((r) => /超过单条上限/.test(r.error || '')));
});

test('模拟结果：护栏拦下时返回失败原因', async () => {
  const payload = await buildSimulationPayload({
    rawReply: '好的',
    cfg: baseCfg({ guard: { enabled: true, blockedWords: ['好的'] } }),
    contact
  });
  assert.equal(payload.ok, false);
  assert.match(payload.error, /禁用词/);
});
