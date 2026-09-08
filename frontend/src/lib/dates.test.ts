import { describe, expect, it } from 'vitest';
import { formatDurationMinutes } from './dates';

// 주간 리뷰가 평균 지연을 `분` 으로만 찍어서 "평균 지연 5996분" 이 화면에 그대로 나왔다.
// 100시간을 분으로 적으면 크다는 것 말고는 아무것도 안 읽힌다 — 자릿수를 세게 만든다.
describe('formatDurationMinutes', () => {
  it('한 시간 미만은 분으로', () => {
    expect(formatDurationMinutes(0)).toBe('0분');
    expect(formatDurationMinutes(38)).toBe('38분');
    expect(formatDurationMinutes(59)).toBe('59분');
    expect(formatDurationMinutes(59.4)).toBe('59분');
  });

  it('한 시간부터는 시간으로 — 딱 떨어지면 분을 생략한다', () => {
    expect(formatDurationMinutes(60)).toBe('1시간');
    expect(formatDurationMinutes(120)).toBe('2시간');
    expect(formatDurationMinutes(150)).toBe('2시간 30분');
  });

  it('하루부터는 일로 — 딱 떨어지면 시간을 생략한다', () => {
    expect(formatDurationMinutes(60 * 24)).toBe('1일');
    expect(formatDurationMinutes(60 * 27)).toBe('1일 3시간');
    // 실제로 화면에 나왔던 값. "5996분" 이 아니라 "4일 4시간" 으로 읽힌다.
    expect(formatDurationMinutes(5996)).toBe('4일 4시간');
  });

  it('⚠️ 반올림이 자리올림을 만들지 않는다', () => {
    // 큰 단위부터 정수로 떼고 나머지를 반올림하지 않으면 "1시간 60분" 이 나온다.
    expect(formatDurationMinutes(119.6)).toBe('2시간');
    expect(formatDurationMinutes(60 * 24 - 0.4)).toBe('1일');
  });

  it('음수는 부호를 밖으로 뺀다 — 계획보다 일찍 시작하면 지연이 음수다', () => {
    expect(formatDurationMinutes(-12)).toBe('-12분');
    expect(formatDurationMinutes(-150)).toBe('-2시간 30분');
  });

  it('값이 없거나 이상하면 지어내지 않는다', () => {
    expect(formatDurationMinutes(Number.NaN)).toBe('-');
    expect(formatDurationMinutes(Number.POSITIVE_INFINITY)).toBe('-');
  });
});
