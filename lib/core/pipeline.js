import crypto from 'node:crypto';
import { parseCreateTime } from './time.js';
import { checkSendPolicy, contactKey, isIncomingFromContact, recordSend, tidyReply } from './policy.js';
import { guardReply } from './guard.js';
import { extractAttachments, resolveAttachments } from './attachments.js';
import { extractRenderBlocks, parseRenderBlock } from './render.js';
import { formatForChat, formatForMarkdown, breakLongParagraph } from './format.js';

/** 审计里记录这条回复是哪个模型产生的（插件配置优先，空则跟随默认）。 */
function modelLabel(config) {
  const agent = config?.agent || {};
  if (agent.provider && agent.model) return `${agent.provider}/${agent.model}`;
  return '';
}

function idempotencyKeyFor(key, messageId) {
  return 'dshdt-' + crypto.createHash('sha256').update(`${key}:${messageId}`).digest('hex').slice(0, 32);
}

/**
 * 跑一轮。所有外部能力都由 adapters 注入，便于脱离 DSH 单测。
 * adapters = {
 *   listMessages(contact, sinceMs) -> { ok, messages }
 *   generate({ contact, messages, sessionId }) -> { ok, reply, error }
 *   send(contact, text, idempotencyKey) -> { ok, error }
 * }
 */
export async function runCycle({ config, state, store, adapters, logger = null, now = Date.now() }) {
  const timeZone = config.timeZone || 'Asia/Shanghai';
  const summary = {
    skippedReason: null, contacts: 0, fetched: 0, fresh: 0,
    drafts: [], confirms: [], sent: [], blocked: [], deferred: [], skipped: [], errors: []
  };

  if (!config.enabled) { summary.skippedReason = '插件未启用'; return summary; }
  if (store.isPaused()) { summary.skippedReason = '已急停（PAUSE 文件存在）'; return summary; }
  const contacts = Array.isArray(config.contacts) ? config.contacts : [];
  if (contacts.length === 0) { summary.skippedReason = '监控名单为空'; return summary; }

  // 首次启用（还没有游标）时要多回看一段：只回看 120 秒几乎必然"看起来没反应"。
  const initialLookback = Number.isFinite(config.initialLookbackSeconds)
    ? config.initialLookbackSeconds
    : 900;

  for (const contact of contacts) {
    const key = contactKey(contact);
    summary.contacts += 1;
    try {
      const cursor = state.cursors[key];
      const hasCursor = typeof cursor === 'number' && cursor > 0;
      const lookback = hasCursor ? (config.overlapSeconds || 0) : initialLookback;
      const sinceMs = (hasCursor ? cursor : now) - lookback * 1000;
      const fetched = await adapters.listMessages(contact, sinceMs);
      if (!fetched.ok) {
        summary.errors.push({ contact: contact.name, stage: 'fetch', error: fetched.error?.message });
        state.stats.errors += 1;
        store.audit(state, { contact: contact.name, action: 'error', stage: 'fetch', error: fetched.error?.message });
        continue;
      }

      summary.fetched += fetched.messages.length;

      const pending = state.pending[key] || [];
      const pendingIds = new Set(pending.map((m) => m.messageId));
      let newest = 0;

      for (const msg of fetched.messages) {
        if (!msg.messageId || pendingIds.has(msg.messageId) || state.seen[msg.messageId]) continue;
        if (!msg.text) { state.seen[msg.messageId] = now; continue; }
        if (!isIncomingFromContact({ senderId: msg.senderId, selfUserId: config.selfUserId, contact })) {
          state.seen[msg.messageId] = now;
          continue;
        }
        const ts = parseCreateTime(msg.createTime, timeZone);
        if (ts !== null && ts <= (state.cursors[key] ?? 0)) { state.seen[msg.messageId] = now; continue; }
        pending.push({ messageId: msg.messageId, text: msg.text, createTime: ts, senderId: msg.senderId });
        pendingIds.add(msg.messageId);
        summary.fresh += 1;
        if (ts && ts > newest) newest = ts;
      }

      if (pending.length === 0) continue;

      pending.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
      const newestPending = pending.reduce((acc, m) => Math.max(acc, m.createTime || 0), 0);

      const withinWindow = newestPending > 0 && now - newestPending < (config.mergeWindowSeconds || 0) * 1000;
      if (withinWindow && pending.length < 30) {
        state.pending[key] = pending.slice(-30);
        summary.deferred.push({ contact: contact.name, buffered: pending.length });
        continue;
      }

      const messages = pending.slice(-30);
      // 会话 id：状态里记得的优先（首次生成时由 headless 新建并回报），配置里显式指定的次之
      const knownSession = (state.sessions && state.sessions[key]) || contact.sessionId || '';
      const gen = await adapters.generate({ contact, messages, sessionId: knownSession });
      if (!gen.ok) {
        summary.errors.push({ contact: contact.name, stage: 'generate', error: gen.error });
        state.stats.errors += 1;
        state.pending[key] = messages; // 保留，下一轮重试
        store.audit(state, { contact: contact.name, action: 'error', stage: 'generate', error: gen.error });
        continue;
      }

      // headless 首次会新建会话并回报 id；记住它，下一条消息就能续上同一段上下文
      if (gen.sessionId && gen.sessionId !== knownSession) {
        state.sessions = state.sessions || {};
        state.sessions[key] = gen.sessionId;
      }

      // 出站标识：让收到的人知道这条是助手代答（长度先给标识留出空间）
      const marker = typeof config.replyMarker === 'string' ? config.replyMarker.trim() : '';
      // 空行分隔：Markdown 里单个换行不算分段，模型末尾紧跟标识会糊在一起。
      const markerSuffix = marker ? `\n\n${marker}` : '';
      const bodyLimit = Math.max(20, (config.limits?.maxReplyChars ?? 300) - marker.length);

      // 渲染块先抽出来（它们不进正文），再抽附件指令
      const renderCfg = config.render || {};
      const renderParsed = renderCfg.enabled ? extractRenderBlocks(gen.reply) : { text: gen.reply, blocks: [] };
      const renderBlocks = renderParsed.blocks;

      // 附件指令：正文里不能出现路径（护栏会把绝对路径抹掉）
      const attachCfg = config.attachments || {};
      const attachParsed = attachCfg.enabled
        ? extractAttachments(renderParsed.text)
        : { text: renderParsed.text, requests: [] };
      const attachRequests = attachParsed.requests;

      // 排版：钉钉这条链路支持 Markdown，默认保留记号只做归一化；
      // 只有 replyFormat=text 时才去掉记号并按中文句号折行。
      const cleaned = tidyReply(attachParsed.text);
      const formatted = config.replyFormat === 'text'
        ? breakLongParagraph(formatForChat(cleaned), { maxLineChars: 90 })
        : formatForMarkdown(cleaned);
      const guarded = guardReply(formatted, {
        ...(config.guard || {}),
        maxChars: bodyLimit
      });

      if (!guarded.ok) {
        summary.blocked.push({ contact: contact.name, reason: guarded.reason });
        state.stats.blocked += 1;
        store.audit(state, {
          contact: contact.name, action: 'blocked', reason: guarded.reason,
          messageIds: messages.map((m) => m.messageId), rawPreview: String(gen.reply || '').slice(0, 200)
        });
        clearPending(state, key, messages, newestPending, now);
        continue;
      }

      const reply = guarded.text;
      if (!reply || /^SKIP$/i.test(reply)) {
        summary.skipped.push({ contact: contact.name, reason: '模型判断无需回复' });
        state.stats.skipped += 1;
        store.audit(state, { contact: contact.name, action: 'skip' });
        clearPending(state, key, messages, newestPending, now);
        continue;
      }

      // 真正发出去的正文（含标识）
      const outbound = markerSuffix && !reply.includes(marker) ? `${reply}${markerSuffix}` : reply;

      const lastId = messages[messages.length - 1].messageId;
      const idem = idempotencyKeyFor(key, lastId);
      const mode = config.mode || 'draft';
      const wantsSend = contact.autoReply === true;

      let attachmentFiles = [];
      if (attachCfg.enabled && attachRequests.length > 0) {
        const scope = typeof adapters.attachmentScope === 'function'
          ? adapters.attachmentScope(contact)
          : { roots: attachCfg.roots || [], baseDir: attachCfg.baseDir || '' };
        const resolved = resolveAttachments(attachRequests, {
          roots: scope.roots || [],
          baseDir: scope.baseDir || '',
          maxCount: attachCfg.maxCount,
          maxBytes: attachCfg.maxBytes
        });
        attachmentFiles = resolved.files;
        for (const err of resolved.errors) {
          store.audit(state, { contact: contact.name, action: 'attachment', stage: 'reject', detail: `${err.request}：${err.reason}` });
        }
      }

      // 渲染配图：宿主侧生成 PNG，作为附件补发
      if (renderCfg.enabled && renderBlocks.length > 0 && typeof adapters.renderSpec === 'function') {
        const limit = Math.max(0, renderCfg.maxBlocks ?? 1);
        for (const block of renderBlocks.slice(0, limit)) {
          const parsed = parseRenderBlock(block, {
            maxRows: renderCfg.maxRows ?? 10,
            minRows: renderCfg.minRows ?? 3
          });
          if (!parsed.ok) {
            store.audit(state, { contact: contact.name, action: 'render', stage: 'reject', detail: parsed.error });
            continue;
          }
          const rendered = await adapters.renderSpec(parsed.spec);
          if (rendered.ok) {
            attachmentFiles.push({ path: rendered.path, name: rendered.name, bytes: rendered.bytes });
            store.audit(state, { contact: contact.name, action: 'render', stage: 'generated', detail: `${parsed.spec.type === 'flow' ? 'flow' : parsed.spec.type}：${parsed.spec.title || '(无标题)'}` });
          } else {
            store.audit(state, { contact: contact.name, action: 'render', stage: 'error', detail: rendered.error });
          }
        }
      }

      const pendingEntry = {
        contact: contact.name, key, sessionId: contact.sessionId || '',
        messages, reply: outbound, body: reply,
        attachments: attachmentFiles,
        messageIds: messages.map((m) => m.messageId),
        idempotencyKey: idem, createdAt: new Date(now).toISOString()
      };

      if (mode !== 'auto' || !wantsSend) {
        const reason = mode === 'draft'
          ? '草稿模式'
          : mode === 'confirm'
            ? '等待人工确认'
            : '该联系人未开启 autoReply';
        if (mode === 'confirm') {
          state.confirm[key] = pendingEntry;
          summary.confirms.push({ contact: contact.name, reply: outbound, reason });
        } else {
          summary.drafts.push({ contact: contact.name, reply: outbound, reason });
        }
        state.stats.drafts += 1;
        store.audit(state, { contact: contact.name, action: 'draft', reason, reply: outbound, model: modelLabel(config), messageIds: pendingEntry.messageIds });
        clearPending(state, key, messages, newestPending, now);
        continue;
      }

      const policy = checkSendPolicy({
        limits: config.limits, quietHours: config.quietHours, state, key, epochMs: now, timeZone
      });
      if (!policy.ok) {
        state.confirm[key] = pendingEntry;
        summary.confirms.push({ contact: contact.name, reply, reason: `发送策略拦截：${policy.reason}` });
        state.stats.blocked += 1;
        store.audit(state, { contact: contact.name, action: 'blocked', reason: policy.reason, reply: outbound });
        clearPending(state, key, messages, newestPending, now);
        continue;
      }

      const sent = await adapters.send(contact, outbound, idem);
      if (!sent.ok) {
        summary.errors.push({ contact: contact.name, stage: 'send', error: sent.error?.message });
        state.stats.errors += 1;
        store.audit(state, { contact: contact.name, action: 'error', stage: 'send', error: sent.error?.message });
        clearPending(state, key, messages, newestPending, now);
        continue;
      }

      recordSend(state, key, now);
      state.stats.sent += 1;
      summary.sent.push({ contact: contact.name, reply: outbound });
      store.audit(state, {
        contact: contact.name, action: 'sent', reply: outbound, model: modelLabel(config),
        ...(guarded.truncated ? { truncated: true, note: `正文超过 ${bodyLimit} 字被截断` } : {}),
        messageIds: pendingEntry.messageIds
      });

      // 文字发出去之后再补发附件（钉钉里是文件附件，不内联）
      if (attachmentFiles.length > 0 && typeof adapters.sendFile === 'function') {
        for (const [index, file] of attachmentFiles.entries()) {
          const sentFile = await adapters.sendFile(contact, file.path, `${idem}-f${index}`);
          store.audit(state, {
            contact: contact.name,
            action: 'attachment',
            stage: sentFile.ok ? 'sent' : 'error',
            detail: `${file.name}（${(file.bytes / 1024).toFixed(0)}KB）${sentFile.ok ? '' : `：${sentFile.error?.message || '发送失败'}`}`
          });
        }
      }
      clearPending(state, key, messages, newestPending, now);
    } catch (err) {
      summary.errors.push({ contact: contact.name, stage: 'unexpected', error: err.message });
      state.stats.errors += 1;
      store.audit(state, { contact: contact.name, action: 'error', stage: 'unexpected', error: err.message });
    }
  }

  return summary;
}

function clearPending(state, key, messages, newestCreateTime, now) {
  for (const m of messages) state.seen[m.messageId] = now;
  state.pending[key] = [];
  const cursor = newestCreateTime || (state.cursors[key] ?? now);
  if (cursor > (state.cursors[key] ?? 0)) state.cursors[key] = cursor;
}

/** 人工确认后发送：把 confirm 队列里的草稿发出去。 */
export async function confirmAndSend({ state, store, adapters, key, contact }) {
  const entry = state.confirm[key];
  if (!entry) return { ok: false, error: '没有待确认的草稿' };
  // 必须拿到真实收件人，否则 dws 没有 openDingTalkId / userId 可发（曾经的 bug）。
  if (!contact || (!contact.openDingTalkId && !contact.userId)) {
    return { ok: false, error: '找不到该联系人的钉钉 ID，无法发送（请先补 openDingTalkId）' };
  }
  const res = await adapters.send({ ...contact, key }, entry.reply, entry.idempotencyKey);
  if (!res.ok) {
    store.audit(state, { contact: entry.contact, action: 'error', stage: 'confirm-send', error: res.error?.message });
    return res;
  }
  delete state.confirm[key];
  state.stats.sent += 1;
  store.audit(state, { contact: entry.contact, action: 'sent', reply: entry.reply, via: 'confirm' });

  if (Array.isArray(entry.attachments) && entry.attachments.length > 0 && typeof adapters.sendFile === 'function') {
    for (const [index, file] of entry.attachments.entries()) {
      /* eslint-disable no-await-in-loop */
      const sentFile = await adapters.sendFile(contact, file.path, `${entry.idempotencyKey}-f${index}`);
      store.audit(state, {
        contact: entry.contact,
        action: 'attachment',
        stage: sentFile.ok ? 'sent' : 'error',
        detail: `${file.name}${sentFile.ok ? '' : `：${sentFile.error?.message || '发送失败'}`}`
      });
    }
  }
  return { ok: true };
}

/** 丢弃待确认草稿。 */
export function discardConfirm({ state, store, key }) {
  const entry = state.confirm[key];
  if (!entry) return { ok: false, error: '没有待确认的草稿' };
  delete state.confirm[key];
  store.audit(state, { contact: entry.contact, action: 'discarded' });
  return { ok: true };
}
