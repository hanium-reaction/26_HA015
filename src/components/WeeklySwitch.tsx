import { useNavigation } from '../contexts/NavigationContext';
import { Segmented } from './Segmented';

// 주간 계획 / 주간 리뷰를 한 탭 안에서 전환하는 세그먼트 컨트롤.
// 하단 탭을 4→3 으로 줄이면서 두 '주간' 화면을 하나의 탭으로 묶는다.
// tab 은 항상 'weekly' 로 유지해 하단 '주간' 탭 하이라이트가 떨어지지 않게 한다.
export function WeeklySwitch() {
  const { screen, setScreen, setTab } = useNavigation();
  const value: 'weekly' | 'review' = screen === 'review' ? 'review' : 'weekly';
  return (
    <Segmented
      ariaLabel="주간 계획/리뷰 전환"
      value={value}
      onChange={(s) => { setTab('weekly'); setScreen(s); }}
      options={[
        { value: 'weekly', label: '계획' },
        { value: 'review', label: '리뷰' },
      ]}
    />
  );
}
