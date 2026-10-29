import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { extractAttachments, resolveAttachments, isAllowedExt } from '../lib/core/attachments.js';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-attach-'));
}

test('抽出 [[attach:...]] 指令并从正文里去掉', () => {
  const out = extractAttachments('结论第一行\n- 要点\n\n[[attach:docs/arch.png]]\n[[attach:/tmp/x/report.pdf]]\n');
  assert.equal(out.requests.length, 2);
  assert.deepEqual(out.requests, ['docs/arch.png', '/tmp/x/report.pdf']);
  assert.equal(out.text, '结论第一行\n- 要点');
});

test('没有指令时正文原样返回', () => {
  const out = extractAttachments('就是一段普通回复');
  assert.deepEqual(out.requests, []);
  assert.equal(out.text, '就是一段普通回复');
});

test('扩展名白名单：图片与常见文档放行，脚本类拒绝', () => {
  for (const ok of ['/a/b.png', '/a/b.PDF', '/a/b.docx', '/a/b.xlsx', '/a/b.csv', '/a/b.md', '/a/b.txt', '/a/b.zip']) {
    assert.equal(isAllowedExt(ok), true, `${ok} 应放行`);
  }
  for (const bad of ['/a/b.svg', '/a/b.sh', '/a/b.exe', '/a/b.html', '/a/b.js']) {
    assert.equal(isAllowedExt(bad), false, `${bad} 应拒绝`);
  }
});

test('resolveAttachments：只收白名单目录内、大小合规的文件', () => {
  const root = tmpdir();
  const sub = path.join(root, 'docs');
  fs.mkdirSync(sub);
  const ok = path.join(sub, 'arch.png');
  fs.writeFileSync(ok, 'x'.repeat(100));
  const tooBig = path.join(sub, 'big.png');
  fs.writeFileSync(tooBig, 'x'.repeat(2048));
  const outside = path.join(tmpdir(), 'evil.png');
  fs.writeFileSync(outside, 'x');

  const out = resolveAttachments(['docs/arch.png', 'docs/big.png', outside, 'docs/missing.png', '../escape.png'], {
    roots: [root],
    baseDir: root,
    maxCount: 2,
    maxBytes: 1024
  });
  assert.deepEqual(out.files.map((f) => f.name), ['arch.png']);
  const reasons = out.errors.map((e) => e.reason).join(' | ');
  assert.match(reasons, /文件过大/);
  assert.match(reasons, /不在允许的目录里/);
  assert.match(reasons, /文件不存在/);
});

test('resolveAttachments：数量上限与去重', () => {
  const root = tmpdir();
  for (const name of ['a.png', 'b.png', 'c.png']) fs.writeFileSync(path.join(root, name), 'x');
  const out = resolveAttachments(['a.png', 'a.png', 'b.png', 'c.png'], { roots: [root], baseDir: root, maxCount: 2, maxBytes: 1024 });
  assert.deepEqual(out.files.map((f) => f.name), ['a.png', 'b.png']);
  assert.ok(out.errors.some((e) => /超过上限/.test(e.reason)));
});
