import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReButton } from './ReButton';

// 가이드 투어는 요소의 data-tour-help 속성에서 설명을 읽는다(GuidedTourOverlay 의
// description()). ReButton 이 이 속성을 넘기지 않으면 그 버튼만 설명이 안 뜨는데,
// TypeScript 는 하이픈이 들어간 JSX 속성을 검사하지 않아 오류조차 나지 않는다.
// 화면에는 아무 이상이 없어 보이므로, 여기서 잠가둔다.
describe('ReButton', () => {
  it('투어 설명을 실제 button 속성으로 넘긴다', () => {
    render(<ReButton data-tour-help="이 버튼이 하는 일">누르기</ReButton>);
    expect(screen.getByRole('button', { name: '누르기' })).toHaveAttribute(
      'data-tour-help',
      '이 버튼이 하는 일',
    );
  });

  it('설명을 주지 않으면 속성을 만들지 않는다', () => {
    render(<ReButton>누르기</ReButton>);
    expect(screen.getByRole('button', { name: '누르기' })).not.toHaveAttribute('data-tour-help');
  });
});
