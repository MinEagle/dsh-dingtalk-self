import fs from 'node:fs';
import path from 'node:path';

const SEEN_TTL_MS = 7 * 24 * 3600 * 1000;
const AUDIT_KEEP = 500;

export function emptyState() {
  return {
    version: 1,
    cursors: {},
    seen: {},
    sessions: {},
    pending: {},
    confirm: {},
    sent: {},
    audit: [],
    stats: { drafts: 0, sent: 0, skipped: 0, blocked: 0, errors: 0 },
    updatedAt: null
  };
}

/**
 * 状态存储。
 *
 * 目录不可写时**降级为内存存储**，而不是让插件挂载失败：
 * 只读 home、沙箱、权限不对的环境都很常见，挂载失败会让轮询/护栏全部失效，
 * 比"重启后丢游标"严重得多。
 */
export function createStore(stateDir) {
  let degraded = false;
  let memory = null;
  let memoryPaused = false;

  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch {
    degraded = true;
  }

  const statePath = path.join(stateDir, 'state.json');
  const pausePath = path.join(stateDir, 'PAUSE');

  function load() {
    if (degraded) return memory ?? emptyState();
    if (!fs.existsSync(statePath)) return emptyState();
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return { ...emptyState(), ...parsed };
    } catch {
      const backup = `${statePath}.corrupt-${Date.now()}`;
      try { fs.renameSync(statePath, backup); } catch { /* ignore */ }
      return emptyState();
    }
  }

  function save(state) {
    state.updatedAt = new Date().toISOString();
    const seenCutoff = Date.now() - SEEN_TTL_MS;
    for (const [id, ts] of Object.entries(state.seen)) {
      if (typeof ts === 'number' && ts < seenCutoff) delete state.seen[id];
    }
    const hourCutoff = Date.now() - 2 * 3600 * 1000;
    for (const [key, list] of Object.entries(state.sent)) {
      state.sent[key] = (list || []).filter((t) => t >= hourCutoff);
    }
    if (state.audit.length > AUDIT_KEEP) state.audit = state.audit.slice(-AUDIT_KEEP);

    if (degraded) { memory = state; return state.updatedAt; }

    try {
      const tmp = `${statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, statePath);
    } catch {
      degraded = true;
      memory = state;
    }
    return state.updatedAt;
  }

  function audit(state, entry) {
    state.audit.push({ ts: new Date().toISOString(), ...entry });
  }

  function isPaused() {
    if (degraded) return memoryPaused;
    try { return fs.existsSync(pausePath); } catch { return memoryPaused; }
  }

  function setPaused(paused) {
    memoryPaused = paused === true;
    if (degraded) return;
    try {
      if (paused) fs.writeFileSync(pausePath, `paused at ${new Date().toISOString()}\n`);
      else if (fs.existsSync(pausePath)) fs.rmSync(pausePath);
    } catch {
      degraded = true;
    }
  }

  return {
    statePath,
    pausePath,
    load,
    save,
    audit,
    isPaused,
    setPaused,
    get degraded() { return degraded; }
  };
}
