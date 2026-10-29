import { execFile } from 'node:child_process';
import { formatDingTalkTime } from './time.js';

const MAX_BUFFER = 32 * 1024 * 1024;

function run(dwsPath, profile, args, { timeoutMs = 60_000 } = {}) {
  const full = profile ? ['--profile', profile, ...args] : args;
  return new Promise((resolve) => {
    execFile(dwsPath, full, { timeout: timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        return resolve({
          ok: false,
          error: { command: `${dwsPath} ${full.join(' ')}`, code: err.code, message: String(stderr || err.message || '').trim().slice(0, 1500) }
        });
      }
      const text = (stdout || '').trim();
      if (!text) return resolve({ ok: false, error: { message: 'dws 返回空输出' } });
      try {
        return resolve({ ok: true, json: JSON.parse(text) });
      } catch {
        const start = text.search(/[[{]/);
        if (start >= 0) {
          try { return resolve({ ok: true, json: JSON.parse(text.slice(start)) }); } catch { /* fallthrough */ }
        }
        return resolve({ ok: false, error: { message: `dws 输出不是 JSON：${text.slice(0, 300)}` } });
      }
    });
  });
}

export function createDws({ dwsPath = 'dws', profile = '', runner } = {}) {
  // runner 仅用于测试：直接拿到最终 argv，返回 { ok, json }
  const call = runner
    ? (args) => runner(profile ? ['--profile', profile, ...args] : args)
    : (args, opts) => run(dwsPath, profile, args, opts);

  return {
    async authStatus() {
      const res = await call(['auth', 'status', '-f', 'json']);
      if (!res.ok) return res;
      return { ok: true, authenticated: res.json?.authenticated === true, raw: res.json };
    },

    async whoAmI() {
      const res = await call(['contact', 'user', 'get-self', '-f', 'json']);
      if (!res.ok) return res;
      return { ok: true, user: pickUser(res.json) };
    },

    async resolveContact(keyword) {
      const res = await call(['contact', 'user', 'search', '--query', keyword, '-f', 'json']);
      if (!res.ok) return res;
      const list = pickArray(res.json).map(pickUser).filter((u) => u.userId || u.openDingTalkId);
      return { ok: true, candidates: list };
    },

    async listMessages(contact, { sinceMs, limit = 50, timeZone = 'Asia/Shanghai' } = {}) {
      const args = ['chat', 'message', 'list', '-f', 'json'];
      if (contact.openDingTalkId) args.push('--open-dingtalk-id', contact.openDingTalkId);
      else args.push('--user', contact.userId);
      if (sinceMs) args.push('--time', formatDingTalkTime(sinceMs, timeZone), '--direction', 'newer');
      args.push('--limit', String(limit));
      const res = await call(args);
      if (!res.ok) return res;
      return { ok: true, messages: extractMessages(res.json).map(normalizeMessage) };
    },

    /** 发本地文件 / 图片：钉钉里显示为可下载附件（不是内联图）。 */
    async sendFile(contact, filePath, { aiTag = false, idempotencyKey = '' } = {}) {
      const args = ['chat', 'message', 'send', '-f', 'json', '--msg-type', 'file', '--file', filePath];
      if (contact.openDingTalkId) args.push('--open-dingtalk-id', contact.openDingTalkId);
      else args.push('--user', contact.userId);
      args.push(`--ai-tag=${aiTag ? 'true' : 'false'}`);
      if (idempotencyKey) args.push('--idempotency-key', idempotencyKey);
      const res = await call(args);
      if (!res.ok) return res;
      if (res.json?.success === false) {
        return { ok: false, error: { message: JSON.stringify(res.json).slice(0, 800) } };
      }
      return { ok: true, json: res.json };
    },

    async sendMessage(contact, text, { aiTag = false, title = '', idempotencyKey = '' } = {}) {
      const args = ['chat', 'message', 'send', '-f', 'json'];
      if (contact.openDingTalkId) args.push('--open-dingtalk-id', contact.openDingTalkId);
      else args.push('--user', contact.userId);
      args.push('--content', text);
      if (title) args.push('--title', title);
      // 关键：不加这个，消息会带「AI 发送」角标
      args.push(`--ai-tag=${aiTag ? 'true' : 'false'}`);
      if (idempotencyKey) args.push('--idempotency-key', idempotencyKey);
      const res = await call(args);
      if (!res.ok) return res;
      if (res.json?.success === false) {
        return { ok: false, error: { message: JSON.stringify(res.json).slice(0, 800) } };
      }
      return { ok: true, json: res.json };
    }
  };
}

function pickArray(json) {
  if (Array.isArray(json)) return json;
  for (const key of ['result', 'data', 'list', 'items', 'users', 'records']) {
    const v = json?.[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      for (const k2 of ['list', 'items', 'users', 'records', 'result']) {
        if (Array.isArray(v[k2])) return v[k2];
      }
    }
  }
  return [];
}

export function pickUser(obj) {
  const o = obj || {};
  const flat = { ...o };
  for (const key of ['user', 'info', 'data', 'profile']) {
    if (o[key] && typeof o[key] === 'object') Object.assign(flat, o[key]);
  }
  const userId = flat.userid ?? flat.userId ?? flat.user_id ?? flat.staffId ?? flat.staff_id ?? '';
  const openDingTalkId = flat.openDingTalkId ?? flat.open_dingtalk_id ?? flat.openDingTalkID ?? '';
  const name = flat.name ?? flat.nick ?? flat.nickname ?? flat.userName ?? '';
  return { userId: String(userId || ''), openDingTalkId: String(openDingTalkId || ''), name: String(name || '') };
}

export function extractMessages(json) {
  for (const c of [json?.messages, json?.result?.messages, json?.data?.messages]) {
    if (Array.isArray(c)) return c;
  }
  return pickArray(json).filter((x) => x && typeof x === 'object' && (x.messageId || x.openMessageId || x.text));
}

export function normalizeMessage(raw) {
  return {
    messageId: String(raw.messageId ?? raw.openMessageId ?? raw.id ?? ''),
    text: typeof raw.text === 'string' ? raw.text : (typeof raw.content === 'string' ? raw.content : ''),
    senderId: String(raw.senderId ?? raw.sender_id ?? raw.sender ?? ''),
    createTime: raw.createTime ?? raw.create_time ?? raw.sendTime ?? raw.timestamp ?? null,
    messageType: raw.messageType ?? raw.msgType ?? raw.type ?? ''
  };
}
