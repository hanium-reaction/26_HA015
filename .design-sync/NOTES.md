# design-sync 운영 노트 (Re:Action DS)

프로젝트: `Re:Action DS (코드 동기화)` — https://claude.ai/design/p/ae221286-40e0-4835-93dd-234ba1046b95
shape: `package` (Storybook 없음). 컴포넌트 **31개** 동기화됨.

## 이 레포에서만 생기는 함정들

- **한글 정규식은 반드시 유니코드 이스케이프로.** `src/components/AiDraftCard.tsx`의 금지어
  패턴에 리터럴 `[^가-힣]`을 쓰면, 번들을 `charset=utf-8` 없이 서빙하는 호스트에서
  잘못 디코딩돼 `Range out of order in character class` 문법 에러가 나고 **번들 전체가 죽습니다**
  (`[BUNDLE_EXPORT] 15/15 not a component` 로 나타남). 이스케이프 형태(`[^\uAC00-\uD7A3]`)를
  그대로 유지할 것 — 가독성 좋다고 리터럴 한글로 되돌리면 다시 터집니다.
  다른 파일에 한글 문자 범위를 새로 쓸 때도 같은 규칙.

- **번들 엔트리는 `src/design-system.ts`.** 이 레포는 라이브러리 패키지가 아니라 앱이라
  `package.json`에 export 진입점이 없습니다. 배럴 파일이 진입점이고 `config.json`의
  `entry`가 그걸 가리킵니다. 컴포넌트를 추가하면 **배럴에도 export를 추가**해야 동기화됩니다.
  (`MergedTabBar`는 `TabBar`라는 이름으로 re-export 중.)

- **`overrides.<Name>.skip`은 boolean이 아니라 story id 배열입니다.** `skip: true`를 넣으면
  `boolean true is not iterable`로 빌드가 죽습니다. 프리뷰를 안 그리고 싶으면
  `.design-sync/previews/<Name>.tsx`를 아예 안 만들면 됩니다(자동으로 기본 카드가 생성됨).
  `IosInstallCard`가 그 케이스 — 프리뷰 미작성, 기본 카드로 나감.

- **`overrides`를 고친 뒤에는 `preview-rebuild.mjs`가 아니라 `package-build.mjs` 전체 실행.**
  안 그러면 `[CONFIG_STALE]`이 뜹니다.

- **Playwright 캐시는 macOS에서 `~/Library/Caches/ms-playwright`.** 이미 받아둔
  `chromium-1228`이 playwright 1.61.1과 맞아서 심링크로 해결했습니다(200MB 재다운로드 불필요).
  캐시 못 찾는다고 나오면 다운로드 전에 이 경로부터 확인.

## 대비(contrast) — 문서에 박아둔 사실

`--brand`(코랄-500)를 **텍스트 색**으로 쓰면 크림 배경에서 **2.98:1**로 WCAG 미달입니다.
흰 글씨 + 코랄-500 버튼도 3.14:1로 미달. 강조 텍스트는 `--coral-700`(5.74:1 / 흰 글씨 6.04:1).
이 내용은 `conventions.md`에 들어가 있고 README 맨 위로 업로드됩니다 — 디자인 에이전트가
읽는 규약이므로, 팔레트를 바꾸면 여기 수치도 같이 고칠 것.

## 무엇을 DS 에 넣나 — 판단 기준

**앱이 실제로 렌더하는 것만 넣는다.** 디자인 툴에서 조립한 화면이 코드에 없는 부품을
쓰면 그 디자인은 그대로 구현될 수 없다. 그래서:

- 화면 안에 인라인으로 박혀 있는 UI 는 **컴포넌트로 뽑아서 화면이 그걸 쓰게 만든 뒤** 등록한다.
  뽑아만 두고 화면은 그대로 두면 곧바로 드리프트가 시작된다.
- 안 쓰이는 컴포넌트는 등록하지 않는다. (실제로 `Ring` 이 정의만 되고 아무도 안 쓰는
  죽은 코드였다 — `noUnusedLocals: false` 라 아무 경고도 없었음. 이런 건 지운다.)
- 새 컴포넌트를 추가하면 **`src/design-system.ts` 배럴**과
  **`.design-sync/config.json` 의 `componentSrcMap`** 둘 다에 넣어야 한다.

## 카드가 이상하게 나올 때

- `cardMode: "single"` 인데 엉뚱한 스토리가 뽑히면 → `primaryStory` 를 지정한다.
  (`WeekGrid` 가 `Loading` 스토리를 대표로 골라서 빈 격자만 나왔었다.)
- `[GRID_OVERFLOW]` 경고 → 해당 컴포넌트에 `cardMode: "column"`.
- 배럴에서 export 했는데 프리뷰 파일이 없으면 빈 "floor card" 가 나온다.
  같은 파일에서 여러 개를 export 하면(`InboxItemCard` + `InboxAction`)
  **각각 프리뷰 파일이 필요**하다.

## 빌드/검증 실행법 (스크립트는 `.ds-sync/` 에 스테이징돼 있다)

```
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```
스킬 디렉터리에서 직접 실행하면 `esbuild` 를 못 찾는다 — 반드시 `.ds-sync/` 쪽을 쓸 것.

## 토큰 규칙 (2026-07-29 대비 작업 이후)

**면과 글씨를 같은 토큰으로 쓰지 않는다.** 이름이 곧 규칙:

  기본값   면·아이콘·바   (--brand, --success, --danger …)
  -ink     글씨          (--brand-ink, --success-ink …)
  -soft    옅은 배경      (--brand-soft, --success-soft …)
  --brand-surface        흰 글씨를 얹는 버튼 면 (coral-700)

`--brand`(coral-500)에 **글씨를 얹으면 안 된다** — 크림 위 2.98:1, 흰 글씨 3.14:1.
컴포넌트를 새로 만들 때 `color:` 에는 `-ink` 를, `background:` 에는 기본값을 쓴다.

`--text-3`/`--text-4` 는 sand 스케일을 참조하지 않는다(면용이라 4.5:1 제약이 없어서).
바꿀 땐 `$CLAUDE_JOB_DIR/tmp/contrast2.mjs` 같은 실측 스크립트로 재계산할 것.

## 재동기화 방법

```
node <skill-base>/resync.mjs        # build → diff → validate → 변경분만 캡처, 판정 JSON 하나
```
`_ds_sync.json`(앵커)이 원격에 올라가 있으므로, 안 바뀐 컴포넌트는 재검증을 건너뜁니다.
`config.json`의 `projectId`가 핀이라 다음 실행도 같은 프로젝트로 들어갑니다.
