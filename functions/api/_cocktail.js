// 고객이 보낸 금액을 신뢰하지 않고 공개 패키지 가격으로 다시 계산합니다.
const PRICES = { 100: 800000, 200: 1100000, 300: 1500000, 400: 1800000 };
const MENU_IDS = new Set('mojito highball jack_coke black_russian cuba_libre martini gin_tonic wildflower kiss_of_fire cherry_topia cosmopolitan singapore_sling strawberry_daiquiri peach_crush blue_sapphire udo blue_lemonade melon_shower applewood greenlight orange_mojito zero_punch sidecar cinderella_complex kahlua_milk pineapple_sunshine makgeolli_shower indangsu red_devil'.split(' '));
export function cocktailFrom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const cups = Number(input.cups);
  if (!Object.hasOwn(PRICES, cups)) return null;
  const menus = Array.isArray(input.menus) ? [...new Set(input.menus.filter(id => MENU_IDS.has(id)))].slice(0, 8) : [];
  const note = String(input.note || '').slice(0, 300);
  const price = PRICES[cups];
  return { cups, price, unit: price / cups, menus, nonalcohol: !!input.nonalcohol, note,
    summary: `${cups}잔 패키지 · 표시 가격 ${price.toLocaleString('ko-KR')}원 (잔당 ${(price / cups).toLocaleString('ko-KR')}원)${note ? ` · 희망 메뉴: ${note}` : ''}${input.nonalcohol ? ' · 논알코올 구성 상담' : ''}` };
}
