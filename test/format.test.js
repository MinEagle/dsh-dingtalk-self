import test from 'node:test';
import assert from 'node:assert/strict';

import { formatForChat, formatForMarkdown, breakLongParagraph } from '../lib/core/format.js';

test('去掉 Markdown 记号但保留结构', () => {
  const src = '## 结论\n**可以**，但有三处限制：\n- 只支持保养合同\n- 号段是 SH-\n1) 甲方要素\n2) 传输组织\n---\n结束';
  const out = formatForChat(src);
  assert.equal(out, '结论\n可以，但有三处限制：\n• 只支持保养合同\n• 号段是 SH-\n1. 甲方要素\n2. 传输组织\n\n结束');
});

test('保留换行、压缩多余空行、去行尾空格', () => {
  const out = formatForChat('第一行   \n\n\n\n第二行\n');
  assert.equal(out, '第一行\n\n第二行');
});

test('已经干净的纯文本基本不变', () => {
  const src = '结论：只有保养合同\n• 自保养\n• 三方保养\n注意：菱伴不走这个切换';
  assert.equal(formatForChat(src), src);
});

test('空输入返回空串，CRLF 归一', () => {
  assert.equal(formatForChat(''), '');
  assert.equal(formatForChat(undefined), '');
  assert.equal(formatForChat('a\r\nb'), 'a\nb');
});

test('长段落无换行时按句折行', () => {
  const text = '这是第一句话说明背景。这是第二句话解释原因。这是第三句话给出结论。这是第四句话补充限制。';
  const out = breakLongParagraph(text, { maxLineChars: 25 });
  assert.ok(out.includes('\n'), '应当折行');
  assert.equal(out.replace(/\n/g, ''), text, '折行不能丢字');
});

test('已有换行或很短时不做折行', () => {
  assert.equal(breakLongParagraph('a\nb'), 'a\nb');
  assert.equal(breakLongParagraph('短句。'), '短句。');
});

test('formatForMarkdown：保留记号、统一标题与列表、压缩空行', () => {
  const out = formatForMarkdown('## 结论\n**可以**\n* 一条\n+ 二条\n1) 第一条\n\n\n\n### 注意');
  assert.equal(out, '### 结论\n**可以**\n- 一条\n- 二条\n1. 第一条\n\n### 注意');
});

test('formatForMarkdown：空输入与 CRLF', () => {
  assert.equal(formatForMarkdown(''), '');
  assert.equal(formatForMarkdown(undefined), '');
  assert.equal(formatForMarkdown('a\r\n- b'), 'a\n- b');
});
