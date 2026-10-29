import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * headless 生成器：调用 `dsh --profile <profile> --session-id <fixed>`，
 * prompt 走 stdin，答复走 stdout。会话固定 ⇒ 上下文连续。
 *
 * 这是当前**唯一可验证**的生成通道（CLI 契约已确认）。
 */

/**
 * 找 dsh 可执行文件。
 *
 * 踩过的坑：Electron 宿主的 PATH 里**没有** `dsh`（它不是 brew/npm 全局安装），
 * 早先的实现把裸 `dsh` 放在绝对路径前面并直接返回，于是 spawn 报 `ENOENT`
 * —— 所有生成都失败，看起来就像"插件不起作用"。
 * 现在：先按「显式配置 → 环境变量 → 应用包内 CLI → PATH」的顺序找真实存在的文件。
 */
const APP_CLI_RELATIVE = path.join('..', 'Resources', 'runtime', 'cli', 'bin', 'dsh');

function appBundleCli() {
  // process.execPath 形如 /Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness
  try {
    return path.resolve(path.dirname(process.execPath), APP_CLI_RELATIVE);
  } catch {
    return '';
  }
}

export function dshCandidates() {
  return [
    process.env.DSH_CLI || '',
    appBundleCli(),
    '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh',
    '/opt/homebrew/bin/dsh',
    '/usr/local/bin/dsh'
  ].filter(Boolean);
}

export function resolveDshPath(configured = '') {
  // 用户显式配置优先，原样返回（即使不存在，也要让错误信息指向他填的路径）
  if (configured) return configured;
  for (const candidate of dshCandidates()) {
    try {
      if (candidate !== 'dsh' && fs.statSync(candidate).isFile()) return candidate;
    } catch { /* 继续下一个 */ }
  }
  return 'dsh'; // 最后交给 PATH 兜底
}

/** 生成阶段失败时，把"找过哪些路径"带进错误里，省得下次再猜。 */
function dshHint(cli) {
  return `（解析到的 dsh：${cli || '未找到'}；可在插件配置里填写 dshCliPath）`;
}

export function buildPrompt({
  contact, messages, persona,
  format = 'markdown',
  attachments = false,
  attachmentMaxCount = 2,
  renderImages = false,
  renderMaxRows = 10
}) {
  const lines = messages.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
  return [
    `你正在替我（账号本人）回复钉钉私聊。对方是「${contact.name}」。`,
    ``,
    `对方刚发来的消息（共 ${messages.length} 条，按时间顺序）：`,
    lines,
    ``,
    `请生成一条可以直接发给对方的回复。要求：`,
    `- 以第一人称口吻，${persona || '语气自然、简洁，像本人在手机上随手回复'}`,
    `- 只输出回复正文：不要解释思路，不要加引号，不要写"回复："前缀`,
    `- 不要在回复里粘贴代码、文件路径或内部链接`,
    ``,
    format === 'text'
      ? [
          `排版要求（纯文本，靠换行和符号排版，不要写 Markdown）：`,
          `- 第一行先给一句结论，不超过 30 字。`,
          `- 下面用 2~4 条要点，每条单独一行，以「• 」开头，每条不超过 50 字。`,
          `- 需要提醒的地方单独一行，以「注意：」开头。`,
          `- 用真实换行分段，不要写成一整段话；不要用 #、**、表格、代码块、分隔线。`
        ].join('\n')
      : [
          `排版要求（钉钉会渲染 Markdown，请直接写规范 Markdown）：`,
          `- 第一行先给一句结论，不超过 30 字。`,
          `- 用小标题分组（最多两级，用 ### 开头，标题不超过 12 字）。`,
          `- 要点用「- 」列表，每条不超过 50 字；数字、接口名、表名用 **加粗** 突出。`,
          `- 需要提醒的地方单独一行，以「注意：」开头。`,
          `- 不要写表格（钉钉不渲染表格语法）；不要写代码围栏和分隔线。`
        ].join('\n'),
    ``,
    `重要约束（做不到会被当成故障）：`,
    `- 先在工作区里找资料：文档、SQL、导出清单、代码都能读（用 glob / grep / read 工具）。`,
    `  「我查一下」不算回答完成——必须自己把资料翻出来，再写结论。`,
    `- 不要搜钉钉聊天记录、不要调用 dws 命令（当前运行环境没有这个权限），也不要说「一会儿发你」。`,
    `- 讲究效率：优先看最相关的 3~5 个文件，工具调用控制在 15 次以内，尽快给结论。`,
    `- 你只有这一次回复机会，发出去这一轮就结束了，之后没有人会替你补发。`,
    `- 因此**禁止**出现「我查一下」「稍后/回头/一会儿发你」「确认好回你」这类承诺：`,
    `  能查到就在这一条里直接答完；查不到就如实说「我这边没查到」，不要许诺后续跟进。`,
    `- 不要编造事实、数字、合同号或人名；不确定就说不确定。`,
    `- 同一个命令/查询失败两次就不要继续重试，基于已有信息作答或如实说明。`,
    `- 当前是只读环境：只能读资料，不能改文件。`,
    ...(renderImages
      ? [
          ``,
          `配图（可选）：先判断对方要的是什么，再决定给不给图。`,
          `- 要「明细 / 清单 / 多列信息」→ 用 table，不要画图；`,
          `- 要「对比 / 谁多谁少 / 占比 / 分布 / 变化」→ 用 bar（横向柱状图），正文用一句话点出结论；`,
          `- 要「先后顺序 / 状态流转」→ 用 flow；`,
          `- 要「并列或有序的几个步骤」→ 用 steps；`,
          `- 说清这件事需要一大段文字、而图明显更直观才画；单一结论、一两句解释、概念定义、寒暄 → 不画；`,
          `- 每条回复最多一张图；数据项少于 2 项不画柱状图；表格/流程/步骤少于 3 行不画。`,
          ``,
          `表格：`,
          `[[render:table|标题]]`,
          `列1 | 列2`,
          `值 | 值`,
          `[[/render]]`,
          `柱状图（对比用，值是数字，不要带单位）：`,
          `[[render:bar|标题]]`,
          `标签 | 1399`,
          `标签 | 1344`,
          `[[/render]]`,
          `流程图：`,
          `[[render:flow|标题]]`,
          `节点 | 一句话说明`,
          `节点 | 一句话说明`,
          `[[/render]]`,
          `步骤图：`,
          `[[render:steps|标题]]`,
          `步骤名 | 一句话说明`,
          `[[/render]]`,
          ``,
          `- 最多 ${renderMaxRows} 行/节点；表格最多 3 列；标题不超过 18 字；单元格不超过 24 字；`,
          `- 正文仍要能独立读（图只是补充，不要把正文写空）；不确定就不画，只发文字。`
        ]
      : []),
    ...(attachments
      ? [
          ``,
          `附件（可选）：答案需要附上工作区里**已有的文件**（图片、PDF、Word/Excel、CSV、Markdown、压缩包）时，`,
          `在正文**最末单独一行**写：`,
          `[[attach:相对工作区的路径.pdf]]`,
          `- 最多 ${attachmentMaxCount} 个；大小有限制；`,
          `- 只能引用工作区里已经存在的文件；`,
          `- 路径不要写进正文其它地方；没有合适的文件就不要写这个指令。`
        ]
      : []),
    `- 如果不需要回复，只输出一个英文单词：SKIP`
  ].join('\n');
}

/** 解析 `--json` 模式的 newline-delimited 事件，取出会话 id 与最终文本。 */
export function parseJsonRun(stdout) {
  let sessionId = '';
  let text = '';
  let failure = '';
  for (const line of String(stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue; // 非 JSON 行直接忽略（stderr 混入/进度输出）
    }
    if (!event || typeof event !== 'object') continue;
    if (event.type === 'session' && typeof event.sessionId === 'string') sessionId = event.sessionId;
    else if (event.type === 'final' && typeof event.text === 'string') text = event.text;
    else if (event.type === 'error' && typeof event.message === 'string') failure = event.message;
    else if (event.type === 'status' && event.phase === 'turn_end') {
      // 模型/凭据错误也是「正常退出 + 空 final」，真实原因在这里
      const reason = event.reason;
      const message = reason && typeof reason === 'object' ? reason.error?.message : '';
      if (reason && reason.kind === 'error' && typeof message === 'string' && message !== '') failure = message;
    }
  }
  return { sessionId, text, failure };
}

/**
 * 本次生成要用的模型（通过 `--patch` 临时覆盖 agent-default-model）。
 * `--patch` 是启动器级参数：`dsh --profile headless --patch <file> --json --`，
 * 只影响这一次子进程，不动 profile 里的持久配置。
 */
export function buildModelOverlay({ provider, model, reasoningEffort } = {}) {
  if (!provider || !model) return '';
  const lines = [
    '# generated by dsh-dingtalk-self: 本次生成使用的模型',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${JSON.stringify(provider)}`,
    `    model: ${JSON.stringify(model)}`
  ];
  if (reasoningEffort) lines.push(`    reasoningEffort: ${JSON.stringify(reasoningEffort)}`);
  return `${lines.join('\n')}\n`;
}

export function createHeadlessAgent({
  dshPath,
  profile = 'headless',
  timeoutSeconds = 120,
  cwd = '',
  persona = '',
  model = null,
  readOnly = true,
  credentialEnv = null,
  replyFormat = 'markdown',
  attachments = false,
  attachmentMaxCount = 2,
  renderImages = false,
  renderMaxRows = 10
} = {}) {
  const cli = resolveDshPath(dshPath);

  /** 每次生成临时写一个 patch 文件，跑完删掉（0600）。 */
  function writeOverlay() {
    const text = buildModelOverlay(model || {});
    if (text === '') return '';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-model-'));
    const file = path.join(dir, 'model.yml');
    fs.writeFileSync(file, text, { mode: 0o600 });
    return file;
  }

  function cleanupOverlay(file) {
    if (!file) return;
    try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* ignore */ }
  }

  function childEnv() {
    // 环境变量优先：凭据文件只补缺，不覆盖用户自己 export 的值
    const env = { ...process.env };
    for (const [key, value] of Object.entries(credentialEnv || {})) {
      if (env[key] === undefined) env[key] = value;
    }
    // headless profile 的 sandbox-policy 配置就是 process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
    if (readOnly !== false) env.DSH_PERMISSION_MODE = 'read-only';
    return env;
  }

  function runOnce({ args, prompt, workdir, env }) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(cli, args, { cwd: workdir, env, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) {
        return resolve({ ok: false, error: `无法启动 dsh：${err.message}${dshHint(cli)}` });
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 3000);
        done({ ok: false, error: `生成超时（${timeoutSeconds}s）` });
      }, Math.max(10, timeoutSeconds) * 1000);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => done({ ok: false, error: `dsh 进程错误：${err.message}${dshHint(cli)}` }));
      child.on('close', (code) => {
        if (code !== 0) {
          return done({ ok: false, code, error: `dsh 退出码 ${code}：${stderr.trim().slice(0, 600)}`, stdout, stderr });
        }
        done({ ok: true, stdout, stderr });
      });

      try {
        child.stdin.write(prompt);
        child.stdin.end();
      } catch (err) {
        done({ ok: false, error: `写入 prompt 失败：${err.message}` });
      }
    });
  }

  return {
    kind: 'headless',
    /**
     * 生成回复。
     *
     * 关键契约（都对真实 CLI 验证过）：
     *   - `--session-id` 只能接管**已存在**的会话；新建会话要省略它，并用 `--json` 从首行
     *     `session` 事件里取回新 id；
     *   - 模型用 `--patch` 临时覆盖 `agent-default-model`，不污染 profile；
     *   - 只读靠 `DSH_PERMISSION_MODE=read-only`（headless profile 的 sandbox-policy 就吃这个变量）；
     *   - headless 里 credentials/authorization 被禁用，凭据只能走子进程环境变量。
     */
    async generate({ contact, messages, sessionId }) {
      const prompt = buildPrompt({
        contact, messages, persona,
        format: replyFormat,
        attachments,
        attachmentMaxCount,
        renderImages,
        renderMaxRows
      });
      const workdir = cwd && fs.existsSync(cwd) ? cwd : process.cwd();
      const env = childEnv();
      const overlay = writeOverlay();
      const launch = [...(overlay ? ['--patch', overlay] : []), ];

      try {
        if (sessionId) {
          const resumed = await runOnce({
            args: ['--profile', profile, ...launch, '--session-id', sessionId, '--'],
            prompt,
            workdir,
            env
          });
          if (resumed.ok) {
            const text = String(resumed.stdout || '').trim();
            if (text === '') {
              // 非 --json 模式下，模型错误只落在 stderr（退出码仍是 0）；空输出不能当成「无需回复」
              const reason = String(resumed.stderr || '').trim().replace(/^dsh:\s*/, '');
              return { ok: false, error: `dsh 没有输出回复${reason ? `：${reason.slice(0, 400)}` : '（stderr 也为空）'}` };
            }
            return { ok: true, reply: text, sessionId };
          }
          // 会话不可接管：退回"新建会话"，不要把一次生成彻底失败掉
          if (!/does not exist|not found|does not match|cannot be adopted|does not compose/i.test(String(resumed.error || ''))) {
            return resumed;
          }
        }

        const created = await runOnce({
          args: ['--profile', profile, ...launch, '--json', '--'],
          prompt,
          workdir,
          env
        });
        const parsed = parseJsonRun(created.stdout);
        if (parsed.failure) return { ok: false, error: `dsh 生成失败：${parsed.failure}` };
        if (!created.ok) return created;
        if (parsed.text.trim() === '') {
          return { ok: false, error: 'dsh 没有返回任何文本（模型没有产出；常见原因是 headless 子进程没有可用的模型凭据）' };
        }
        return { ok: true, reply: parsed.text.trim(), sessionId: parsed.sessionId || '' };
      } finally {
        cleanupOverlay(overlay);
      }
    },

    describe() {
      const target = model && model.provider ? `${model.provider}/${model.model}` : 'profile 默认模型';
      return `headless(profile=${profile}, model=${target}, readOnly=${readOnly !== false}, cli=${cli})`;
    }
  };
}

export function resolveWorkspacePathHint(workspaceId) {
  // 工作区路径由宿主侧解析；拿不到时给出提示而不是瞎猜
  return path.join('<未知工作区>', String(workspaceId || ''));
}
