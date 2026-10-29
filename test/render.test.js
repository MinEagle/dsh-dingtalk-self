import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { extractRenderBlocks, parseRenderBlock, renderToPng, resolvePython } from '../lib/core/render.js';

test('抽出渲染块并从正文里去掉', () => {
  const raw = [
    '结论第一行',
    '',
    '[[render:table|订单分布]]',
    '区域 | 渠道 | 订单',
    '华东 | 直营 | 1399',
    '[[/render]]',
    '',
    '注意：这是快照。'
  ].join('\n');
  const { text, blocks } = extractRenderBlocks(raw);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.equal(blocks[0].title, '订单分布');
  assert.equal(text, '结论第一行\n\n注意：这是快照。');
  assert.doesNotMatch(text, /\[\[render/);
});

test('表格块解析：表头 + 行，列数对齐，最多 maxRows 行', () => {
  const block = {
    type: 'table',
    title: 'T',
    lines: ['a | b', '1 | 2', '3', '4 | 5 | 6']
  };
  const parsed = parseRenderBlock(block, { maxRows: 2 });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.spec.columns, ['a', 'b']);
  assert.equal(parsed.spec.rows.length, 2);
  assert.deepEqual(parsed.spec.rows[0], ['1', '2']);
  assert.deepEqual(parsed.spec.rows[1], ['3', '']); // 缺列补空
});

test('步骤块解析：标题 | 说明', () => {
  const block = { type: 'steps', title: '流程', lines: ['收集签名 | 前端上传', '写记录'] };
  const parsed = parseRenderBlock(block);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.spec.steps, [
    { title: '收集签名', desc: '前端上传' },
    { title: '写记录', desc: '' }
  ]);
});

test('流程图块解析：节点 | 说明', () => {
  const block = { type: 'flow', title: '流转', lines: ['提交 | 入参', '校验 | 判定', '落库'] };
  const parsed = parseRenderBlock(block, { minRows: 2 });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.spec.nodes, [
    { text: '提交', note: '入参' },
    { text: '校验', note: '判定' },
    { text: '落库', note: '' }
  ]);
});

test('柱状图块解析：标签 | 数值，千分位与非法值处理', () => {
  const block = { type: 'bar', title: '数量', lines: ['A | 1,399', 'B | 1344', 'C | 不是数字'] };
  const parsed = parseRenderBlock(block);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.spec.items, [{ label: 'A', value: 1399 }, { label: 'B', value: 1344 }]);
});

test('柱状图少于 2 项不出图', () => {
  const parsed = parseRenderBlock({ type: 'bar', lines: ['A | 1'] });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /至少要有 2 个/);
});

test('流程图节点太少不出图', () => {
  const parsed = parseRenderBlock({ type: 'flow', lines: ['一步'] }, { minRows: 3 });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /少于 3 个/);
});

test('不合法块被拒（不渲染错图）', () => {
  assert.equal(parseRenderBlock({ type: 'table', lines: ['只有表头'] }).ok, false);
  assert.equal(parseRenderBlock({ type: 'table', lines: [] }).ok, false);
  assert.equal(parseRenderBlock({ type: 'steps', lines: [] }).ok, false);
});

test('未闭合的块也能收下（模型常漏结尾）', () => {
  const { blocks } = extractRenderBlocks('[[render:steps|流程]]\n甲 | 乙\n');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'steps');
});

test('resolvePython 返回可执行路径或裸 python3', () => {
  const resolved = resolvePython('');
  assert.equal(typeof resolved, 'string');
  if (resolved !== 'python3') assert.ok(fs.existsSync(resolved), `解析出的 Python 应存在：${resolved}`);
});

test('真实渲染：表格与步骤都能出 PNG（没有 Pillow 时跳过）', async (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-render-'));
  const table = await renderToPng(
    { type: 'table', title: '订单分布', columns: ['类别', '条数'], rows: [['华东', '1399'], ['华北', '1344']] },
    { outDir, width: 720 }
  );
  if (!table.ok) {
    t.skip(`渲染环境不可用：${table.error}`);
    return;
  }
  const stat = fs.statSync(table.path);
  assert.ok(stat.size > 1000, 'PNG 应有一定体积');
  const head = fs.readFileSync(table.path).subarray(0, 8);
  assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], '应是合法 PNG 头');

  const steps = await renderToPng(
    { type: 'steps', title: '流程', steps: [{ title: '收集', desc: '上传签名' }, { title: '落库', desc: '只留一条' }] },
    { outDir, width: 720 }
  );
  assert.equal(steps.ok, true);
  assert.ok(fs.statSync(steps.path).size > 1000);

  const flow = await renderToPng(
    { type: 'flow', title: '流转', nodes: [{ text: '提交', note: '入参' }, { text: '校验', note: '判定' }, { text: '落库' }] },
    { outDir, width: 720 }
  );
  assert.equal(flow.ok, true);
  assert.ok(fs.statSync(flow.path).size > 1000);

  const bar = await renderToPng(
    { type: 'bar', title: '数量对比', items: [{ label: 'A', value: 1399 }, { label: 'B', value: 361 }, { label: 'C', value: 30 }] },
    { outDir, width: 720 }
  );
  assert.equal(bar.ok, true);
  assert.ok(fs.statSync(bar.path).size > 1000);
});

test('渲染 spec 非法时返回错误而不是抛异常', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-render-bad-'));
  const bad = await renderToPng({ type: 'nope' }, { outDir });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /渲染失败|未知类型/);
});
