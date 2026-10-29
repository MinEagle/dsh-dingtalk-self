/**
 * 宿主内会话生成器（目标形态）：用 ctx.sessions 创建/复用会话，把消息作为
 * 用户输入投进去，取最终 assistant 文本。
 *
 * 现状：`sessions.create({ workspaceId, agentPreset })` 的签名已从宿主声明中确认；
 * 但「向会话注入一条用户消息并等待答复」的方法在不同 DSH 版本间名字不同，
 * 这里做**能力探测**，探测不到就抛出明确错误，让调用方降级到 headless，
 * 而不是静默失败。
 */

const PROMPT_METHODS = [
  ['prompt', (s) => s.prompt],
  ['send', (s) => s.send],
  ['submit', (s) => s.submit],
  ['enqueue', (s) => s.enqueue]
];

function findPromptable(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  for (const [label, get] of PROMPT_METHODS) {
    try {
      const fn = get(candidate);
      if (typeof fn === 'function') return { label, fn: fn.bind(candidate) };
    } catch { /* ignore */ }
  }
  return null;
}

export function createSessionAgent({ sessions, workspaceId, agentPreset, timeoutSeconds = 120, persona = '' }) {
  return {
    kind: 'session',

    probe() {
      if (!sessions || typeof sessions.create !== 'function') {
        return { ok: false, reason: '宿主没有暴露 sessions.create，无法在进程内驱动会话' };
      }
      return { ok: true };
    },

    async ensureSession({ contact, sessionId }) {
      if (sessionId) return sessionId;
      const request = { workspaceId };
      if (agentPreset) request.agentPreset = agentPreset;
      return await sessions.create(request);
    },

    async generate({ contact, messages, sessionId }) {
      const probe = this.probe();
      if (!probe.ok) return { ok: false, error: probe.reason };

      let sid;
      try {
        sid = await this.ensureSession({ contact, sessionId });
      } catch (err) {
        return { ok: false, error: `创建会话失败：${err.message}` };
      }

      let session;
      try {
        session = typeof sessions.get === 'function' ? sessions.get(sid) : undefined;
      } catch (err) {
        return { ok: false, error: `读取会话失败：${err.message}` };
      }

      const promptable = findPromptable(session);
      if (!promptable) {
        return {
          ok: false,
          error:
            `会话 ${sid} 已创建，但当前 DSH 版本的会话对象没有可用的 prompt/send/submit/enqueue 方法。` +
            `请先把 agent.kind 切到 "headless"，或报告宿主版本以便适配。`,
          sessionId: sid
        };
      }

      const lines = messages.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
      const prompt = [
        `你正在替我回复钉钉私聊。对方是「${contact.name}」。`,
        `对方刚发来的消息（${messages.length} 条，按时间顺序）：`,
        lines,
        ``,
        `只输出可以直接发出去的回复正文；${persona || '语气自然简洁'}；不要粘贴代码或路径；不需要回复时只输出 SKIP。`
      ].join('\n');

      try {
        const result = await Promise.race([
          promptable.fn(prompt),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`生成超时（${timeoutSeconds}s）`)), Math.max(10, timeoutSeconds) * 1000))
        ]);
        const reply = extractReply(result);
        if (reply === null) {
          return { ok: false, error: '会话返回了结果，但无法从中提取 assistant 文本', sessionId: sid };
        }
        return { ok: true, reply, sessionId: sid };
      } catch (err) {
        return { ok: false, error: `会话生成失败：${err.message}`, sessionId: sid };
      }
    },

    describe() {
      return `session(workspaceId=${workspaceId})`;
    }
  };
}

function extractReply(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return null;
  for (const key of ['text', 'reply', 'content', 'answer', 'message']) {
    if (typeof result[key] === 'string') return result[key];
  }
  if (Array.isArray(result.blocks)) {
    const texts = result.blocks.filter((b) => b && typeof b.text === 'string').map((b) => b.text);
    if (texts.length) return texts.join('\n');
  }
  return null;
}
