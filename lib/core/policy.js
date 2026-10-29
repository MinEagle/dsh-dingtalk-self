import { hhmmToMinutes, localMinutes } from './time.js';

export function isQuietNow(quietHours, epochMs, timeZone = 'Asia/Shanghai') {
  if (!quietHours || !quietHours.enabled) return false;
  const cur = localMinutes(epochMs, timeZone);
  const start = hhmmToMinutes(quietHours.start);
  const end = hhmmToMinutes(quietHours.end);
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

export function checkSendPolicy({ limits, quietHours, state, key, epochMs, timeZone }) {
  if (isQuietNow(quietHours, epochMs, timeZone)) {
    return { ok: false, reason: `静默时段（${quietHours.start}-${quietHours.end}）` };
  }
  const list = (state.sent[key] || []).filter((t) => epochMs - t < 3600_000);
  if (list.length >= limits.maxRepliesPerHour) {
    return { ok: false, reason: `该联系人 1 小时内已回复 ${list.length} 次，达到上限 ${limits.maxRepliesPerHour}` };
  }
  const last = list.length ? Math.max(...list) : 0;
  if (last && epochMs - last < limits.minSecondsBetweenReplies * 1000) {
    return { ok: false, reason: `距上次回复仅 ${Math.round((epochMs - last) / 1000)}s，低于最小间隔` };
  }
  return { ok: true };
}

export function recordSend(state, key, epochMs) {
  if (!state.sent[key]) state.sent[key] = [];
  state.sent[key].push(epochMs);
}

/** 只处理对方发给我的消息。 */
export function isIncomingFromContact({ senderId, selfUserId, contact }) {
  if (!senderId) return false;
  if (selfUserId && String(senderId) === String(selfUserId)) return false;
  if (contact.userId && String(senderId) === String(contact.userId)) return true;
  if (contact.openDingTalkId && String(senderId) === String(contact.openDingTalkId)) return true;
  return false;
}

/** 去掉模型爱加的外壳：引号、前缀。代码围栏交给 guard 处理，这里不动。 */
export function tidyReply(text) {
  let out = String(text ?? '').trim();
  if (!out) return '';
  for (const [open, close] of [['"', '"'], ['“', '”'], ["'", "'"], ['「', '」']]) {
    if (out.startsWith(open) && out.endsWith(close) && out.length > open.length + close.length) {
      out = out.slice(open.length, out.length - close.length).trim();
    }
  }
  return out.replace(/^(回复|答复|Reply)[:：]\s*/i, '').trim();
}

export function contactKey(contact) {
  const id = contact.openDingTalkId || contact.userId || 'unknown';
  const safe = String(contact.name || 'contact').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
  return `${safe}-${String(id).slice(-8)}`;
}
