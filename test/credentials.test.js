import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseCredentialRefs, readCredentialEnv } from '../lib/core/credentials.js';

const SAMPLE = `version: 1
refs:
  DEEPSEEK_API_KEY: test-key-deepseek
  MAGPIE_GATEWAY_KEY: "test-key-magpie"
  opencode_anon: 不应该被当成环境变量
  MULTI_LINE: |
    line1
    line2
  EMPTY: ''
records:
  WORKBUDDY_ACCOUNT_1:
    email: someone@example.com
`;

test('只取 refs 段里形如环境变量的单行键值', () => {
  const env = parseCredentialRefs(SAMPLE);
  assert.deepEqual(env, {
    DEEPSEEK_API_KEY: 'test-key-deepseek',
    MAGPIE_GATEWAY_KEY: 'test-key-magpie'
  });
});

test('records 段和多行块一律跳过', () => {
  const env = parseCredentialRefs(SAMPLE);
  assert.equal('WORKBUDDY_ACCOUNT_1' in env, false);
  assert.equal('MULTI_LINE' in env, false);
  assert.equal('EMPTY' in env, false);
});

test('坏文件/空文件不抛异常', () => {
  assert.deepEqual(parseCredentialRefs(''), {});
  assert.deepEqual(parseCredentialRefs(undefined), {});
  assert.deepEqual(parseCredentialRefs('refs:\n\tBROKEN\n'), {});
});

test('readCredentialEnv 按 mtime 缓存，文件变化后重新读', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshdt-cred-'));
  const file = path.join(dir, '.credentials.yaml');
  fs.writeFileSync(file, 'version: 1\nrefs:\n  A_KEY: one\n');
  const cache = {};
  assert.deepEqual(readCredentialEnv(file, cache), { A_KEY: 'one' });
  assert.deepEqual(readCredentialEnv(file, cache), { A_KEY: 'one' });

  const later = new Date(Date.now() + 5_000);
  fs.writeFileSync(file, 'version: 1\nrefs:\n  A_KEY: two\n  B_KEY: three\n');
  fs.utimesSync(file, later, later);
  assert.deepEqual(readCredentialEnv(file, cache), { A_KEY: 'two', B_KEY: 'three' });
});

test('文件不存在时返回空对象', () => {
  assert.deepEqual(readCredentialEnv('/definitely/not/here.yaml', {}), {});
});
