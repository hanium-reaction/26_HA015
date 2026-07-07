export const GOAL_STATUS_META = {
  focus:   { label: '집중', bg: 'var(--coral-50)',   color: 'var(--coral-700)', border: 'var(--coral-200)' },
  maintain:{ label: '유지', bg: '#EEF1E5',            color: '#5F724D',           border: '#C2CFA5' },
  parked:  { label: '보류', bg: 'var(--sand-100)',   color: 'var(--text-3)',     border: 'var(--sand-300)' },
};

// 실패 사유 칩의 기본값 — 백엔드 실패 태그 카탈로그(GET /reflection/failure-tags)가
// 응답할 때까지 잠깐 보여주는 자리표시자. 실제 데모 시나리오 데이터가 아니라 그냥
// 흔한 실패 사유 라벨이라 목업 제거 대상이 아니다.
export const FAIL_REASONS = ['막막함', '피곤함', '일정 충돌', '과대 과제', '회피', '기타'];

// ── Goal color palette ────────────────────────────────────────
// 실제 목표 카테고리명은 사용자마다 자유 문자열이라 이름을 미리 알 수 없다(#85).
// 이름 해시로 팔레트 인덱스를 정해 같은 카테고리는 항상 같은 색을, 처음 보는
// 카테고리도 곧장 구분되는 색을 받게 한다 — 하드코딩된 이름 맵(SQLD/학교/알고리즘)
// 은 실 카테고리와 하나도 안 맞으면 전부 같은 기본색으로 뭉개져 보이는 문제가 있었다.
const GOAL_PALETTE: { bg: string; bd: string; fg: string }[] = [
  { bg: 'var(--brand-soft)', bd: 'var(--coral-200)', fg: 'var(--coral-700)' },
  { bg: '#EEF1E5', bd: '#C2CFA5', fg: '#5F724D' },
  { bg: '#EFEBF4', bd: '#C7BDDB', fg: '#6E5E9C' },
  { bg: '#FBEEDA', bd: '#F2D29A', fg: '#8A6420' },
  { bg: '#E5EFE3', bd: '#b4dfc8', fg: '#3D6B4F' },
  { bg: '#E8F0F7', bd: '#B8D4E8', fg: '#3D6480' },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function goalColor(name: string | null | undefined): { bg: string; bd: string; fg: string } {
  if (!name) return GOAL_PALETTE[0];
  return GOAL_PALETTE[hashStr(name) % GOAL_PALETTE.length];
}

export const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일'];

// ── Goal category ─────────────────────────────────────────────
// 목표 카테고리의 단일 소스(값=백엔드 영문, 라벨=한글). 목표 관리(GoalsScreen)·
// 시간표 생성(온보딩)·주간 캘린더(메인)가 전부 이걸 공유해, 'other' 가 어디선
// "other" 어디선 "기타" 로 갈라지던 문제를 없앤다.
export const GOAL_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'study', label: '학습' },
  { value: 'project', label: '프로젝트' },
  { value: 'health', label: '건강' },
  { value: 'routine', label: '루틴' },
  { value: 'schedule', label: '일정' },
  { value: 'career', label: '커리어' },
  { value: 'relationship', label: '관계' },
  { value: 'self_dev', label: '자기계발' },
  { value: 'other', label: '기타' },
];

const GOAL_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  GOAL_CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);

// 미분류 기본 카테고리 — 한국어 리터럴 '기타' 대신 정식 값 'other' 를 쓴다.
// (그래야 백엔드 'other' 블록과 같은 값이 되어 색·라벨이 하나로 합쳐진다.)
export const DEFAULT_GOAL_CATEGORY = 'other';

// 카테고리 값 → 한글 라벨. 알려진 값은 라벨로, 사용자 자유 문자열은 원문 그대로.
export function categoryLabel(value: string | null | undefined): string {
  if (!value) return GOAL_CATEGORY_LABEL[DEFAULT_GOAL_CATEGORY];
  return GOAL_CATEGORY_LABEL[value] ?? value;
}
