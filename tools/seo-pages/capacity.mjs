// 배치별 1명당 필요 면적 — 공간 모음 표, 가이드 글, 계산기가 같은 값을 씁니다.
// 출처: Social Tables, "Calculate Event Capacity Correctly in 3 Simple Steps" (1명당 제곱피트 기준을 ㎡·평으로 환산)
//   https://www.socialtables.com/blog/event-planning/capacity-party-space-calculator/
export const SOURCE = { name: 'Social Tables', title: 'Calculate Event Capacity Correctly in 3 Simple Steps', url: 'https://www.socialtables.com/blog/event-planning/capacity-party-space-calculator/' };
export const SQFT = 0.09290304, PYEONG = 3.305785;   // 1제곱피트 = 0.0929㎡ · 1평 = 3.3058㎡
export const LAYOUTS = [
  { id: 'standing', label: '스탠딩', note: '서서 어울리는 리셉션·네트워킹', sqft: [6, 6] },
  { id: 'reception', label: '리셉션', note: '서 있는 사람과 앉은 사람이 섞인 자리', sqft: [8, 8] },
  { id: 'theater', label: '강연형', note: '의자만 화면 쪽으로 줄지어 놓기', sqft: [6, 8] },
  { id: 'long', label: '연회형 · 긴 테이블', note: '긴 테이블에 마주 앉는 식사', sqft: [9, 10] },
  { id: 'round', label: '연회형 · 원형 테이블', note: '원형 테이블에 둘러앉는 식사', sqft: [11, 12] },
  { id: 'classroom', label: '책상형', note: '책상과 의자를 화면 쪽으로', sqft: [14, 18] },
  { id: 'conference', label: '회의형', note: '큰 테이블 하나에 둘러앉는 회의', sqft: [30, 40] }
];
export const layout = id => LAYOUTS.find(l => l.id === id);
const r1 = n => Math.round(n * 10) / 10;
export const m2Per = l => l.sqft.map(s => Math.round(s * SQFT * 100) / 100);                                        // 1명당 ㎡ [작게, 넉넉히]
export const perPyeong = l => l.sqft.map(s => r1(PYEONG / (s * SQFT))).reverse();                                        // 1평당 인원 [넉넉히, 빽빽이]
export const pyeongFor = (n, l) => l.sqft.map(s => Math.round(n * s * SQFT / PYEONG));                                   // n명 좌석 면적(평) [작게, 넉넉히]
export const range = (a, unit = '') => a[0] === a[1] ? `약 ${a[0]}${unit}` : `${a[0]}~${a[1]}${unit}`;
export const need = (n, id) => range(pyeongFor(n, layout(id)), '평');
