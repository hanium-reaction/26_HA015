# design-sync 운영 노트 (Re:Action DS)

프로젝트: `Re:Action DS (코드 동기화)` — https://claude.ai/design/p/ae221286-40e0-4835-93dd-234ba1046b95
shape: `package` (Storybook 없음). 컴포넌트 15개 전부 동기화됨.

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

## 재동기화 방법

```
node <skill-base>/resync.mjs        # build → diff → validate → 변경분만 캡처, 판정 JSON 하나
```
`_ds_sync.json`(앵커)이 원격에 올라가 있으므로, 안 바뀐 컴포넌트는 재검증을 건너뜁니다.
`config.json`의 `projectId`가 핀이라 다음 실행도 같은 프로젝트로 들어갑니다.
