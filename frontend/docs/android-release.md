# Android 릴리스 절차 (#237)

Google Play 프로덕션 출시를 위한 프론트엔드 저장소 쪽 절차와 현재 상태를 적어 둔다.
Play Console 계정 생성처럼 사람이 직접 해야 하는 항목과 백엔드가 열어 줘야 하는 항목은
이 문서 맨 아래 "이 저장소 밖의 선행조건" 에 따로 모았다.

## 이미 맞춰져 있는 설정

`npm run android` 로 빌드하기 전에 아래 값이 바뀌지 않았는지만 확인하면 된다.

| 항목 | 값 | 위치 |
|---|---|---|
| 패키지명 | `com.hanium.reaction` | `capacitor.config.ts`, `android/app/build.gradle` |
| `minSdkVersion` | 24 | `android/variables.gradle` |
| `compileSdkVersion` | 36 | `android/variables.gradle` |
| `targetSdkVersion` | 36 | `android/variables.gradle` |
| 클리어텍스트 | 차단 | `capacitor.config.ts` (`allowMixedContent: false`), `AndroidManifest.xml` 에 `usesCleartextTraffic` 없음 |
| 하드웨어 뒤로가기 | 처리됨 | `src/lib/native.ts` — 히스토리가 있으면 뒤로, 없으면 앱 최소화 |
| 네이티브 푸시 | 첫 버전에서 숨김 | `src/lib/platform.ts` `nativePushReady()` 가 항상 false |

## API 주소

앱은 `capacitor://localhost` 로 로드되므로 same-origin `/api` 프록시가 없다. 그래서
네이티브 빌드는 절대 HTTPS 주소를 쓴다.

- 기본값: `https://reaction-frontend.vercel.app/api` — 앱→Vercel 구간만 HTTPS 이고,
  Vercel rewrite 가 http 백엔드로 우회한다.
- 백엔드에 HTTPS 도메인이 붙으면 `VITE_NATIVE_API_BASE_URL` 에 그 주소를 넣는다.
  코드를 고칠 필요 없이 빌드 환경변수만 바꾸면 된다.

#237 의 완료 조건인 "API 전 구간 HTTPS" 는 이 값을 실제 HTTPS 백엔드로 바꿔야 충족된다.
지금 기본값 그대로 출시하면 Vercel 뒤편 구간이 http 로 남는다.

## 릴리스마다 하는 일

1. `android/app/build.gradle` 의 `versionCode` 를 **1 올린다**. Play 는 같은
   `versionCode` 를 두 번 받지 않는다. 이미 올린 릴리스를 지워도 그 번호는 재사용할 수 없다.
2. `versionName` 은 사용자에게 보이는 문자열이다. 기능이 늘면 minor, 버그 수정만이면
   patch 를 올린다. 현재 `1.0.0`.
3. 웹과 Android 를 **같은 release 태그**에서 빌드한다. 두 빌드가 다른 커밋에서 나오면
   같은 날 공개해도 서로 다른 앱이 된다.
4. `npm run android` (= `npm run build && cap sync android && cap open android`) 로
   Android Studio 를 연 뒤 AAB 를 만든다.
5. `app-release.aab` 를 내부 테스트 트랙에 먼저 올린다. 로컬 APK 설치만으로 검증을
   끝내지 않는다 — Play 설치본에서만 드러나는 서명·권한 문제가 있다.

## 이 저장소 밖의 선행조건

아래는 코드로 처리할 수 없다. 사람이 직접 하거나 백엔드가 열어 줘야 한다.

### 사람이 직접

- Play Console 개발자 계정 생성, 본인 인증, 등록비 결제
- 신규 개인 계정이면 테스터 12명 이상으로 14일 연속 비공개 테스트 후 프로덕션 접근 신청
- Managed publishing 활성화
- upload keystore 생성과 백업 (저장소에 넣지 않는다 — 비밀번호 관리자와 오프라인 두 곳)
- Play App Signing 구성
- Google Cloud 에 웹/Android OAuth Client 분리 생성, 패키지명과 SHA-1 등록
  (개발 키, 업로드 키, Play App Signing 키 셋 다)
- 스토어 등록정보: 아이콘 512×512, Feature Graphic 1024×500, 스크린샷 2장 이상,
  콘텐츠 등급, Data Safety 응답
- 개인정보처리방침과 계정 삭제 안내 페이지의 **본문 작성**. 법적 문서라 실제 데이터 처리와
  어긋나면 심사에서 문제가 된다. 문구가 정해지면 이 저장소에 정적 페이지로 올린다.
- 실기기 테스트 (API 24·33·36, 네트워크 단절·복원, 강제 종료 후 복원, ANR)

### 백엔드가 열어 줘야

- API 전 구간 HTTPS (고정 도메인 + 인증서)
- Android ID token 검증
- refresh token 자동 갱신
- **계정 삭제 엔드포인트** — 현재 `openapi.json` 에 계정 삭제용 `DELETE` 경로가 없다.
  이것 없이는 "앱 설정에서 계정 삭제" 를 프론트에서 만들 수 없다.
- 초대코드 가입 게이트와 30명 제한, `SIGNUPS_ENABLED` / `SCHEDULER_ENABLED` 차단 수단
- 사용자별 API 호출 한도, Gemini 일 비용 상한과 룰 폴백
