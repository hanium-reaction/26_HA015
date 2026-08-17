# First Plan 실 Gemini 응답 기록

- 모델: `gemini-flash-lite-latest` · timeout: 8s · 키: `AIzaSyAJ...`
- 경로: InterviewOutcome → [Gemini 분해] → [룰 배치] → [Gemini 검토] (운영 동일)

---

## 정보처리기사 실기 합격 (집중 학습형)

- **확인 포인트**: 단일 focus 목표 + 60분 이내 leaf 규칙이 잘 지켜지는지
- **입력 목표**: 정보처리기사 실기 합격(focus)
- **heaviest(분해 대상)**: 정보처리기사 실기 합격
- **활동시간**: 09:00~23:00, no_touch 1건
- **실행시간**: 4.2s · **used_fallback**: `False` ✅ 실제 Gemini
- **tier_violation**: None

### 🌳 목표 분해 (Gemini) — node 6개
- `root` 정보처리기사 실기 합격
  - `branch` 핵심 과목 개념 마스터
    - `leaf` 소프트웨어 설계 이론 암기
    - `leaf` 데이터베이스 SQL 쿼리 실습
  - `branch` 기출문제 및 실전 대비
    - `leaf` 최근 3개년 기출문제 풀이

### ✅ action_items (Gemini) — 3개
- **소프트웨어 설계 핵심 용어 20개 정리 및 백지 복습** (study, 50분)
  - 첫 스텝: 교재의 1단원 핵심 요약본을 훑어본다.
- **SQL Join 및 서브쿼리 문법 5개 예제 직접 작성** (study, 50분)
  - 첫 스텝: SQL 온라인 컴파일러 사이트를 접속한다.
- **2023년 1회 기출문제 중 프로그래밍 언어 파트 5문제 풀이** (study, 50분)
  - 첫 스텝: 기출문제지에서 프로그래밍 문항 번호를 체크한다.

### 📅 scheduled_blocks (룰 배치, LLM 0회) — 3개
- `09:00~09:50` 소프트웨어 설계 핵심 용어 20개 정리 및 백지 복습 (study)
- `09:50~10:40` SQL Join 및 서브쿼리 문법 5개 예제 직접 작성 (study)
- `10:40~11:30` 2023년 1회 기출문제 중 프로그래밍 언어 파트 5문제 풀이 (study)

### 🔎 plan_quality 검토 (Gemini)
- approved: **True**

---

## 토익 900점 (마감 임박형)

- **확인 포인트**: 짧은 horizon(3주) + rest_ok=False 일 때 분해 밀도
- **입력 목표**: 토익 900점 달성(focus)
- **heaviest(분해 대상)**: 토익 900점 달성
- **활동시간**: 08:00~22:00, no_touch 0건
- **실행시간**: 3.2s · **used_fallback**: `False` ✅ 실제 Gemini
- **tier_violation**: None

### 🌳 목표 분해 (Gemini) — node 5개
- `root` 토익 900점 달성
  - `branch` LC 파트별 공략 및 청취력 강화
    - `leaf` LC 파트 2 의문문 답변 찾기 연습
  - `branch` RC 문법 정리 및 독해 속도 향상
    - `leaf` RC 파트 5 문법 유형별 20문제 풀이

### ✅ action_items (Gemini) — 2개
- **LC 파트 2 기출문제 15문항 쉐도잉 및 오답 분석** (study, 40분)
  - 첫 스텝: 교재 파트 2 기출문제 15문항을 타이머를 맞추고 푼다.
- **파트 5 문법 오답 노트 정리 및 유형 학습** (study, 40분)
  - 첫 스텝: 틀린 문법 문제 5개를 선정하여 관련 문법 이론을 노트에 요약한다.

### 📅 scheduled_blocks (룰 배치, LLM 0회) — 2개
- `08:00~08:40` LC 파트 2 기출문제 15문항 쉐도잉 및 오답 분석 (study)
- `08:40~09:20` 파트 5 문법 오답 노트 정리 및 유형 학습 (study)

### 🔎 plan_quality 검토 (Gemini)
- approved: **True**

---

## 체중 5kg 감량 + 러닝 습관 (유지형)

- **확인 포인트**: 근무시간 no_touch 가 룰 배치에서 제외되는지 + maintain 2개
- **입력 목표**: 3개월 안에 체중 5kg 감량(maintain) / 주 3회 러닝 루틴 정착(maintain)
- **heaviest(분해 대상)**: 3개월 안에 체중 5kg 감량
- **활동시간**: 06:00~23:30, no_touch 1건
- **실행시간**: 3.0s · **used_fallback**: `False` ✅ 실제 Gemini
- **tier_violation**: None

### 🌳 목표 분해 (Gemini) — node 5개
- `root` 3개월 내 체중 5kg 감량
  - `branch` 식단 관리 체계화
    - `leaf` 오늘의 섭취 칼로리 및 영양소 기록
  - `branch` 저강도 규칙적 신체 활동
    - `leaf` 가벼운 저녁 산책 20분

### ✅ action_items (Gemini) — 2개
- **식사 기록 앱 설치 및 첫 식사 입력** (health, 15분)
  - 첫 스텝: 스마트폰 앱스토어에서 식단 기록 앱 다운로드하기
- **주변 공원 가벼운 산책 수행** (exercise, 20분)
  - 첫 스텝: 운동화 끈을 묶고 현관문 밖으로 나가기

### 📅 scheduled_blocks (룰 배치, LLM 0회) — 2개
- `06:00~06:15` 식사 기록 앱 설치 및 첫 식사 입력 (health)
- `06:15~06:35` 주변 공원 가벼운 산책 수행 (exercise)

### 🔎 plan_quality 검토 (Gemini)
- approved: **True**

---

## 백엔드 포트폴리오 + 코딩테스트 (멀티 목표)

- **확인 포인트**: heaviest 가 아닌 목표는 분해 트리에서 제외되는지(heaviest 만 분해)
- **입력 목표**: Spring 기반 백엔드 포트폴리오 1개 완성(focus) / 백준 골드 달성(focus)
- **heaviest(분해 대상)**: Spring 기반 백엔드 포트폴리오 1개 완성
- **활동시간**: 10:00~23:59, no_touch 0건
- **실행시간**: 3.0s · **used_fallback**: `False` ✅ 실제 Gemini
- **tier_violation**: None

### 🌳 목표 분해 (Gemini) — node 6개
- `root` Spring 기반 백엔드 포트폴리오 1개 완성
  - `branch` 프로젝트 기획 및 환경 설정
    - `leaf` 핵심 기능 정의 및 ERD 작성
  - `branch` 도메인 모델링 및 API 구현
    - `leaf` 회원 인증 및 API 기본 스켈레톤 작성
    - `leaf` 주요 도메인 비즈니스 로직 작성

### ✅ action_items (Gemini) — 3개
- **요구사항 명세 기반 테이블 엔티티 구조 설계** (planning, 45분)
  - 첫 스텝: Notion에 3개 핵심 엔티티 속성 나열하기
- **Spring Security 및 JWT 필터 설정** (development, 60분)
  - 첫 스텝: Spring Initializr로 의존성 선택 후 프로젝트 생성
- **비즈니스 로직 서비스 계층 테스트 코드 작성** (development, 60분)
  - 첫 스텝: JUnit5 테스트 클래스 생성 및 기본 @Test 어노테이션 작성

### 📅 scheduled_blocks (룰 배치, LLM 0회) — 3개
- `10:00~10:45` 요구사항 명세 기반 테이블 엔티티 구조 설계 (planning)
- `10:45~11:45` Spring Security 및 JWT 필터 설정 (development)
- `11:45~12:45` 비즈니스 로직 서비스 계층 테스트 코드 작성 (development)

### 🔎 plan_quality 검토 (Gemini)
- approved: **True**

---
