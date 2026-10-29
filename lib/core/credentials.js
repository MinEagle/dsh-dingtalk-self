/**
 * 从 DSH 的 `$DSH_HOME/.credentials.yaml` 里取出「形状像环境变量」的凭据键值。
 *
 * 为什么需要它：headless 子进程里 `credentials` / `authorization` 两个插件是被禁用的
 * （见 dsh-headless 的 bundle patch），官方注释写明「one-shot jobs use launch-time
 * credentials instead of the interactive store」——也就是只能吃启动时的环境变量。
 * 而桌面版的 API Key 存在 .credentials.yaml 的 refs 段里，子进程看不到，
 * 于是生成阶段报 MISSING_CREDENTIAL。这里把 refs 里的 KEY: VALUE 解析出来，
 * 在 spawn 时作为子进程环境变量注入（只在内存里转发，不落盘、不打日志）。
 */

import fs from 'node:fs';

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** 解析 refs 段：只收单行、非引号块的条目，记录（records）一律跳过。 */
export function parseCredentialRefs(text) {
  const out = {};
  let inRefs = false;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      // 顶层键：只有 refs: 之后的行才可能是凭据
      inRefs = /^refs:\s*$/.test(line.trim());
      continue;
    }
    if (!inRefs) continue;

    const match = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (!ENV_NAME.test(key)) continue;
    if (value === '' || value === '|' || value === '>' || value === '[]' || value === '{}') continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === '') continue;
    out[key] = value;
  }
  return out;
}

/**
 * 读文件并缓存（按 mtime）。任何失败都返回空对象：凭据读不到不该让插件挂载失败。
 * @param {string} file
 * @param {{ at?: number, value?: Record<string, string> }} cache
 */
export function readCredentialEnv(file, cache = {}) {
  try {
    const stat = fs.statSync(file);
    if (cache.at === stat.mtimeMs && cache.value) return cache.value;
    const env = parseCredentialRefs(fs.readFileSync(file, 'utf8'));
    cache.at = stat.mtimeMs;
    cache.value = env;
    return env;
  } catch {
    return {};
  }
}
