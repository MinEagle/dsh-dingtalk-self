/**
 * 回复里附带图片 / 文件的解析与校验。
 *
 * 模型在正文最末单独一行写指令：
 *   [[attach:docs/arch.png]]
 *   [[attach:/abs/path/chart.pdf]]
 *
 * 为什么用指令而不是让模型直接贴路径：正文会过出站护栏（绝对路径会被抹成 [路径]），
 * 所以附件路径必须先被抽取出来，正文里不出现路径；发送时再按白名单单独发。
 *
 * 安全边界：
 *   - 只允许图片与常见文档（pdf/docx/xlsx/csv/md/txt/zip）；
 *   - 必须落在允许的根目录里（工作区、插件数据目录、临时 outbox）；
 *   - 单文件大小与数量都受限。
 */

import fs from 'node:fs';
import path from 'node:path';

const DIRECTIVE = /^[ \t]*\[\[attach:[ \t]*([^\]\n]+?)[ \t]*\]\][ \t]*$/gim;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
// 工作区里常见、发出去对同事有用的文档类型
const DOC_EXT = new Set(['.pdf', '.docx', '.xlsx', '.csv', '.md', '.txt', '.zip']);

export function isAllowedExt(file) {
  const ext = path.extname(file).toLowerCase();
  return IMAGE_EXT.has(ext) || DOC_EXT.has(ext);
}

/** 从正文里抽出附件指令，返回 { text, requests }（text 已去掉指令行）。 */
export function extractAttachments(text) {
  const requests = [];
  const out = String(text ?? '').replace(DIRECTIVE, (_whole, rawPath) => {
    const value = String(rawPath || '').trim();
    if (value !== '') requests.push(value);
    return '';
  });
  return {
    text: out.replace(/\n{3,}/g, '\n\n').trim(),
    requests
  };
}

/**
 * 校验并解析成一个可发送的文件列表。
 * @param {string[]} requests 模型给出的路径（相对或绝对）
 * @param {object} options
 * @param {string[]} options.roots 允许的根目录
 * @param {string} options.baseDir 相对路径的基准目录（工作区）
 * @param {number} options.maxCount
 * @param {number} options.maxBytes
 * @returns {{ files: Array<{path:string,name:string,bytes:number}>, errors: Array<{request:string,reason:string}> }}
 */
export function resolveAttachments(requests, options = {}) {
  const roots = (options.roots || []).filter(Boolean).map((r) => path.resolve(r));
  const baseDir = options.baseDir ? path.resolve(options.baseDir) : '';
  const maxCount = Number.isFinite(options.maxCount) ? options.maxCount : 2;
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : 10 * 1024 * 1024;

  const files = [];
  const errors = [];
  const seen = new Set();

  for (const request of requests || []) {
    if (files.length >= maxCount) {
      errors.push({ request, reason: `超过上限（最多 ${maxCount} 个附件）` });
      continue;
    }
    const absolute = path.isAbsolute(request)
      ? path.resolve(request)
      : path.resolve(baseDir || '.', request);

    if (seen.has(absolute)) continue;
    seen.add(absolute);

    if (!isAllowedExt(absolute)) {
      errors.push({ request, reason: '只允许图片或 pdf/docx/xlsx/csv/md/txt/zip' });
      continue;
    }
    const inRoot = roots.some((root) => absolute === root || absolute.startsWith(root + path.sep));
    if (!inRoot) {
      errors.push({ request, reason: '不在允许的目录里' });
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      errors.push({ request, reason: '文件不存在' });
      continue;
    }
    if (!stat.isFile()) {
      errors.push({ request, reason: '不是文件' });
      continue;
    }
    if (stat.size > maxBytes) {
      errors.push({ request, reason: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB，上限 ${(maxBytes / 1024 / 1024).toFixed(0)}MB）` });
      continue;
    }
    files.push({ path: absolute, name: path.basename(absolute), bytes: stat.size });
  }

  return { files, errors };
}
