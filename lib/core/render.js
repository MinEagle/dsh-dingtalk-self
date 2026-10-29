/**
 * 把模型输出的结构化块渲染成 PNG（表格 / 步骤）。
 *
 * 为什么由插件渲染而不是让模型画图：headless 子进程是只读的，本机也没有可用沙箱后端，
 * 模型跑不了绘图脚本；而**宿主进程**不受沙箱限制，能起一个带 Pillow 的 Python
 * （DSH 应用自带了 `runtime/primary-runtime/dependencies/python`，无需用户装依赖）。
 *
 * 模型输出格式（贴在工作区里也一眼能看懂）：
 *
 *   [[render:table|各区域订单量]]
 *   区域 | 渠道 | 订单
 *   华东 | 直营 | 1399
 *   [[/render]]
 *
 *   [[render:bar|各区域订单量]]
 *   华东 | 1399
 *   华北 | 1344
 *   [[/render]]
 *
 *   [[render:flow|提交签名的流转]]
 *   前端提交 | 工单号/签名图/邮箱
 *   校验材料 | 电子签/纸质签/双要求
 *   [[/render]]
 *
 *   [[render:steps|提交签名接口做了什么]]
 *   接收签名 | 前端一次性上传签名图、邮箱、评价
 *   写签名记录 | 一张工单只保留一条
 *   [[/render]]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'render', 'render.py');

const OPEN = /^[ \t]*\[\[render:(table|steps|flow|bar)(?:\|([^\]\n]*))?\]\][ \t]*$/i;
const CLOSE = /^[ \t]*\[\[\/render\]\][ \t]*$/i;

/** 抽出渲染块，正文里不留痕迹。 */
export function extractRenderBlocks(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  const kept = [];
  let current = null;

  for (const line of lines) {
    if (current === null) {
      const open = line.match(OPEN);
      if (open) {
        current = { type: open[1].toLowerCase(), title: (open[2] || '').trim(), lines: [] };
        continue;
      }
      kept.push(line);
      continue;
    }
    if (CLOSE.test(line)) {
      blocks.push(current);
      current = null;
      continue;
    }
    current.lines.push(line);
  }
  if (current !== null) blocks.push(current); // 未闭合也收下，模型经常漏结尾

  const body = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: body, blocks };
}

function splitRow(line) {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, index, arr) => !(cell === '' && (index === 0 || index === arr.length - 1)));
}

/** 把一块原始行解析成渲染 spec；不合法返回 { ok:false }（宁可不出图，也不出错图）。 */
export function parseRenderBlock(block, { maxRows = 12, minRows = 1 } = {}) {
  const rows = block.lines.map((l) => l.trim()).filter((l) => l !== '');
  if (rows.length === 0) return { ok: false, error: '渲染块是空的' };

  const title = block.title || '';

  if (block.type === 'table') {
    if (rows.length < 2) return { ok: false, error: 'table 至少要有表头 + 1 行数据' };
    const columns = splitRow(rows[0]);
    if (columns.length < 2) return { ok: false, error: 'table 至少要有 2 列' };
    const bodyRows = rows.slice(1, maxRows + 1).map((line) => {
      const cells = splitRow(line);
      const fixed = cells.slice(0, columns.length);
      while (fixed.length < columns.length) fixed.push('');
      return fixed;
    });
    if (bodyRows.length < minRows) {
      return { ok: false, error: `只有 ${bodyRows.length} 行，少于 ${minRows} 行不出图` };
    }
    return { ok: true, spec: { type: 'table', title, columns, rows: bodyRows } };
  }

  if (block.type === 'bar') {
    const items = rows.map((line) => {
      const cells = splitRow(line);
      const value = Number(String(cells[1] ?? '').replace(/[,，\s]/g, ''));
      return { label: cells[0] || '', value, ok: Number.isFinite(value) };
    }).filter((item) => item.label !== '' && item.ok);
    if (items.length < 2) return { ok: false, error: 'bar 至少要有 2 个可对比的数值' };
    if (items.length > maxRows) items.length = maxRows;
    return { ok: true, spec: { type: 'bar', title, items: items.map(({ label, value }) => ({ label, value })) } };
  }

  if (block.type === 'flow') {
    const nodes = rows.slice(0, maxRows).map((line) => {
      const cells = splitRow(line);
      return { text: cells[0] || '', note: cells.slice(1).join(' ') };
    }).filter((n) => n.text !== '');
    if (nodes.length === 0) return { ok: false, error: 'flow 没有有效节点' };
    if (nodes.length < minRows) {
      return { ok: false, error: `只有 ${nodes.length} 个节点，少于 ${minRows} 个不出图` };
    }
    return { ok: true, spec: { type: 'flow', title, nodes } };
  }

  // steps：每行「标题 | 说明」，只有标题也可以
  const steps = rows.slice(0, maxRows).map((line) => {
    const cells = splitRow(line);
    return { title: cells[0] || '', desc: cells.slice(1).join(' ') };
  }).filter((s) => s.title !== '');
  if (steps.length === 0) return { ok: false, error: 'steps 没有有效步骤' };
  if (steps.length < minRows) {
    return { ok: false, error: `只有 ${steps.length} 步，少于 ${minRows} 步不出图` };
  }
  return { ok: true, spec: { type: 'steps', title, steps } };
}

/** 找可用的 Python（带 Pillow）。顺序：显式配置 → DSH 自带 → PATH。 */
export function pythonCandidates(configured = '') {
  const bundled = (() => {
    try {
      return path.resolve(
        path.dirname(process.execPath),
        '..', 'Resources', 'runtime', 'primary-runtime', 'dependencies', 'python', 'bin', 'python3'
      );
    } catch {
      return '';
    }
  })();
  return [
    configured,
    process.env.DSH_PYTHON || '',
    bundled,
    '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/python/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3'
  ].filter(Boolean);
}

export function resolvePython(configured = '') {
  for (const candidate of pythonCandidates(configured)) {
    if (candidate === 'python3') return 'python3';
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* 下一个 */ }
  }
  return 'python3';
}

/** 渲染一块 spec 成 PNG 文件。 */
export function renderToPng(spec, { pythonPath = '', outDir = '', width = 960, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve) => {
    const out = path.join(outDir, `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (err) {
      return resolve({ ok: false, error: `输出目录不可写：${err.message}` });
    }
    const python = resolvePython(pythonPath);
    let child;
    try {
      child = spawn(python, [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    } catch (err) {
      return resolve({ ok: false, error: `无法启动渲染器：${err.message}` });
    }

    let stderr = '';
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      done({ ok: false, error: `渲染超时（${timeoutMs}ms）` });
    }, timeoutMs + 1000);

    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); done({ ok: false, error: `渲染进程错误：${err.message}` }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return done({ ok: false, error: `渲染失败（退出码 ${code}）：${stderr.trim().slice(0, 300)}` });
      try {
        const stat = fs.statSync(out);
        if (!stat.isFile() || stat.size === 0) return done({ ok: false, error: '渲染没有产出文件' });
        done({ ok: true, path: out, name: path.basename(out), bytes: stat.size });
      } catch (err) {
        done({ ok: false, error: `渲染产物读取失败：${err.message}` });
      }
    });

    try {
      child.stdin.write(JSON.stringify({ ...spec, width, out }));
      child.stdin.end();
    } catch (err) {
      done({ ok: false, error: `写入渲染 spec 失败：${err.message}` });
    }
  });
}
