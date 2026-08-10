#!/usr/bin/env node
// 필드 단위 계약 체크: src/types/api.ts 의 수기 타입을 openapi.json(백엔드 정본)의
// 같은 이름 스키마와 대조한다.
//
// check-api-contract.mjs 는 **경로 단위**라 "엔드포인트가 있나" 까지만 본다.
// 경로가 멀쩡해도 필드가 어긋나면 못 잡는다 — 실제로 두 번 그렇게 샜다:
//   - MorningBrief 를 DailyBrief{greeting} 으로 선언 → brief.greeting 은 늘 undefined,
//     화면은 fallback 인사말만 띄웠고 아무도 몰랐다.
//   - TodayAgenda.fixedSchedules 를 FixedSchedule[] 로 선언 → 실제 스키마엔
//     daysOfWeek 가 없다(agenda 는 오늘 걸린 것만 준다).
//
// 출력 3분류:
//   PHANTOM = 수기 타입에는 있는데 스펙 스키마에 없는 필드. 읽으면 undefined 다.
//             오타·이름 드리프트·삭제된 필드. 위험하므로 --strict 에서 실패시킨다.
//   MISREF  = 필드는 맞는데 **가리키는 타입이 다른** 경우. fixedSchedules 가 딱 이랬다 —
//             이름이 맞아서 PHANTOM 에는 안 걸리는데, 실제로는 다른 스키마라 그 안의
//             필드를 읽으면 undefined 다. 역시 --strict 에서 실패시킨다.
//   UNREAD  = 스펙 응답 스키마에 있는데 src/ 어디서도 참조하지 않는 필드.
//             백엔드가 주는 걸 화면이 버리고 있다는 뜻. 대부분은 메타데이터라
//             정상이므로 정보성으로만 낸다.
//
// 이름이 똑같은 인터페이스/스키마만 비교한다. 이름이 다르면 대응 관계를 알 수 없고,
// 억지로 짝지으면 거짓 경보가 난다.
//
// 종료코드: 기본 0. --strict 면 PHANTOM 이 1개라도 있을 때 1.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const openapi = JSON.parse(readFileSync(resolve(root, 'openapi.json'), 'utf8'));
const schemas = openapi.components?.schemas ?? {};

// ── 1. 응답으로 실제 나가는 스키마만 추린다 ────────────────────────────────
// 요청 본문은 FE 가 만드는 쪽이라 "안 읽는다" 는 개념이 성립하지 않는다.
const responseSchemas = new Set();
const walkRef = (node) => {
  if (!node || typeof node !== 'object') return;
  if (typeof node.$ref === 'string') {
    const name = node.$ref.split('/').pop();
    if (name && !responseSchemas.has(name)) {
      responseSchemas.add(name);
      walkRef(schemas[name]);
    }
    return;
  }
  for (const v of Object.values(node)) walkRef(v);
};
for (const ops of Object.values(openapi.paths ?? {})) {
  for (const op of Object.values(ops)) {
    if (!op || typeof op !== 'object') continue;
    for (const [code, res] of Object.entries(op.responses ?? {})) {
      if (!code.startsWith('2')) continue;
      walkRef(res.content?.['application/json']?.schema);
    }
  }
}

// ── 2. src 전체를 읽어둔다 ────────────────────────────────────────────────
// 생성 타입(openapi.d.ts)은 스펙의 사본이라 "소비" 가 아니다.
// 수기 타입(types/api.ts)도 선언일 뿐이라 UNREAD 판정에서는 제외한다.
const srcFiles = [];
const walkDir = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkDir(p);
    else if (/\.tsx?$/.test(p) && !p.endsWith('types/openapi.d.ts')) srcFiles.push(p);
  }
};
walkDir(resolve(root, 'src'));

const typesPath = resolve(root, 'src/types/api.ts');
const handTypes = readFileSync(typesPath, 'utf8');
const consumerCode = srcFiles
  .filter((f) => f !== typesPath)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

// ── 3. 수기 인터페이스 파싱 ───────────────────────────────────────────────
// `export interface Name {` 부터 열 0 의 `}` 까지. 깊이 1 의 프로퍼티만 센다
// (중첩 객체 리터럴의 내부 키는 그 자체로 스펙 필드가 아니다).
function parseInterfaces(source) {
  const out = new Map();
  const re = /export interface (\w+)[^{]*\{/g;
  let m;
  while ((m = re.exec(source))) {
    const name = m[1];
    let depth = 1;
    let i = re.lastIndex;
    const props = [];
    let line = '';
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      if (ch === '\n') {
        if (depth === 1) {
          // 이름과 타입 텍스트를 함께 잡는다 — 타입까지 봐야 MISREF 를 알 수 있다.
          const p = line.match(/^\s*(\w+)\s*\??\s*:\s*(.+?);?\s*$/);
          // 주석 줄(//, *)은 위 정규식에 안 걸린다.
          if (p) props.push({ name: p[1], type: p[2] });
        }
        line = '';
      } else {
        line += ch;
      }
      i += 1;
    }
    out.set(name, props);
  }
  return out;
}
const interfaces = parseInterfaces(handTypes);

// ── 4. PHANTOM: 수기 타입에만 있고 스펙엔 없는 필드 ────────────────────────
// 이 프로퍼티가 가리키는 스펙 스키마 이름. 배열/nullable 로 감싸인 것도 벗겨낸다.
function specRefName(prop) {
  if (!prop || typeof prop !== 'object') return null;
  if (typeof prop.$ref === 'string') return prop.$ref.split('/').pop();
  if (prop.items) return specRefName(prop.items);
  for (const branch of prop.anyOf ?? prop.oneOf ?? prop.allOf ?? []) {
    const n = specRefName(branch);
    if (n) return n;
  }
  return null;
}

const phantom = [];
const misref = [];
for (const [name, props] of interfaces) {
  const spec = schemas[name]?.properties;
  if (!spec) continue; // 스펙에 같은 이름이 없으면 비교 대상이 아니다(화면 전용 타입 등)
  for (const p of props) {
    if (!(p.name in spec)) {
      phantom.push({ schema: name, field: p.name });
      continue;
    }
    // 필드 이름은 맞다 — 이제 가리키는 타입이 같은지 본다.
    const want = specRefName(spec[p.name]);
    if (!want) continue; // 원시 타입(string/number/…)은 대조할 이름이 없다
    if (new RegExp(`\\b${want}\\b`).test(p.type)) continue; // 올바르게 가리킨다
    // 다른 스키마 이름을 가리킬 때만 신고한다 — 로컬 별칭·인라인 타입은 봐준다.
    const got = (p.type.match(/\b[A-Z]\w+\b/g) ?? []).find((t) => t in schemas && t !== want);
    if (got) misref.push({ schema: name, field: p.name, want, got });
  }
}

// ── 5. UNREAD: 스펙 응답 필드 중 화면이 한 번도 참조 안 한 것 ───────────────
// id/title 같은 흔한 이름은 다른 데서 우연히 매칭돼 의미가 없으므로 제외한다.
const GENERIC = new Set(['id', 'title', 'status', 'date', 'name', 'type', 'message', 'code', 'detail']);
const unread = [];
let checked = 0;
for (const name of [...responseSchemas].sort()) {
  const props = schemas[name]?.properties;
  if (!props) continue;
  for (const p of Object.keys(props)) {
    if (GENERIC.has(p)) continue;
    checked += 1;
    if (!new RegExp(`\\b${p}\\b`).test(consumerCode)) {
      unread.push({ schema: name, field: p, inTypes: new RegExp(`\\b${p}\\b`).test(handTypes) });
    }
  }
}

// ── 출력 ─────────────────────────────────────────────────────────────────
console.log(`\n── API 필드 체크 (types/api.ts ↔ openapi.json) ──`);
console.log(`응답 스키마 ${responseSchemas.size}개 · 필드 ${checked}개 · 수기 인터페이스 ${interfaces.size}개\n`);

console.log(`👻 PHANTOM ${phantom.length}  (수기 타입에 있으나 스펙에 없음 — 읽으면 undefined)`);
for (const p of phantom) console.log(`     ${p.schema}.${p.field}`);

console.log(`🔀 MISREF  ${misref.length}  (필드는 맞으나 가리키는 타입이 다름 — 그 안의 필드는 undefined)`);
for (const m of misref) console.log(`     ${m.schema}.${m.field}: ${m.got} → 스펙은 ${m.want}`);

console.log(`📭 UNREAD  ${unread.length}  (백엔드가 주는데 화면이 안 읽음 — 대부분 메타데이터라 정상)`);
const grouped = new Map();
for (const u of unread) {
  if (!grouped.has(u.schema)) grouped.set(u.schema, []);
  grouped.get(u.schema).push(u.field + (u.inTypes ? '' : ' *타입에도 없음'));
}
for (const [s, fields] of grouped) console.log(`     ${s}: ${fields.join(', ')}`);

const fail = strict && (phantom.length > 0 || misref.length > 0);
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'}${strict ? ' (strict)' : ''}\n`);
process.exit(fail ? 1 : 0);
