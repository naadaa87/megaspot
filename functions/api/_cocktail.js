import {BARTENDER_FEE} from './_cocktail_pricing.js';
// 고객이 보낸 금액을 신뢰하지 않고 공개 패키지 가격으로 다시 계산합니다.
const PRICES = { 100: 1200000, 200: 1800000, 300: 2300000, 400: 2700000 };
const MENU_NAMES = {mojito:'모히토',highball:'하이볼',jack_coke:'잭콕',black_russian:'블랙 러시안',cuba_libre:'쿠바 리브레',martini:'마티니',gin_tonic:'진토닉',wildflower:'와일드플라워',kiss_of_fire:'키스 오브 파이어',cherry_topia:'체리 토피아',cosmopolitan:'코스모폴리탄',singapore_sling:'싱가포르 슬링',strawberry_daiquiri:'스트로베리 다이퀴리',peach_crush:'피치 크러시',blue_sapphire:'블루 사파이어',udo:'우도',blue_lemonade:'블루 레모네이드',melon_shower:'멜론 샤워',applewood:'애플우드',greenlight:'그린라이트',orange_mojito:'오렌지 모히토',zero_punch:'제로 펀치',sidecar:'사이드카',cinderella_complex:'신데렐라 컴플렉스',kahlua_milk:'깔루아 밀크',pineapple_sunshine:'파인애플 선샤인',makgeolli_shower:'막걸리 샤워',indangsu:'인당수',red_devil:'붉은 악마'};
export function cocktailFrom(input, prices = PRICES, revision) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const cups = Number(input.cups);
  if (!Object.hasOwn(prices, cups)) return null;
  const menus = Array.isArray(input.menus) ? [...new Set(input.menus.filter(id => Object.hasOwn(MENU_NAMES, id)))].slice(0, 8) : [];
  const note = String(input.note || '').slice(0, 300);
  const price = prices[cups], bartender_fee = BARTENDER_FEE, subtotal = price + bartender_fee, vat = Math.round(subtotal * 0.1), total = subtotal + vat;
  return { cups, price, bartender_fee, subtotal, vat, total, vat_excluded: true, pricing_version: revision == null ? '20261104-bartender1' : 'cocktail-settings-'+revision, pricing_revision: revision, unit: price / cups, menus, menu_names:menus.map(id=>MENU_NAMES[id]), nonalcohol: !!input.nonalcohol, note,
    summary: `${cups}잔 패키지 · 판매가 ${price.toLocaleString('ko-KR')}원 (부가세 별도) · 바텐더 출장 및 제조 ${bartender_fee.toLocaleString('ko-KR')}원 · 부가세 ${vat.toLocaleString('ko-KR')}원 · 합계 ${total.toLocaleString('ko-KR')}원 (잔당 ${Number.isInteger(price / cups) ? '' : '약 '}${(price / cups).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원)${menus.length ? ` · 희망 메뉴: ${menus.map(id => MENU_NAMES[id]).join(', ')}` : ''}${note ? ` · 요청: ${note}` : ''}${input.nonalcohol ? ' · 논알코올 구성 상담' : ''}` };
}
