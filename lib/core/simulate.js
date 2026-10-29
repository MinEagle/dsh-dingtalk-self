/**
 * 模拟回答的组装逻辑：把一次生成的原文，按**与真实链路相同的顺序**处理成
 * 可展示的结果（正文 / 标识 / 配图缩略图 / 附件校验）。
 *
 * 抽成纯函数是为了能在没有模型、没有 DSH 宿主的情况下写测试：
 * 渲染与发送都由调用方注入。
 */

import { tidyReply } from './policy.js';
import { guardReply } from './guard.js';
import { extractRenderBlocks, parseRenderBlock } from './render.js';
import { extractAttachments, resolveAttachments } from './attachments.js';

export async function buildSimulationPayload({
  rawReply,
  cfg,
  contact,
  attachmentScope = null,
  renderSpec = null,
  maxInlineBytes = 600 * 1024
}) {
  const renderCfg = cfg.render || {};
  const attachCfg = cfg.attachments || {};

  // 顺序要和 pipeline 一致：渲染块 → 附件指令 → 正文
  const renderParsed = renderCfg.enabled ? extractRenderBlocks(rawReply) : { text: rawReply, blocks: [] };
  const attachParsed = attachCfg.enabled
    ? extractAttachments(renderParsed.text)
    : { text: renderParsed.text, requests: [] };

  const marker = typeof cfg.replyMarker === 'string' ? cfg.replyMarker.trim() : '';
  const bodyLimit = Math.max(20, (cfg.limits?.maxReplyChars ?? 1200) - marker.length);
  const guarded = guardReply(tidyReply(attachParsed.text), { ...(cfg.guard || {}), maxChars: bodyLimit });
  if (!guarded.ok) {
    return { ok: false, error: `出站护栏拦下了这条回复：${guarded.reason}`, raw: String(rawReply || '').slice(0, 400) };
  }

  const body = guarded.text;
  const outbound = marker && !body.includes(marker) ? `${body}\n\n${marker}` : body;

  const renders = [];
  const limit = Math.max(0, renderCfg.maxBlocks ?? 1);
  if (renderCfg.enabled && renderParsed.blocks.length > 0) {
    for (const block of renderParsed.blocks.slice(0, limit)) {
      const parsed = parseRenderBlock(block, {
        maxRows: renderCfg.maxRows ?? 10,
        minRows: renderCfg.minRows ?? 3
      });
      if (!parsed.ok) {
        renders.push({ ok: false, type: block.type, error: parsed.error });
        continue;
      }
      if (typeof renderSpec !== 'function') {
        renders.push({ ok: false, type: parsed.spec.type, title: parsed.spec.title, error: '宿主没有提供渲染能力' });
        continue;
      }
      const rendered = await renderSpec(parsed.spec);
      if (!rendered.ok) {
        renders.push({ ok: false, type: parsed.spec.type, title: parsed.spec.title, error: rendered.error });
        continue;
      }
      renders.push({
        ok: true,
        type: parsed.spec.type,
        title: parsed.spec.title,
        name: rendered.name,
        bytes: rendered.bytes,
        dataUrl: rendered.bytes <= maxInlineBytes ? rendered.dataUrl || null : null
      });
    }
    if (renderParsed.blocks.length > limit) {
      renders.push({ ok: false, error: `超过单条上限（最多 ${limit} 张），后面的块会被丢掉` });
    }
  }

  let attachments = [];
  if (attachCfg.enabled && attachParsed.requests.length > 0) {
    const scope = attachmentScope
      ? attachmentScope(contact)
      : { roots: attachCfg.roots || [], baseDir: attachCfg.baseDir || '' };
    const resolved = resolveAttachments(attachParsed.requests, {
      roots: scope.roots || [],
      baseDir: scope.baseDir || '',
      maxCount: attachCfg.maxCount,
      maxBytes: attachCfg.maxBytes
    });
    attachments = [
      ...resolved.files.map((f) => ({ ok: true, name: f.name, bytes: f.bytes, path: f.path })),
      ...resolved.errors.map((e) => ({ ok: false, request: e.request, error: e.reason }))
    ];
  }

  return {
    ok: true,
    reply: body,
    outbound,
    truncated: guarded.truncated === true,
    limitChars: bodyLimit,
    renders,
    attachments
  };
}
