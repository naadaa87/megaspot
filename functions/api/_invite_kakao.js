// 모임 초대장 카카오톡(알림톡) 보내기 (2026-11-24)
//  · 예약자 본인 번호(예약의 대표 연락처·추가 연락처)로만 보냅니다. 다른 번호로는 보낼 수 없습니다.
//  · 알리고에 아래 INVITE_TEMPLATE 을 글자 그대로 등록하고 카카오 승인을 받은 뒤, 관리자 → 모임 초대장 → 카카오톡 설정에서
//    템플릿 코드를 저장하고 '승인 확인' → '시험 발송'(운영자 번호로 받아 보기) → '받았어요'를 차례로 눌러야 보낼 수 있습니다.
//  · 연결 서버(relay.naranhistory.com)는 허용 목록에 있는 템플릿만 보내므로, 발급받은 코드를
//    연결 서버 환경 변수 ALIGO_MEMBER_TEMPLATE_CODES 에 쉼표로 덧붙이고 다시 시작해야 합니다(알림톡 실패 시 같은 내용 문자로 대신 보냄).
//  · 고객이 초대장 화면에서 직접 '카카오톡으로 받기'를 누르는 기능은 관리자가 따로 켜야 보입니다(기본 꺼짐).
//  · 보낸 기록(받는 번호는 가운데를 가림)은 invite_messages 에 남기고, 초대장을 지울 때 함께 지웁니다.
//  · 승인·시험·발송 처리는 _custom_alimtalk.js 를 같이 씁니다(공간대관 계약서와 같은 방식).
import { makeKakao, transport, liveAllowed, maskPhone, renderTemplate } from './_custom_alimtalk.js';

export const SETTINGS_KEY = 'invite_alimtalk';
export const SUBJECT = '메가스팟 모임 초대장';
const VIEW = 'https://megaspot.kr/invite/#c=#{초대장코드}';
const MANAGE = 'https://megaspot.kr/invite/manage/#id=#{관리번호}&k=#{관리키}';
export const INVITE_TEMPLATE = {
  name: '메가스팟_모임초대장_v1',
  content: `[메가스팟 모임 초대장]

#{고객명}님, 예약하신 모임의 초대장이 준비되었습니다.

모임 이름: #{모임이름}
예약 공간: #{공간명}
이용 날짜: #{이용일}
이용 시간: #{이용시간}

'초대장 보기'에서 주소를 복사해 일행에게 보내 주세요.
PDF 저장, 내용 고치기, 참석 응답 확인은 '초대장 관리'에서 할 수 있습니다.
'초대장 관리'는 예약하신 분만 쓰는 화면이니 다른 분께 전달하지 마세요.`,
  buttons: [
    { name: '초대장 보기', linkType: 'WL', linkMo: VIEW, linkPc: VIEW },
    { name: '초대장 관리', linkType: 'WL', linkMo: MANAGE, linkPc: MANAGE }
  ]
};
export const TEMPLATE_VARS = ['고객명', '모임이름', '공간명', '이용일', '이용시간', '초대장코드', '관리번호', '관리키'];

const K = makeKakao({ key: SETTINGS_KEY, tag: 'invite-alimtalk-v1', template: INVITE_TEMPLATE, subject: SUBJECT, table: 'invite_messages', idCol: 'invite_id', noun: '초대장', hashTag: 'invite-receiver:' });
export { transport, liveAllowed, maskPhone };
export const kakaoConfig = env => K.config(env);
export const configSig = (env, code) => K.sig(env, code);
export const kakaoState = env => K.state(env);
// 고객 화면에는 켜져 있는지만 알려 줍니다
export const customerKakao = env => K.customer(env);
export const saveKakaoConfig = (env, d) => K.save(env, d);
// 알리고에 등록된 템플릿이 승인되었고 본문·버튼이 글자까지 같은지 확인합니다
export const checkTemplate = (env, send) => K.check(env, send);
export const renderInvite = renderTemplate;
// 한 번 보내기. vars: TEMPLATE_VARS 값. actor: customer | host | admin | test
export const sendInviteKakao = (env, { inviteId = null, ...o }, send) => K.send(env, { refId: inviteId, ...o }, send);
export const inviteMessages = (env, inviteId, limit) => K.messages(env, inviteId, limit);
export const inviteTests = env => K.tests(env);
export const markTested = env => K.markTested(env);

// ---------- 내용 채우기 ----------
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''); if (!m) return '';
  return `${+m[1]}년 ${+m[2]}월 ${+m[3]}일 (${WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]})`;
}
export function hourLabel(h) {
  h = Number(h); if (!Number.isFinite(h)) return '';
  const x = h % 24, s = String(Math.floor(x)).padStart(2, '0') + ':' + String(Math.round((x % 1) * 60)).padStart(2, '0');
  return h >= 24 ? '다음 날 ' + s : s;
}
export function timeLabel(s, e) { return s == null ? '예약 시간 기준' : hourLabel(s) + (e != null ? ' ~ ' + hourLabel(e) : ''); }
// 운영자 시험 발송: 예시 초대장 주소로 보냅니다 (/invite/#c=sample 은 예시 초대장을 보여 줍니다)
export function sampleVars(date) {
  return { 고객명: '운영자 시험', 모임이름: '카카오톡 초대장 시험', 공간명: '메가스팟 건대 1호', 이용일: dateLabel(date), 이용시간: '18:00 ~ 22:00',
    초대장코드: 'sample', 관리번호: 'SAMPLE', 관리키: 'sample' };
}
