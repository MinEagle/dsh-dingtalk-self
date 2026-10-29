/**
 * 出站护栏：回复要发到钉钉，最危险的不是改代码，而是把工作区里的
 * 代码片段、绝对路径、内网地址读出来发给同事。这里只做「减法」。
 */

const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]{1,200}`/g;
const ABS_PATH = /(?:\/Users\/|\/home\/|\/var\/|\/private\/|[A-Za-z]:\\|\/Applications\/)[^\s'"`）)，,。]+/g;
const INTERNAL_URL = /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|[^\s/]*\.local|[^\s/]*\.internal)(?::\d+)?[^\s'"`）)，,。]*/gi;

export function guardReply(text, options = {}) {
  const opts = {
    enabled: true,
    stripCodeBlocks: true,
    redactPaths: true,
    redactInternalUrls: true,
    blockedWords: [],
    maxChars: 300,
    ...options
  };

  let out = String(text ?? '').trim();
  if (!out) return { ok: false, reason: '回复为空', text: '' };

  if (opts.enabled) {
    const blocked = (opts.blockedWords || []).filter((w) => w && out.includes(w));
    if (blocked.length) {
      return { ok: false, reason: `命中禁用词：${blocked.join('、')}`, text: '' };
    }

    if (opts.stripCodeBlocks) {
      // 先删成对的围栏，再删未闭合的（模型常把结尾围栏吃掉）
      out = out.replace(CODE_FENCE, '');
      out = out.replace(/```[\s\S]*$/g, '');
      out = out.replace(INLINE_CODE, '');
    }
    if (opts.redactPaths) {
      out = out.replace(ABS_PATH, '[路径]');
    }
    if (opts.redactInternalUrls) {
      out = out.replace(INTERNAL_URL, '[链接]');
    }

    // 清理替换后的残渣
    out = out
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[\s,，。;；:：]+|[\s,，;；:：]+$/g, '')
      .trim();

    if (!out) {
      return { ok: false, reason: '清理后无有效内容（原文可能全是代码或路径）', text: '' };
    }
  }

  const max = Math.max(20, Number(opts.maxChars) || 300);
  let truncated = false;
  if (out.length > max) {
    out = out.slice(0, max - 1).trimEnd() + '…';
    truncated = true;
  }

  return { ok: true, text: out, truncated };
}
