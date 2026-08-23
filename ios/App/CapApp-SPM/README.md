# CapApp-SPM

이 Swift Package는 Re:Action iOS 앱이 사용하는 Capacitor 플러그인 의존성을 Xcode에 연결하는 생성 영역입니다.

## 역할

- 위치: `ios/App/CapApp-SPM/`
- 패키지 정의: [`Package.swift`](Package.swift)
- 호스트 앱: `ios/App/App.xcodeproj`
- 상위 설정: 저장소 루트의 [`capacitor.config.ts`](../../../capacitor.config.ts)

웹 빌드 결과와 Capacitor 플러그인 구성이 바뀌면 저장소 루트에서 다음 명령으로 iOS 프로젝트를 동기화합니다.

```bash
npm run cap:sync
```

iOS만 동기화하고 Xcode를 열려면 다음 명령을 사용합니다.

```bash
npm run ios
```

## 편집 규칙

이 디렉터리는 Capacitor가 관리합니다. `Package.swift`의 의존성이나 `Sources/CapApp-SPM` 내용을 수동으로 수정하면 다음 동기화에서 덮어써지거나 Xcode 패키지 해석이 깨질 수 있습니다.

- 플러그인 추가·삭제: 저장소 루트의 `package.json`을 변경한 뒤 `npm run cap:sync`
- 앱 설정 변경: 저장소 루트의 `capacitor.config.ts`
- 네이티브 앱 코드 변경: `ios/App/App/`
- 생성 영역의 직접 편집: 피하고, 불가피한 경우 변경 이유와 재생성 영향을 PR에 기록

문제가 생기면 먼저 저장소 루트에서 `npm ci`와 `npm run cap:sync`를 다시 실행한 뒤 Xcode의 Package Dependencies 상태를 확인하세요.
