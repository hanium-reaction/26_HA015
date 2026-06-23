#!/usr/bin/env node
// 프론트 단독 API 계약 체크: src/lib/api.ts 의 request() 호출(메서드+경로)을
// openapi.json(백엔드 정본)과 대조한다. 서버 없이 계약 어긋남을 잡는다.
//
// 출력 3분류:
//   OK   = api.ts 호출이 openapi 에 존재 (메서드까지 일치)
//   WARN = api.ts 에 있으나 openapi 에 없음 (아직 백엔드 미구현 stub 이거나 드리프트)
//   GONE = openapi 에 같은 경로가 있는데 메서드가 다름 (명백한 계약 위반) → 실패 사유
//   NEW  = openapi 에 있으나 api.ts 래퍼가 없음 (추가하면 좋은 신규 엔드포인트)
//
// 종료코드: GONE 가 1개라도 있으면 1, 아니면 0. (--strict 면 WARN 도 1)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const api = readFileSync(resolve(root, 'src/lib/api.ts'), 'utf8');
const openapi = JSON.parse(readFileSync(resolve(root, 'openapi.json'), 'utf8'));

// 경로 정규화: ${x} 또는 {x} → {} , 쿼리스트링 제거, 끝 슬래시 제거.
const norm = (p) =>
  p
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '') || '/';

// openapi: 정규화 경로 → Set(메서드)
const specByPath = new Map();
for (const [p, item] of Object.entries(openapi.paths ?? {})) {
  const methods = new Set(
    Object.keys(item).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).map((m) => m.toUpperCase()),
  );
  specByPath.set(norm(p), methods);
}

// api.ts 에서 request<...>(<path>, { method:'X' }) 추출.
// path 는 첫 인자(문자열/템플릿 리터럴). method 없으면 GET.
const calls = [];
const re = /request<[^>]*>\(\s*(`[^`]*`|'[^']*'|"[^"]*")\s*(,\s*\{([\s\S]*?)\})?\s*\)/g;
let m;
while ((m = re.exec(api))) {
  const rawPath = m[1].slice(1, -1); // 따옴표/백틱 제거
  const opts = m[3] ?? '';
  const methodMatch = opts.match(/method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/);
  const method = methodMatch ? methodMatch[1] : 'GET';
  calls.push({ method, path: norm(rawPath), raw: rawPath });
}

const usedKeys = new Set(calls.map((c) => `${c.method} ${c.path}`));
const ok = [];
const warn = [];
const gone = [];
for (const c of calls) {
  const methods = specByPath.get(c.path);
  if (methods && methods.has(c.method)) ok.push(c);
  else if (methods) gone.push(c); // 경로는 있는데 메서드 불일치
  else warn.push(c); // 경로 자체가 openapi 에 없음(미구현/드리프트)
}

const neu = [];
for (const [p, methods] of specByPath) {
  for (const mm of methods) {
    if (!usedKeys.has(`${mm} ${p}`)) neu.push(`${mm} ${p}`);
  }
}

const pad = (s, n) => s.padEnd(n);
console.log(`\n── API 계약 체크 (api.ts ↔ openapi.json) ──`);
console.log(`openapi 경로 ${specByPath.size}개 · api.ts 호출 ${calls.length}개\n`);
console.log(`✅ OK   ${ok.length}  (백엔드 구현됨, 메서드 일치)`);
console.log(`⚠️  WARN ${warn.length}  (api.ts 에 있으나 openapi 에 없음 — 미구현 stub/드리프트)`);
for (const c of warn) console.log(`     ${pad(c.method, 6)} ${c.raw}`);
console.log(`❌ GONE ${gone.length}  (경로는 있으나 메서드 불일치 — 계약 위반)`);
for (const c of gone) console.log(`     ${pad(c.method, 6)} ${c.raw}  → openapi 메서드: ${[...specByPath.get(c.path)].join(',')}`);
console.log(`🆕 NEW  ${neu.length}  (openapi 에 있으나 api.ts 래퍼 없음)`);
for (const n of neu) console.log(`     ${n}`);

const fail = gone.length > 0 || (strict && warn.length > 0);
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'}${strict ? ' (strict)' : ''}\n`);
process.exit(fail ? 1 : 0);
