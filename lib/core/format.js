/**
 * 把模型的输出整理成「适合在钉钉里读」的纯文本。
 *
 * 钉钉这边我们发的是纯文本（`chat message send --content`），Markdown 不会渲染，
 * 所以 `**粗体**`、`## 标题` 会原样显示成符号。这里做两件事：
 *   1. 去掉/替换 Markdown 记号，换成纯文本也好看的写法；
 *   2. 保留换行与列表结构，让长回答分段而不是糊成一大段。
 *
 * 注意：这里只做格式，不负责安全 —— 代码块、路径、内网地址仍由 guard 先处理。
 */

const HEADING = /^[ \t]*#{1,6}[ \t]+/gm;
const BOLD = /\*\*([^*\n]+)\*\*/g;
const UNDERSCORE_BOLD = /__([^_\n]+)__/g;
const STRIKE = /~~([^~\n]+)~~/g;
const BULLET = /^[ \t]*[-*+•·][ \t]+/gm;
const ORDERED = /^[ \t]*(\d+)[.)][ \t]+/gm;
const HR = /^[ \t]*([-*_])\1{2,}[ \t]*$/gm;
const TRAILING_SPACE = /[ \t]+$/gm;

export function formatForChat(text) {
  let out = String(text ?? '').replace(/\r\n?/g, '\n');
  if (out.trim() === '') return '';

  out = out
    .replace(HEADING, '')          // "## 标题" → "标题"
    .replace(BOLD, '$1')           // **x** → x
    .replace(UNDERSCORE_BOLD, '$1')
    .replace(STRIKE, '$1')
    .replace(HR, '')               // 分隔线整行去掉
    .replace(BULLET, '• ')         // 统一列表符号（钉钉里 • 比 - 好看）
    .replace(ORDERED, '$1. ')      // 1) → 1.
    .replace(TRAILING_SPACE, '')
    .replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Markdown 模式：钉钉这条链路支持 Markdown，所以**不要**去掉记号，
 * 只做归一化，让渲染稳定：
 *   - 标题统一成三级（钉钉里 ### 最稳，太深的层级不一定渲染）
 *   - 列表符号统一成 "- "（`*`/`•` 混用容易有渲染差异）
 *   - 有序列表 1) → 1.
 *   - 压缩多余空行、去行尾空格
 * 表格不在这里处理：钉钉的 Markdown 不支持表格语法，提示词里已禁止模型输出表格。
 */
const MD_HEADING = /^[ \t]*#{1,6}[ \t]+/gm;
const MD_BULLET = /^[ \t]*[*+•·][ \t]+/gm;
const MD_ORDERED = /^[ \t]*(\d+)[.)][ \t]+/gm;

export function formatForMarkdown(text) {
  let out = String(text ?? '').replace(/\r\n?/g, '\n');
  if (out.trim() === '') return '';
  out = out
    .replace(MD_HEADING, '### ')
    .replace(MD_BULLET, '- ')
    .replace(MD_ORDERED, '$1. ')
    .replace(TRAILING_SPACE, '')
    .replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/**
 * 兜底：模型仍然写成长段落时，在中文句号后折行，避免一整块文字。
 * 只在「没有换行且很长」时启用，避免破坏正常排版。
 */
export function breakLongParagraph(text, { maxLineChars = 90 } = {}) {
  const out = String(text ?? '');
  if (out.includes('\n')) return out;
  if (out.length <= maxLineChars) return out;

  const sentences = out.split(/(?<=[。！？；])/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return out;

  const lines = [];
  let current = '';
  for (const sentence of sentences) {
    if (current === '') {
      current = sentence;
    } else if ((current + sentence).length <= maxLineChars) {
      current += sentence;
    } else {
      lines.push(current);
      current = sentence;
    }
  }
  if (current !== '') lines.push(current);
  return lines.join('\n');
}
