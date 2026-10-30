/**
 * headless 生成器的进程层测试：不碰真实 dsh，用一个假 CLI 验证 spawn / stdin / stdout / 错误提示。
 * 起因：宿主进程的 PATH 里没有 dsh，早先解析逻辑返回裸 `dsh` 导致 spawn ENOENT，
 * 所有生成都失败（用户看到的就是「插件没反应」）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createHeadlessAgent, resolveDshPath, dshCandidates, buildPrompt } from '../lib/agents/headless.js';

function fakeCli(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-cli-'));
  const file = path.join(dir, 'dsh');
  fs.writeFileSync(file, script, { mode: 0o755 });
  return file;
}

const contact = { name: '张三', openDingTalkId: 'OD1', workspaceId: 'ws1' };
const messages = [{ messageId: 'm1', text: '这个月费用多少？', createTime: Date.now() }];

test('续已有会话：走 --session-id，stdout 原样作为回复', async () => {
  const cli = fakeCli('#!/bin/sh\ncat >/dev/null\necho "收到，我查一下"\n');
  const agent = createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20 });
  const res = await agent.generate({ contact, messages, sessionId: 'session-abc' });
  assert.equal(res.ok, true);
  assert.equal(res.reply, '收到，我查一下');
  assert.equal(res.sessionId, 'session-abc');
});

test('首次生成：走 --json，从 session 事件里拿到新会话 id 并从 final 事件取回复', async () => {
  const cli = fakeCli(
    '#!/bin/sh\ncat >/dev/null\n' +
    'echo \'{"type":"status","phase":"turn_start","turn":1}\'\n' +
    'echo \'{"type":"text","text":"部分"}\'\n' +
    'echo \'{"type":"session","sessionId":"session-xyz","cwd":"/tmp"}\'\n' +
    'echo \'{"type":"final","text":"好的，我查到了"}\'\n'
  );
  const agent = createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20 });
  const res = await agent.generate({ contact, messages, sessionId: '' });
  assert.equal(res.ok, true);
  assert.equal(res.reply, '好的，我查到了');
  assert.equal(res.sessionId, 'session-xyz');
});

test('续会话失败（会话不存在）时自动退回新建会话', async () => {
  const cli = fakeCli(
    '#!/bin/sh\n' +
    'cat >/dev/null\n' +
    'case " $* " in *" --session-id "*) echo "dsh: session \"session-gone\" does not exist; omit --session-id to start a new Session" >&2; exit 1;; esac\n' +
    'echo \'{"type":"session","sessionId":"session-new","cwd":"/tmp"}\'\n' +
    'echo \'{"type":"final","text":"新会话的回复"}\'\n'
  );
  const agent = createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20 });
  const res = await agent.generate({ contact, messages, sessionId: 'session-gone' });
  assert.equal(res.ok, true);
  assert.equal(res.reply, '新会话的回复');
  assert.equal(res.sessionId, 'session-new');
});

test('CLI 不存在时返回可诊断的错误（带解析路径与修改建议）', async () => {
  const agent = createHeadlessAgent({ dshPath: '/definitely/not/here/dsh', timeoutSeconds: 10 });
  const res = await agent.generate({ contact, messages, sessionId: 's1' });
  assert.equal(res.ok, false);
  assert.match(res.error, /dsh/);
  assert.match(res.error, /dshCliPath|not found|ENOENT/);
});

test('非零退出码带 stderr，超时也能收敛', async () => {
  const failing = fakeCli('#!/bin/sh\necho "boom" >&2\nexit 3\n');
  const bad = await createHeadlessAgent({ dshPath: failing, timeoutSeconds: 10 }).generate({ contact, messages, sessionId: 'session-abc' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /退出码 3/);
  assert.match(bad.error, /boom/);

  const slow = fakeCli('#!/bin/sh\nsleep 2\necho "慢回复"\n');
  const started = Date.now();
  const timed = await createHeadlessAgent({ dshPath: slow, timeoutSeconds: 10 }).generate({ contact, messages, sessionId: 'session-s' });
  assert.equal(timed.ok, true, '10s 超时内应完成');
  assert.equal(timed.reply, '慢回复');
  assert.ok(Date.now() - started < 9000);
});

test('解析顺序：显式配置 > 存在的绝对路径 > 裸 dsh 兜底', () => {
  assert.equal(resolveDshPath('/explicit/dsh'), '/explicit/dsh');
  const auto = resolveDshPath('');
  assert.equal(typeof auto, 'string');
  if (auto !== 'dsh') {
    assert.ok(auto.startsWith('/'), '自动解析必须是绝对路径，不能是裸 dsh');
    assert.ok(dshCandidates().includes(auto));
    assert.ok(fs.existsSync(auto), '解析出来的路径必须真实存在');
  }
});

test('prompt 带上对方姓名、消息与 persona', () => {
  const prompt = buildPrompt({ contact, messages, persona: '像本人在手机上随手回' });
  assert.match(prompt, /张三/);
  assert.match(prompt, /这个月费用多少/);
  assert.match(prompt, /像本人在手机上随手回/);
  assert.match(prompt, /SKIP/);
  assert.match(prompt, /禁止/);
  assert.match(prompt, /查不到/);
  assert.match(prompt, /只有这一次回复机会/);
});

test('模型/凭据错误：从 turn_end 的 reason 里取出真实原因，而不是「没有返回文本」', async () => {
  const cli = fakeCli(
    '#!/bin/sh\ncat >/dev/null\n' +
    'echo \'{"type":"session","sessionId":"session-x","cwd":"/tmp"}\'\n' +
    'echo \'{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"error","error":{"message":"llm-deepseek: no API key for provider route"}}}\'\n' +
    'echo \'{"type":"final","text":""}\'\n'
  );
  const res = await createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20 }).generate({ contact, messages, sessionId: '' });
  assert.equal(res.ok, false);
  assert.match(res.error, /no API key/);
});

test('续会话时输出为空（模型错误只在 stderr）要当成失败，而不是「无需回复」', async () => {
  const cli = fakeCli('#!/bin/sh\ncat >/dev/null\necho "dsh: MISSING_CREDENTIAL: boom" >&2\nexit 0\n');
  const res = await createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20 }).generate({ contact, messages, sessionId: 'session-x' });
  assert.equal(res.ok, false);
  assert.match(res.error, /MISSING_CREDENTIAL/);
});

test('只读：子进程环境注入 DSH_PERMISSION_MODE=read-only，且带上凭据', async () => {
  const cli = fakeCli('#!/bin/sh\ncat >/dev/null\necho "mode=$DSH_PERMISSION_MODE key=$DEEPSEEK_API_KEY"\n');
  const agent = createHeadlessAgent({
    dshPath: cli,
    timeoutSeconds: 20,
    readOnly: true,
    credentialEnv: { DEEPSEEK_API_KEY: 'sk-test' }
  });
  const res = await agent.generate({ contact, messages, sessionId: 'session-a' });
  assert.equal(res.ok, true);
  assert.equal(res.reply, 'mode=read-only key=sk-test');
});

test('关掉只读时不注入 DSH_PERMISSION_MODE', async () => {
  const cli = fakeCli('#!/bin/sh\ncat >/dev/null\necho "mode=${DSH_PERMISSION_MODE:-unset}"\n');
  const agent = createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20, readOnly: false });
  const res = await agent.generate({ contact, messages, sessionId: 'session-a' });
  assert.equal(res.ok, true);
  assert.equal(res.reply, 'mode=unset');
});

test('指定模型时用 --patch 传临时 overlay，跑完删掉', async () => {
  const cli = fakeCli('#!/bin/sh\ncat >/dev/null\necho "args:$*"\n');
  const agent = createHeadlessAgent({
    dshPath: cli,
    timeoutSeconds: 20,
    model: { provider: 'magpie', model: 'opendesign/deepseek-v4.1-flash', reasoningEffort: 'max' }
  });
  const res = await agent.generate({ contact, messages, sessionId: 'session-a' });
  assert.equal(res.ok, true);
  assert.match(res.reply, /--patch \/var\/folders|--patch \/tmp/);
  const overlay = res.reply.split('--patch ')[1].split(' ')[0];
  assert.ok(overlay.endsWith('model.yml'), `overlay 路径应指向临时 patch：${overlay}`);
  assert.equal(fs.existsSync(overlay), false, '跑完必须清理临时 overlay');
});

test('不指定模型时不传 --patch', async () => {
  const cli = fakeCli('#!/bin/sh\ncat >/dev/null\necho "args:$*"\n');
  const agent = createHeadlessAgent({ dshPath: cli, timeoutSeconds: 20 });
  const res = await agent.generate({ contact, messages, sessionId: 'session-a' });
  assert.equal(res.ok, true);
  assert.doesNotMatch(res.reply, /--patch/);
});

test('附件开关打开时提示词里带 [[attach:]] 指令说明', async () => {
  const { buildPrompt } = await import('../lib/agents/headless.js');
  const on = buildPrompt({ contact, messages, persona: '', attachments: true, attachmentMaxCount: 2 });
  const off = buildPrompt({ contact, messages, persona: '', attachments: false });
  assert.match(on, /\[\[attach:/);
  assert.match(on, /最多 2 个/);
  assert.doesNotMatch(off, /\[\[attach:/);
});

test('开启配图时提示词里带渲染块语法', async () => {
  const { buildPrompt } = await import('../lib/agents/headless.js');
  const on = buildPrompt({ contact, messages, persona: '', renderImages: true, renderMaxRows: 6 });
  const off = buildPrompt({ contact, messages, persona: '', renderImages: false });
  assert.match(on, /\[\[render:table\|/);
  assert.match(on, /\[\[render:bar\|/);
  assert.match(on, /\[\[render:flow\|/);
  assert.match(on, /对比/);
  assert.match(on, /\[\[\/render\]\]/);
  assert.match(on, /最多 6 行/);
  assert.doesNotMatch(off, /\[\[render:/);
});

test('会话标题带对方名字，并压在首行', async () => {
  const { buildSessionTitle, buildPrompt } = await import('../lib/agents/headless.js');
  const contact = { name: '赵迎凯' };
  const messages = [{ text: '保养合同从 APP 提交签名到最终签收，经过哪些状态？' }];
  const title = buildSessionTitle(contact, messages);
  assert.equal(title, '【钉钉代答·赵迎凯】保养合同从 APP 提交签名到最终签收，经过哪些状态？');
  // 标题必须就是提示词的第一行（fallback 会按字节截断到这里）
  const prompt = buildPrompt({ contact, messages, persona: '' });
  assert.equal(prompt.split('\n')[0], title);
});

test('会话标题：多条消息加角标，超长截断', async () => {
  const { buildSessionTitle } = await import('../lib/agents/headless.js');
  assert.equal(
    buildSessionTitle({ name: '曹坤' }, [{ text: '在吗' }, { text: '接口干嘛的' }]),
    '【钉钉代答·曹坤】在吗（+1 条）'
  );
  const long = buildSessionTitle({ name: '张三' }, [{ text: '一'.repeat(80) }]);
  assert.ok(long.length <= 40, `标题不该太长：${long.length}`);
  assert.match(long, /…$/);
});

test('overlay 关掉标题模型并按首行字节数精确截断', async () => {
  const { buildModelOverlay } = await import('../lib/agents/headless.js');
  const yml = buildModelOverlay({ provider: 'magpie', model: 'm', titleBytes: 100 });
  assert.match(yml, /- id: session-title-llm\n  disabled: true/);
  assert.match(yml, /fallbackMaxBytes: 100/);
  assert.match(yml, /provider: "magpie"/);
  // 没给 titleBytes 时不应出现标题补丁
  const plain = buildModelOverlay({ provider: 'magpie', model: 'm' });
  assert.doesNotMatch(plain, /session-title-llm/);
});
