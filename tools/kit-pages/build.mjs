#!/usr/bin/env node
// 모임 키트 페이지(/kit/ · /invite/… · /play/…)를 만듭니다.
//   node tools/kit-pages/build.mjs           HTML 을 다시 만들고 sitemap.xml 의 kit-pages 구간을 고칩니다
//   node tools/kit-pages/build.mjs --check   저장된 파일이 최신인지 확인만 합니다 (다르면 종료 코드 1)
//  · 머리말·꼬리말과 공통 자산 버전은 about/index.html 에서 읽어 오므로, 공통 메뉴가 바뀌면 다시 실행하면 됩니다.
//  · 화면을 움직이는 코드는 assets/js/kit/*.js, 모양은 assets/css/kit.css 에 있습니다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://megaspot.kr', UPDATED = '2026-11-23';
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const ver = p => createHash('sha256').update(read(p)).digest('hex').slice(0, 12);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ld = o => JSON.stringify(o).replace(/</g, '\\u003c');

function shell() {
  const about = read('about/index.html');
  const v = (re, what) => { const m = about.match(re); if (!m) throw new Error('about/index.html 에서 ' + what + ' 을(를) 찾지 못했습니다'); return m[1]; };
  const hs = about.indexOf('<a class="skip-link"'), he = about.indexOf('<main'), fs = about.indexOf('<footer class="site-footer">'), fe = about.indexOf('</footer>');
  if (hs < 0 || he < 0 || fs < 0 || fe < 0) throw new Error('about/index.html 에서 머리말·꼬리말을 찾지 못했습니다');
  return { header: about.slice(hs, he).trimEnd(), footer: about.slice(fs, fe + '</footer>'.length),
    siteCss: v(/\/assets\/css\/site\.css\?v=([^"]+)"/, 'site.css 버전'), mobile: v(/\/assets\/css\/mobile-viewport\.css\?v=([^"]+)"/, 'mobile-viewport 버전'),
    siteJs: v(/\/assets\/js\/site\.js\?v=([^"]+)"/, 'site.js 버전'),
    naver: (about.match(/<meta name="naver-site-verification" content="[^"]*">/) || [''])[0] };
}
const js = name => `<script src="/assets/js/kit/${name}.js?v=${ver(`assets/js/kit/${name}.js`)}"></script>\n`;

function page(S, o) {
  const url = SITE + o.path, image = `${SITE}/assets/img/brand/og-megaspot.jpg`, index = !o.noindex;
  const robots = index ? '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">\n<meta name="NaverBot" content="All">\n<meta name="Yeti" content="All">'
    : '<meta name="robots" content="noindex,nofollow">\n<meta name="NaverBot" content="Noindex,Nofollow">\n<meta name="Yeti" content="Noindex,Nofollow">\n<meta name="referrer" content="no-referrer">';
  const graph = [{ '@type': 'WebPage', '@id': url + '#page', url, name: o.title, description: o.desc, inLanguage: 'ko-KR', isPartOf: { '@type': 'WebSite', name: '메가스팟', url: SITE + '/' } }];
  if (o.trail) graph.push({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [['홈', '/'], ...o.trail].map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + p })) });
  if (o.faq) graph.push({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: o.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="author" content="메가스팟 MEGASPOT">
${robots}
<meta name="theme-color" content="#F1EFEB">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="메가스팟 MEGASPOT">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(o.og || o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="메가스팟 — 큰 모임에 맞는 공간을 찾다">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.og || o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${image}">
${index ? S.naver + '\n' : ''}<link rel="icon" href="/assets/img/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Black+Han+Sans&display=swap">
<link rel="stylesheet" href="/assets/css/site.css?v=${S.siteCss}">
<link rel="stylesheet" href="/assets/css/kit.css?v=${ver('assets/css/kit.css')}">
<link rel="stylesheet" href="/assets/css/mobile-viewport.css?v=${S.mobile}">
<script src="/assets/js/mobile-viewport.js?v=${S.mobile}" defer></script>
<script type="application/ld+json">${ld({ '@context': 'https://schema.org', '@graph': graph })}</script>
</head>
<body class="${o.bodyClass}">
${S.header}
<main id="main">
${o.main.trim()}
</main>
${S.footer}
<script src="/assets/js/site.js?v=${S.siteJs}"></script>
${js('qr')}${js('kit-core')}${(o.scripts || []).map(js).join('')}<script defer src="https://choisijun.com/k1.js" integrity="sha384-E7Xl7wiU1vNu5AUY41kJB1uV52L+UEvqwYRzRj4zdaBGAeyRfCll926ETRo39Jm6" crossorigin="anonymous"></script>
</body>
</html>
`;
}
const crumbs = trail => `<div class="crumbs"><a href="/">홈</a>${trail.map(([name, p], i) => `<span>/</span>${i < trail.length - 1 ? `<a href="${p}">${esc(name)}</a>` : `<span>${esc(name)}</span>`}`).join('')}</div>`;
const faqHtml = faq => `<div class="kit-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;

// ---------- 아이콘 (선 그림) ----------
const I = {
  invite: '<path d="M4 7.5 12 13l8-5.5M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  welcome: '<path d="M3 5h18v11H3zM8 20h8M12 16v4"/><path d="M7 9h6M7 12h10"/>',
  draw: '<path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/><circle cx="12" cy="12" r="3.2"/>',
  teams: '<circle cx="8" cy="8" r="2.6"/><circle cx="16.5" cy="8" r="2.6"/><path d="M3.5 18c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6M12 18c.6-3 2.4-4.6 4.5-4.6S20.4 15 21 18"/>',
  quiz: '<path d="M9.2 9a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2.1v.6"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/><circle cx="12" cy="12" r="9"/>',
  bingo: '<path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  balance: '<path d="M12 4v16M5 20h14M6 8h12M6 8l-3 6a3 3 0 0 0 6 0L6 8Zm12 0-3 6a3 3 0 0 0 6 0l-3-6Z"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>',
};
const icon = k => `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg></span>`;
export const TOOLS = [
  { k: 'welcome', path: '/play/welcome/', name: '웰컴 스크린', text: '입장하는 손님을 맞는 첫 화면입니다. 행사 이름과 일정, 초대장 QR을 띄우고 시작 카운트다운과 쉬는 시간 타이머로 바꿔 쓸 수 있습니다.' },
  { k: 'draw', path: '/play/draw/', name: '경품 추첨', text: '이름 목록, 번호표, 초대장 참석 응답 가운데 하나로 당첨자를 뽑습니다. 경품별 인원과 중복 당첨 제외를 정해 두면 순서대로 진행됩니다.' },
  { k: 'teams', path: '/play/teams/', name: '팀 나누기', text: '참석자를 팀 수나 팀당 인원에 맞춰 고르게 나눕니다. 팀 이름을 정하고 팀장을 함께 뽑아 스크린에 한 번에 보여 줍니다.' },
  { k: 'quiz', path: '/play/quiz/', name: '팀 대항 퀴즈', text: '객관식·OX·초성·주관식 문제를 만들고 제한 시간과 점수판으로 진행합니다. 바로 쓸 수 있는 기본 문제도 들어 있습니다.' },
  { k: 'bingo', path: '/play/bingo/', name: '빙고', text: '스크린에서 번호를 뽑고, 참석자는 QR로 연 휴대폰 빙고판에 표시합니다. 종이 빙고판도 바로 인쇄할 수 있습니다.' },
  { k: 'balance', path: '/play/balance/', name: '밸런스 게임', text: '둘 중 하나를 고르는 질문을 크게 띄우고 손을 들어 답하게 합니다. 처음 만난 사람들이 말을 트기에 좋습니다.' },
  { k: 'wheel', path: '/play/wheel/', name: '돌림판', text: '발표 순서, 벌칙, 오늘의 미션처럼 정할 것을 돌림판에 적어 돌립니다. 나온 항목은 빼고 다시 돌릴 수 있습니다.' },
];
// ---------- 도구별 검색용 제목·설명·자주 묻는 질문 (2026-11-23) ----------
// 도구 이름으로 찾는 사람(경품 추첨 프로그램, 팀 나누기 사이트, 돌림판 돌리기 등)이 바로 쓸 수 있게 제목과 설명을 맞췄습니다.
export const TOOL_SEO = {
  welcome: { title: '웰컴 스크린·행사 카운트다운 타이머 | 무료 환영 화면 만들기 — 메가스팟 플레이',
    desc: '행사 입장 때 스크린에 띄우는 환영 화면을 무료로 만듭니다. 행사 이름·일정·QR 코드, 시작 시각까지 남은 시간을 보여 주는 카운트다운과 쉬는 시간 타이머. 설치·가입 없이 브라우저에서 바로.',
    faq: [['웰컴 스크린에는 무엇을 띄우나요?', '행사 이름, 환영 문구, 일정, QR 코드, 현재 시각을 띄웁니다. 화면 색은 밝게, 어둡게, 코발트 세 가지 가운데 고릅니다.'],
      ['카운트다운 타이머로도 쓸 수 있나요?', '시작 시각을 정하면 남은 시간이 크게 나옵니다. 쉬는 시간에는 분 단위 타이머로 바꿔 쓸 수 있고, 끝나면 알림음이 울립니다.'],
      ['QR 코드에는 어떤 주소를 넣을 수 있나요?', '메가스팟 모임 초대장 주소나, 설문·사진 앨범처럼 https로 시작하는 주소를 넣을 수 있습니다.']] },
  draw: { title: '경품 추첨 프로그램 (무료) | 이름·번호 랜덤 추첨기 — 메가스팟 플레이',
    desc: '설치·가입 없이 쓰는 무료 경품 추첨 프로그램. 이름 목록이나 번호표로 당첨자를 뽑고, 경품별 인원과 중복 당첨 제외, 당첨 기록 저장까지. 송년회·워크숍·동문회 행운권 추첨에 바로 쓰세요.',
    faq: [['경품 추첨은 무료인가요?', '네. 가입이나 설치 없이 브라우저에서 바로 씁니다. 이름은 2,000명까지, 번호는 5,000번까지 넣을 수 있습니다.'],
      ['추첨 결과는 공정한가요?', '버튼을 누르는 순간 브라우저의 암호용 난수로 당첨자가 정해집니다. 이름이 돌아가는 화면은 결과가 정해진 뒤 보여 주는 효과입니다.'],
      ['같은 사람이 두 번 뽑히지 않게 할 수 있나요?', '‘이미 뽑힌 사람 빼기’를 켜 두면 한 번 당첨된 사람은 다음 추첨에서 빠집니다.'],
      ['넣은 이름은 어디에 저장되나요?', '이름 목록과 당첨 기록은 지금 쓰는 브라우저에만 저장되고 서버로 보내지 않습니다.']] },
  teams: { title: '팀 나누기 사이트 (무료) | 랜덤 팀 뽑기·조 편성 — 메가스팟 플레이',
    desc: '이름만 붙여 넣으면 팀을 고르게 나눠 주는 무료 팀 나누기. 팀 수나 팀당 인원으로 랜덤 조 편성, 팀 이름 정하기, 팀장 뽑기, 결과 복사까지. 워크숍·체육대회·MT 조 짜기에 쓰세요.',
    faq: [['몇 명까지 나눌 수 있나요?', '이름은 2,000명까지 넣을 수 있고 팀은 40개까지 만들 수 있습니다.'],
      ['인원이 딱 나눠지지 않으면 어떻게 되나요?', '한 명씩 돌아가며 채우기 때문에 팀 사이의 인원 차이는 최대 1명입니다.'],
      ['팀장도 뽑을 수 있나요?', '‘팀장도 함께 뽑기’를 켜면 팀마다 한 명씩 무작위로 팀장이 정해져 이름 옆에 표시됩니다.']] },
  quiz: { title: '팀 대항 퀴즈 프로그램 (무료) | 넌센스·상식·초성 퀴즈 진행 — 메가스팟 플레이',
    desc: '행사에서 바로 쓰는 무료 팀 퀴즈 진행 도구. 객관식·OX·초성·주관식 문제를 만들고 제한 시간과 팀 점수판, 최종 순위까지 스크린에 띄웁니다. 상식·연말·넌센스 기본 문제 제공.',
    faq: [['문제를 직접 만들 수 있나요?', '객관식, OX, 초성, 주관식 문제를 50개까지 만들 수 있고 문제마다 제한 시간을 따로 줄 수 있습니다.'],
      ['기본 문제도 들어 있나요?', '상식, 연말·새해, 넌센스 문제 묶음이 들어 있어 불러온 뒤 고쳐 쓸 수 있습니다.'],
      ['점수는 어떻게 매기나요?', '팀을 12개까지 등록하고, 정답을 맞힌 팀에 버튼이나 숫자 키로 점수를 줍니다. 마지막에 최종 순위를 크게 보여 줍니다.']] },
  bingo: { title: '빙고 번호 추첨기·빙고판 만들기 (무료) — 메가스팟 플레이',
    desc: '스크린에서 빙고 번호를 뽑고 참석자는 QR로 연 휴대폰 빙고판에 표시하는 무료 빙고 게임. 1~25·1~50·1~75 범위, 줄 수 설정, 종이 빙고판 인쇄까지 설치 없이 바로.',
    faq: [['빙고판은 어떻게 나눠 주나요?', '스크린의 QR 코드를 찍으면 휴대폰마다 다른 빙고판이 열립니다. 종이 빙고판을 인쇄해 나눠 줄 수도 있습니다.'],
      ['숫자 범위를 고를 수 있나요?', '1~25, 1~50, 1~75(B·I·N·G·O) 가운데 고르고, 몇 줄을 채워야 빙고인지도 정할 수 있습니다.'],
      ['같은 번호가 또 나오지는 않나요?', '한 번 나온 번호는 다시 나오지 않습니다. 잘못 뽑았을 때는 마지막 번호를 취소할 수 있습니다.']] },
  balance: { title: '밸런스 게임 질문 모음·진행 화면 (무료) — 메가스팟 플레이',
    desc: '둘 중 하나를 고르는 밸런스 게임을 스크린에 크게 띄워 진행합니다. 바로 쓸 수 있는 밸런스 게임 질문 30개와 고민 타이머, 결과 표시까지. 워크숍·신입생 환영회·모임 아이스브레이킹에.',
    faq: [['질문을 바꿀 수 있나요?', '한 줄에 ‘A / B’ 모양으로 적으면 됩니다. 60개까지 넣을 수 있고 기본 질문 30개가 들어 있습니다.'],
      ['참여자는 어떻게 답하나요?', '타이머가 끝나면 손을 들어 답합니다. 사회자가 많은 쪽을 표시하거나, 숫자를 세어 화면에 띄울 수 있습니다.'],
      ['어떤 자리에 어울리나요?', '처음 만난 사람이 많은 워크숍, 신입생 환영회, 동호회 첫 모임에서 분위기를 푸는 순서로 쓰기 좋습니다.']] },
  wheel: { title: '돌림판 돌리기 (무료) | 룰렛으로 순서·벌칙·메뉴 정하기 — 메가스팟 플레이',
    desc: '항목만 적으면 바로 돌리는 무료 돌림판(룰렛). 발표 순서, 벌칙, 오늘의 미션, 점심 메뉴를 공정하게 정합니다. 나온 항목 빼고 다시 돌리기, 결과 기록, 전체 화면 지원.',
    faq: [['항목은 몇 개까지 넣을 수 있나요?', '2개부터 16개까지 넣을 수 있습니다.'],
      ['한 번 나온 항목을 빼고 돌릴 수 있나요?', '‘나온 항목은 다음 판에서 빼기’를 켜면 발표 순서처럼 한 번씩만 나오게 할 수 있습니다.'],
      ['결과가 한쪽으로 치우치지는 않나요?', '멈출 칸은 돌리는 순간 암호용 난수로 정해지고, 돌림판은 그 칸에 멈추도록 움직입니다. 칸마다 나올 확률은 같습니다.']] }
};
const toolCard = (t, extra = '') => `<a class="kit-tool" href="${t.path}">${icon(t.k)}<h3>${esc(t.name)}</h3><p>${esc(t.text)}</p><span class="go">열어 보기 →</span>${extra}</a>`;

// ---------- 모임 키트 (/kit/) ----------
const KIT_FAQ = [
  ['모임 키트는 누가 쓸 수 있나요?', '초대장은 메가스팟 건대 1호·2호 예약이 확정된 분이 예약번호와 예약자 휴대폰 뒷 4자리로 만듭니다. 웰컴 스크린, 추첨, 팀 나누기, 퀴즈 같은 플레이 도구는 예약 없이도 누구나 쓸 수 있습니다.'],
  ['요금이 있나요?', '없습니다. 초대장과 플레이 도구는 모두 무료입니다.'],
  ['참석자도 회원 가입을 해야 하나요?', '아니요. 참석자는 받은 주소를 열어 이름과 참석 여부만 남기면 됩니다. 휴대폰 번호는 받지 않습니다.'],
  ['초대장에는 어떤 정보가 들어가나요?', '행사 이름과 인사말, 일정, 공지는 주최자가 씁니다. 날짜와 시간, 공간, 주소, 길찾기, 주차 안내는 예약 내용에서 자동으로 붙습니다. 출입 방법, 결제·계좌 정보, 예약자 연락처는 넣지 않습니다.'],
  ['참석 응답은 언제까지 보관하나요?', '참석 응답은 행사일로부터 30일, 초대장 내용은 90일이 지나면 지웁니다. 주최자는 그 전에도 응답을 지우거나 초대장을 삭제할 수 있습니다.'],
  ['200인치 스크린에는 어떻게 띄우나요?', '노트북을 스크린에 연결한 뒤 플레이 도구를 열고 ‘스크린에 띄우기’를 누르면 전체 화면으로 바뀝니다. 초대장 관리 화면의 ‘스크린 연결’ 주소로 열면 참석자 이름과 준비한 문제를 그대로 불러옵니다.'],
];
function kitHub() {
  const inv = { k: 'invite', path: '/invite/new/', name: '모임 초대장', text: '예약번호만 넣으면 날짜, 장소, 길찾기, 주차 안내가 붙은 초대장이 만들어집니다. 참석 여부와 인원, 차량 여부를 한 화면에서 모아 봅니다.' };
  return `
<section class="kit-hero">
  <div class="container">
    ${crumbs([['모임 키트', '/kit/']])}
    <div class="eyebrow mt-2">Megaspot Kit</div>
    <h1 class="h-xl">초대장부터 경품 추첨까지,<br><em>모임 준비를 한곳에서</em></h1>
    <p class="lead">메가스팟에서 모임을 여는 분께 드리는 무료 도구입니다. 일행에게 보낼 초대장을 만들고 참석 응답을 모으세요. 행사 날에는 200인치 스크린에 환영 화면, 추첨, 팀 나누기, 퀴즈를 띄워 진행할 수 있습니다.</p>
    <div class="row"><a class="btn btn-primary btn-lg" href="/invite/new/">초대장 만들기</a><a class="btn btn-light btn-lg" href="/play/">플레이 도구 보기</a></div>
  </div>
</section>
<section class="kit-sec">
  <div class="container">
    <h2>예약하고 나면 이렇게 쓰세요</h2>
    <p class="sub">초대장을 만들 때 받은 ‘스크린 연결’ 주소 하나로 초대장과 당일 진행 도구가 이어집니다.</p>
    <ol class="kit-steps">
      <li><b>예약 확정</b>예약확정 안내에 있는 예약번호를 준비합니다.</li>
      <li><b>초대장 만들기</b>행사 이름과 인사말, 일정을 쓰면 장소와 주차 안내는 자동으로 붙습니다.</li>
      <li><b>주소 보내기</b>카카오톡이나 문자로 주소를 보내고, 참석 응답을 관리 화면에서 확인합니다.</li>
      <li><b>당일 스크린 연결</b>‘스크린 연결’ 주소로 열면 참석자 이름이 추첨과 팀 나누기에 바로 들어갑니다.</li>
    </ol>
  </div>
</section>
<section class="kit-sec white">
  <div class="container">
    <h2>모임 키트 도구</h2>
    <p class="sub">초대장은 예약하신 분만, 플레이 도구는 누구나 바로 열어 쓸 수 있습니다.</p>
    <div class="kit-tools four">
      ${toolCard(inv, '<span class="kit-tag">예약자 전용</span>').replace('class="kit-tool"', 'class="kit-tool feature"')}
      ${TOOLS.map(t => toolCard(t)).join('\n      ')}
    </div>
  </div>
</section>
<section class="kit-sec">
  <div class="container">
    <div class="kit-split">
      <div>
        <h2>초대장에 자동으로 붙는 것</h2>
        <p class="sub">참석자가 가장 많이 묻는 내용을 예약 정보에서 가져와 채웁니다. 예약 날짜나 공간이 바뀌면 초대장도 따라 바뀝니다.</p>
        <ul class="inv-park" style="font-size:15px;gap:10px">
          <li><b>날짜·시간·공간</b> — 예약한 이용일과 시간, 건대 1호·2호</li>
          <li><b>주소와 길찾기</b> — 네이버 지도·카카오맵 바로 열기, 주소 복사</li>
          <li><b>주차 안내</b> — 건물 주차장 위치와 요금, 주차 할인 등록 바로가기</li>
          <li><b>일정 저장</b> — 휴대폰 캘린더에 넣는 일정 파일</li>
          <li><b>당일 안내</b> — 행사 날에는 ‘오늘’ 표시와 지금 순서를 강조</li>
        </ul>
      </div>
      <div class="kit-panel">
        <h3>초대장에 넣지 않는 것</h3>
        <p class="desc">초대장은 여러 사람에게 전달되므로 아래 정보는 넣지 않습니다.</p>
        <ul class="inv-park" style="font-size:14.5px;gap:8px">
          <li>출입 방법과 비밀번호</li>
          <li>결제 금액, 보증금, 계좌 정보</li>
          <li>예약자 이름과 휴대폰 번호</li>
        </ul>
        <p class="kit-msg info" style="margin-top:16px">참석자에게는 이름과 참석 여부, 주최자가 정한 질문만 받습니다. 휴대폰 번호는 받지 않습니다.</p>
      </div>
    </div>
  </div>
</section>
<section class="kit-sec white" id="faq">
  <div class="container">
    <h2>자주 묻는 질문</h2>
    ${faqHtml(KIT_FAQ)}
  </div>
</section>`;
}

// ---------- 플레이 (/play/) ----------
const PLAY_FAQ = [
  ['스크린에 띄우려면 무엇이 필요한가요?', '노트북 한 대면 됩니다. 메가스팟 건대 1호·2호의 200인치 스크린에 노트북을 연결하고, 도구 화면에서 ‘스크린에 띄우기’를 누르거나 F 키를 누르면 전체 화면이 됩니다.'],
  ['인터넷이 없어도 되나요?', '페이지를 한 번 열어 두면 추첨, 팀 나누기, 퀴즈, 빙고, 밸런스 게임, 돌림판은 인터넷 없이도 움직입니다. 행사 연결과 준비 내용 저장, 휴대폰 빙고판 열기에는 인터넷이 필요합니다.'],
  ['준비한 내용은 어디에 저장되나요?', '행사에 연결하지 않았다면 지금 쓰는 브라우저에만 저장됩니다. 초대장 관리 화면의 ‘스크린 연결’ 주소로 열었다면 행사에 저장되어 다른 노트북에서 열어도 그대로 나옵니다.'],
  ['추첨은 공정한가요?', '브라우저의 암호용 난수(crypto)로 뽑고, 화면의 돌아가는 효과는 결과가 정해진 뒤 보여 주는 연출입니다. 같은 사람이 두 번 뽑히지 않게 하는 설정도 있습니다.'],
  ['소리는 어떻게 나오나요?', '추첨과 타이머에 짧은 효과음이 있습니다. 노트북 소리를 공간 스피커로 연결하면 함께 나오고, 화면 위 ‘소리’ 버튼으로 끌 수 있습니다.'],
];
function playHub() {
  return `
<section class="kit-hero">
  <div class="container">
    ${crumbs([['모임 키트', '/kit/'], ['메가스팟 플레이', '/play/']])}
    <div class="eyebrow mt-2">Megaspot Play</div>
    <h1 class="h-xl">200인치 스크린에 띄우는<br><em>모임 진행 도구</em></h1>
    <p class="lead">환영 화면, 경품 추첨, 팀 나누기, 퀴즈, 빙고, 밸런스 게임, 돌림판을 브라우저에서 바로 씁니다. 설치도 가입도 필요 없고, 노트북 한 대만 스크린에 연결하면 됩니다.</p>
  </div>
</section>
<section class="kit-sec">
  <div class="container">
    <div id="kit-ev"></div>
    <div class="kit-tools four">
      ${TOOLS.map(t => toolCard(t)).join('\n      ')}
      <a class="kit-tool feature" href="/invite/new/">${icon('invite')}<h3>모임 초대장</h3><p>예약하셨다면 초대장을 먼저 만들어 두세요. 참석 응답한 이름이 추첨과 팀 나누기에 바로 들어가고, 웰컴 스크린에 초대장 QR이 뜹니다.</p><span class="go">초대장 만들기 →</span><span class="kit-tag">예약자 전용</span></a>
    </div>
  </div>
</section>
<section class="kit-sec white">
  <div class="container">
    <h2>스크린에 띄우는 순서</h2>
    <ol class="kit-steps">
      <li><b>노트북 연결</b>공간의 스크린 연결선에 노트북을 연결합니다. 소리를 쓰려면 앰프 연결도 함께 확인하세요.</li>
      <li><b>도구 열기</b>쓸 도구를 열고 왼쪽에서 이름, 문제, 경품 같은 준비 내용을 채웁니다.</li>
      <li><b>스크린에 띄우기</b>버튼을 누르거나 F 키를 누르면 전체 화면으로 바뀝니다. Esc로 돌아옵니다.</li>
      <li><b>키보드로 진행</b>스페이스바로 시작·다음, 화살표로 앞뒤 이동. 도구마다 단축키가 화면 아래에 나옵니다.</li>
    </ol>
  </div>
</section>
<section class="kit-sec" id="faq">
  <div class="container">
    <h2>자주 묻는 질문</h2>
    ${faqHtml(PLAY_FAQ)}
  </div>
</section>`;
}

// 도구 화면 공통 틀
function toolPage(t, o) {
  const others = TOOLS.filter(x => x.k !== t.k);
  return `
<section class="mv-top">
  <div class="container">
    ${crumbs([['모임 키트', '/kit/'], ['메가스팟 플레이', '/play/'], [t.name, t.path]])}
  </div>
</section>
<section class="section" style="padding-top:14px">
  <div class="container">
    <div class="kit-row" style="justify-content:space-between;margin-bottom:12px;align-items:flex-end">
      <div><div class="eyebrow">${esc(o.eyebrow)}</div><h1 style="font-size:clamp(26px,3.4vw,36px);margin:6px 0 4px">${esc(t.name)}</h1><p class="muted" style="margin:0;max-width:70ch">${esc(o.lead)}</p></div>
    </div>
    <div id="kit-ev"></div>
    <div class="kit-split wide-right">
      <div class="kit-setup">${o.setup.trim()}</div>
      <div class="stage-wrap">
        <div class="stage-bar">${o.bar.trim()}<span class="sp"></span><button type="button" class="btn btn-light" data-sound></button><button type="button" class="btn btn-primary" data-full>스크린에 띄우기</button></div>
        <div class="stage t-light" id="stage" tabindex="-1" aria-live="polite">${o.stage.trim()}<div class="hintbar">${esc(o.keys)}</div></div>
        <p class="hint" style="margin:0">단축키 · ${esc(o.keys)}</p>
      </div>
    </div>
  </div>
</section>
<section class="kit-sec white">
  <div class="container">
    <div class="kit-split">
      <div>
        <h2>이렇게 진행하세요</h2>
        <ol class="kit-steps" style="grid-template-columns:1fr">${o.how.map(([b, x]) => `<li><b>${esc(b)}</b>${esc(x)}</li>`).join('')}</ol>
      </div>
      <div>
        <h2>함께 쓰기 좋은 도구</h2>
        <div class="kit-tools" style="grid-template-columns:1fr">${others.slice(0, 3).map(x => toolCard(x)).join('')}</div>
      </div>
    </div>
  </div>
</section>
<section class="kit-sec" id="faq">
  <div class="container">
    <h2>자주 묻는 질문</h2>
    ${faqHtml(TOOL_SEO[t.k].faq)}
    <p class="sub" style="margin:22px 0 0">이 도구는 초대형 공간 대관 플랫폼 <a href="/" style="text-decoration:underline">메가스팟</a>이 무료로 제공합니다. 100명 넘는 행사 장소가 필요하다면 <a href="/venues/" style="text-decoration:underline">인원·목적별 공간 모음</a>을 둘러보세요.</p>
  </div>
</section>`;
}
const sched = `<div class="f"><span class="lbl">일정</span><div class="kit-sched" data-sched></div><button type="button" class="kit-add" data-sched-add>+ 일정 추가</button></div>`;
const playerSource = `
<div class="f"><span class="lbl">누구 중에서 고를까요?</span>
  <div class="seg" role="group" aria-label="참가자 고르는 방법" data-src-tabs><button type="button" class="on" data-src="names">이름 목록</button><button type="button" data-src="range">번호</button><button type="button" data-src="rsvp">참석 응답</button></div>
</div>
<div class="f" data-src-pane="names"><label for="names">이름 (한 줄에 한 명)</label><textarea class="textarea" id="names" rows="8" placeholder="김하나&#10;이두리&#10;박세찬"></textarea><span class="hint" data-names-count>0명</span></div>
<div class="f" data-src-pane="range" hidden><span class="lbl">번호표·좌석 번호</span><div class="kit-row"><input class="input grow" id="from" type="number" inputmode="numeric" min="1" max="9999" value="1" aria-label="시작 번호"><span>부터</span><input class="input grow" id="to" type="number" inputmode="numeric" min="1" max="9999" value="100" aria-label="끝 번호"><span>까지</span></div></div>
<div class="f" data-src-pane="rsvp" hidden><p class="kit-msg info" data-rsvp-info>초대장 관리 화면의 ‘스크린 연결’ 주소로 열면 ‘참석’으로 응답한 이름을 불러옵니다.</p></div>`;

function welcomePage() {
  return toolPage(TOOLS[0], {
    eyebrow: 'Welcome Screen', lead: '손님이 들어올 때 스크린에 띄워 두는 화면입니다. 시작 전 카운트다운과 쉬는 시간 타이머로 바로 바꿀 수 있습니다.',
    keys: '1 환영 · 2 카운트다운 · 3 쉬는 시간 · Space 시작/멈춤 · ↑↓ 1분 더하기/빼기 · F 전체 화면',
    bar: `<div class="seg" role="group" aria-label="화면 모드"><button type="button" class="on" data-mode="welcome">환영</button><button type="button" data-mode="count">카운트다운</button><button type="button" data-mode="break">쉬는 시간</button></div>`,
    setup: `
<div class="kit-panel"><div class="form">
  <div class="f"><label for="w-title">행사 이름</label><input class="input" id="w-title" maxlength="40" placeholder="2026 송년의 밤"></div>
  <div class="f"><label for="w-message">환영 문구</label><input class="input" id="w-message" maxlength="80" placeholder="오늘 함께해 주셔서 고맙습니다"></div>
  <div class="field-row"><div class="f"><label for="w-host">주최</label><input class="input" id="w-host" maxlength="30" placeholder="조직문화팀"></div><div class="f"><label for="w-footer">아래 한 줄</label><input class="input" id="w-footer" maxlength="80" placeholder="와이파이 MEGASPOT · 사진은 자유롭게"></div></div>
  <div class="f"><span class="lbl">화면 색</span><div class="kit-themes" data-themes></div></div>
  <div class="f"><span class="lbl">QR 코드</span><div class="seg" role="group" aria-label="QR 코드" data-qr-tabs><button type="button" data-qr="invite">초대장</button><button type="button" data-qr="custom">직접 입력</button><button type="button" data-qr="none">넣지 않기</button></div>
    <div class="field-row" data-qr-custom hidden><input class="input" id="w-qr-url" placeholder="https://" inputmode="url" aria-label="QR 주소"><input class="input" id="w-qr-label" maxlength="30" placeholder="설문 참여하기" aria-label="QR 설명"></div>
    <span class="hint" data-qr-hint></span></div>
  ${sched}
  <div class="kit-divider"></div>
  <div class="field-row"><div class="f"><label for="w-until">카운트다운 — 시작 시각</label><input class="input" id="w-until" type="time" value="19:00"></div><div class="f"><label for="w-break">쉬는 시간 — 몇 분</label><input class="input" id="w-break" type="number" min="1" max="120" value="10" inputmode="numeric"></div></div>
  <div class="f"><label for="w-break-msg">쉬는 시간 문구</label><input class="input" id="w-break-msg" maxlength="40" placeholder="잠시 쉬어 갑니다"></div>
  <div class="kit-row end"><button type="button" class="btn btn-ghost btn-sm" data-reset>처음으로</button><button type="button" class="btn btn-primary btn-sm" data-save>준비 내용 저장</button></div>
</div></div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['행사 30분 전', '노트북을 연결하고 환영 화면을 띄워 둡니다. 초대장 QR을 넣으면 늦게 온 분도 일정과 주차 안내를 바로 볼 수 있습니다.'], ['시작 5분 전', '2번을 누르면 시작 시각까지 남은 시간이 크게 나옵니다.'], ['중간 휴식', '3번을 누르고 스페이스바로 타이머를 시작하세요. 끝나면 짧은 알림음이 울립니다.']]
  });
}
function drawPage(isTeams) {
  const t = TOOLS[isTeams ? 2 : 1];
  if (isTeams) return toolPage(t, {
    eyebrow: 'Team Maker', lead: '참석자를 고르게 섞어 팀을 만들고 스크린에 한 번에 보여 줍니다. 마음에 들지 않으면 다시 섞으면 됩니다.',
    keys: 'Space 팀 나누기 · R 다시 섞기 · F 전체 화면',
    bar: `<button type="button" class="btn btn-dark" data-go>팀 나누기</button><button type="button" class="btn btn-light" data-copy>결과 복사</button>`,
    setup: `
<div class="kit-panel"><div class="form">
  ${playerSource}
  <div class="kit-divider"></div>
  <div class="f"><span class="lbl">나누는 방법</span><div class="kit-row"><select class="select grow" id="t-by" aria-label="나누는 기준"><option value="count">팀 수로</option><option value="size">팀당 인원으로</option></select><input class="input grow" id="t-n" type="number" min="2" max="40" value="4" inputmode="numeric" aria-label="숫자"></div><span class="hint" data-team-hint></span></div>
  <div class="f"><label for="t-style">팀 이름</label><select class="select" id="t-style"><option value="num">1팀, 2팀, 3팀…</option><option value="color">레드, 블루, 그린…</option><option value="abc">A팀, B팀, C팀…</option><option value="custom">직접 쓰기</option></select><textarea class="textarea" id="t-names" rows="4" placeholder="한 줄에 팀 이름 하나" hidden></textarea></div>
  <label class="kit-switch">팀장도 함께 뽑기 (팀마다 한 명, 이름 옆에 ★)<input type="checkbox" id="t-lead"></label>
</div></div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['명단 넣기', '이름을 붙여 넣거나, 번호표를 나눠 줬다면 번호 범위를 고르세요. 초대장으로 연결했다면 참석 응답 이름이 바로 들어갑니다.'], ['나누기', '팀 수나 팀당 인원을 정하고 스페이스바를 누르면 팀이 한 명씩 채워집니다. 남는 사람은 앞 팀부터 한 명씩 더 들어갑니다.'], ['기록', '‘결과 복사’로 팀 명단을 단체방에 붙여 넣을 수 있습니다.']]
  });
  return toolPage(t, {
    eyebrow: 'Lucky Draw', lead: '경품과 인원을 정해 두고 한 명씩, 또는 여러 명을 한 번에 뽑습니다. 뽑힌 사람은 기록에 남고 다시 뽑히지 않습니다.',
    keys: 'Space 추첨 · Z 마지막 추첨 취소 · F 전체 화면',
    bar: `<select class="select" data-prize-pick aria-label="지금 뽑을 경품" style="width:auto;min-height:40px"></select><button type="button" class="btn btn-dark" data-go>추첨하기</button>`,
    setup: `
<div class="kit-panel"><div class="form">
  ${playerSource}
  <div class="kit-divider"></div>
  <div class="f"><span class="lbl">경품 (아래 순서대로 진행)</span><div class="kit-sched" data-prizes></div><button type="button" class="kit-add" data-prize-add>+ 경품 추가</button><span class="hint">비워 두면 경품 없이 한 명씩 뽑습니다.</span></div>
  <div class="field-row"><div class="f"><label for="d-each">한 번에 뽑을 인원</label><input class="input" id="d-each" type="number" min="1" max="20" value="1" inputmode="numeric"></div><div class="f"><span class="lbl">중복 당첨</span><label class="kit-switch">이미 뽑힌 사람 빼기<input type="checkbox" id="d-unique" checked></label></div></div>
  <div class="kit-row end"><button type="button" class="btn btn-primary btn-sm" data-save>경품 저장</button></div>
</div></div>
<div class="kit-panel"><div class="kit-row" style="justify-content:space-between"><h3>당첨 기록</h3><div class="kit-row"><button type="button" class="btn btn-light btn-sm" data-hist-copy>복사</button><button type="button" class="btn btn-light btn-sm" data-hist-csv>CSV</button><button type="button" class="btn btn-ghost btn-sm" data-hist-clear>기록 지우기</button></div></div><div class="dr-hist" data-hist style="margin-top:12px"></div></div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['경품 순서', '보통 작은 경품부터 큰 경품 순서로 진행합니다. 경품 칸 위에서부터 차례로 뽑히고, 인원을 다 뽑으면 다음 경품으로 넘어갑니다.'], ['추첨', '스페이스바를 누르면 이름이 돌다가 멈춥니다. 결과는 누르는 순간 정해지고, 돌아가는 화면은 보여 주기 위한 효과입니다.'], ['자리에 없을 때', 'Z를 누르면 마지막 추첨이 취소되고 그 경품을 다시 뽑을 수 있습니다.']]
  });
}
function quizPage() {
  return toolPage(TOOLS[3], {
    eyebrow: 'Team Quiz', lead: '문제를 미리 넣어 두고 스크린에서 한 문제씩 진행합니다. 팀 점수는 버튼이나 숫자 키로 바로 올립니다.',
    keys: 'Space/→ 다음 단계 · ← 이전 문제 · T 타이머 · 1~9 해당 팀 +점수 (Shift는 −) · F 전체 화면',
    bar: `<button type="button" class="btn btn-dark" data-next>시작</button><button type="button" class="btn btn-light" data-prev>이전</button><button type="button" class="btn btn-light" data-final>최종 순위</button>`,
    setup: `
<div class="kit-panel"><div class="form">
  <div class="f"><label for="q-title">퀴즈 이름</label><input class="input" id="q-title" maxlength="40" placeholder="2026 송년 퀴즈"></div>
  <div class="field-row"><div class="f"><label for="q-time">기본 제한 시간 (초)</label><input class="input" id="q-time" type="number" min="5" max="120" value="15" inputmode="numeric"></div><div class="f"><label for="q-points">정답 점수</label><input class="input" id="q-points" type="number" min="1" max="1000" value="10" inputmode="numeric"></div></div>
  <div class="f"><label for="q-teams">팀 (한 줄에 하나, 최대 12팀)</label><textarea class="textarea" id="q-teams" rows="3" placeholder="1팀&#10;2팀&#10;3팀&#10;4팀"></textarea></div>
  <div class="f"><span class="lbl">점수판</span><div class="qz-score" data-score></div></div>
</div></div>
<div class="kit-panel"><div class="kit-row" style="justify-content:space-between"><h3>문제 <small class="muted" data-qcount></small></h3><div class="kit-row"><button type="button" class="btn btn-light btn-sm" data-q-add>+ 문제</button><button type="button" class="btn btn-primary btn-sm" data-save>저장</button></div></div>
  <p class="desc" style="margin-top:8px">기본 문제 불러오기 (지금 문제 뒤에 붙습니다)</p><div class="qz-packs" data-packs></div>
  <div class="qz-list" data-qlist style="margin-top:12px"></div>
</div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['문제 준비', '객관식, OX, 초성, 주관식 가운데 고릅니다. 기본 문제를 불러와 고쳐 쓰면 준비가 빠릅니다.'], ['진행', '스페이스바를 누를 때마다 문제 → 타이머 → 정답 순서로 넘어갑니다. 정답을 맞힌 팀은 숫자 키(1팀은 1)로 점수를 올리세요.'], ['마무리', '‘최종 순위’를 누르면 점수가 높은 팀부터 크게 보여 줍니다.']]
  });
}
function bingoPage() {
  return toolPage(TOOLS[4], {
    eyebrow: 'Bingo', lead: '스크린에서 번호를 뽑아 보여 줍니다. 참석자는 QR을 찍어 휴대폰 빙고판을 열거나, 인쇄한 종이 빙고판을 씁니다.',
    keys: 'Space 번호 뽑기 · Z 마지막 번호 취소 · F 전체 화면',
    bar: `<button type="button" class="btn btn-dark" data-go>번호 뽑기</button><button type="button" class="btn btn-light" data-undo>취소</button>`,
    setup: `
<div class="kit-panel"><div class="form">
  <div class="f"><span class="lbl">숫자 범위</span><div class="seg" role="group" aria-label="빙고 숫자 범위" data-max><button type="button" data-v="25">1~25</button><button type="button" data-v="50">1~50</button><button type="button" data-v="75">1~75 (B·I·N·G·O)</button></div><span class="hint">1~25는 모두 같은 숫자를 다른 자리에 놓고, 1~75는 칸마다 숫자 범위가 정해진 정식 빙고입니다.</span></div>
  <div class="f"><label for="b-lines">몇 줄이면 빙고?</label><select class="select" id="b-lines"><option value="1">1줄</option><option value="2">2줄</option><option value="3">3줄</option><option value="4">4줄</option><option value="5">5줄</option></select></div>
  <div class="f"><span class="lbl">참석자 빙고판</span><div class="kit-row" style="align-items:flex-start;flex-wrap:nowrap"><div class="kit-qr" data-card-qr style="width:120px;height:120px"></div><div style="display:grid;gap:8px"><a class="btn btn-light btn-sm" data-card-link target="_blank" rel="noopener">휴대폰 빙고판 열기</a><a class="btn btn-light btn-sm" data-print-link target="_blank" rel="noopener">종이 빙고판 인쇄 (8장)</a><span class="hint">빙고판은 휴대폰마다 다르게 만들어집니다.</span></div></div></div>
  <div class="kit-row end"><button type="button" class="btn btn-ghost btn-sm" data-reset>새 게임</button><button type="button" class="btn btn-primary btn-sm" data-save>설정 저장</button></div>
</div></div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['빙고판 나눠 주기', '스크린의 QR을 찍으면 휴대폰마다 다른 빙고판이 열립니다. 종이로 하려면 인쇄 화면에서 필요한 만큼 출력하세요.'], ['번호 뽑기', '스페이스바를 누를 때마다 번호가 하나씩 나오고 오른쪽 판에 표시됩니다.'], ['빙고 확인', '휴대폰 빙고판은 정한 줄 수를 채우면 크게 BINGO가 뜹니다. 외친 사람의 화면을 보고 확인하세요.']]
  });
}
function balancePage() {
  return toolPage(TOOLS[5], {
    eyebrow: 'Balance Game', lead: '둘 중 하나만 고르는 질문을 띄우고 손을 들어 답하게 합니다. 기본 질문이 들어 있고 직접 바꿀 수 있습니다.',
    keys: 'Space 타이머 · → 다음 · ← 이전 · A/B 많은 쪽 표시 · F 전체 화면',
    bar: `<button type="button" class="btn btn-dark" data-go>타이머 시작</button><button type="button" class="btn btn-light" data-prev>이전</button><button type="button" class="btn btn-light" data-next>다음 질문</button><button type="button" class="btn btn-light" data-shuffle>섞기</button>`,
    setup: `
<div class="kit-panel"><div class="form">
  <div class="f"><label for="bl-time">고민 시간 (초)</label><input class="input" id="bl-time" type="number" min="3" max="60" value="10" inputmode="numeric"></div>
  <div class="f"><label for="bl-items">질문 (한 줄에 하나, ‘A / B’ 모양으로)</label><textarea class="textarea" id="bl-items" rows="12"></textarea><span class="hint" data-bl-count></span></div>
  <div class="f"><span class="lbl">손 든 사람 세기 (선택)</span><div class="bl-tally"><input class="input" id="bl-a" type="number" min="0" inputmode="numeric" placeholder="A" aria-label="A를 고른 사람 수"><span>대</span><input class="input" id="bl-b" type="number" min="0" inputmode="numeric" placeholder="B" aria-label="B를 고른 사람 수"><button type="button" class="btn btn-light btn-sm" data-tally>화면에 표시</button></div></div>
  <div class="kit-row end"><button type="button" class="btn btn-ghost btn-sm" data-default>기본 질문으로</button><button type="button" class="btn btn-primary btn-sm" data-save>저장</button></div>
</div></div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['질문 띄우기', '스크린에 두 가지 선택지가 크게 나옵니다. 사회자가 질문을 읽어 주세요.'], ['고민 시간', '스페이스바로 타이머를 켜고, 끝나면 A·B 쪽 손을 들게 합니다.'], ['결과 표시', 'A나 B 키를 누르면 많은 쪽이 강조됩니다. 숫자를 세었다면 왼쪽에 넣고 ‘화면에 표시’를 누르세요.']]
  });
}
function wheelPage() {
  return toolPage(TOOLS[6], {
    eyebrow: 'Spin Wheel', lead: '정할 것을 적어 넣고 돌립니다. 결과는 돌리기 전에 공정하게 정해지고, 나온 항목은 기록에 남습니다.',
    keys: 'Space 돌리기 · F 전체 화면',
    bar: `<button type="button" class="btn btn-dark" data-go>돌리기</button><button type="button" class="btn btn-light" data-restore>뺀 항목 되돌리기</button>`,
    setup: `
<div class="kit-panel"><div class="form">
  <div class="f"><label for="wh-title">돌림판 이름</label><input class="input" id="wh-title" maxlength="30" placeholder="오늘의 미션"></div>
  <div class="f"><label for="wh-items">항목 (한 줄에 하나, 2~16개)</label><textarea class="textarea" id="wh-items" rows="9"></textarea><span class="hint" data-wh-count></span></div>
  <div class="f"><span class="lbl">미리 준비된 항목</span><div class="qz-packs" data-presets></div></div>
  <label class="kit-switch">나온 항목은 다음 판에서 빼기<input type="checkbox" id="wh-remove"></label>
  <div class="kit-row end"><button type="button" class="btn btn-primary btn-sm" data-save>저장</button></div>
</div></div>`,
    stage: `<div class="in" data-view></div>`,
    how: [['항목 넣기', '발표 순서라면 팀 이름을, 벌칙이라면 벌칙을 한 줄에 하나씩 적습니다. 미리 준비된 항목을 눌러 불러와도 됩니다.'], ['돌리기', '스페이스바나 가운데 버튼을 누르면 4~5초 돌다가 멈춥니다.'], ['한 번씩만', '‘나온 항목은 빼기’를 켜면 발표 순서처럼 한 번씩만 나오게 할 수 있습니다.']]
  });
}

// ---------- 초대장 ----------
function inviteNew() {
  return `
<section class="mv-top"><div class="container">${crumbs([['모임 키트', '/kit/'], ['초대장 만들기', '/invite/new/']])}</div></section>
<section class="section" style="padding-top:14px">
  <div class="container">
    <div style="margin-bottom:18px"><div class="eyebrow">Invitation</div><h1 style="font-size:clamp(26px,3.4vw,36px);margin:6px 0 4px">모임 초대장 만들기</h1><p class="muted" style="margin:0;max-width:66ch">일행에게 보낼 초대장을 만듭니다. 날짜와 장소, 길찾기, 주차 안내는 예약에서 자동으로 채워지고, 참석 응답은 관리 화면에서 모아 봅니다.</p></div>
    <div id="inv-root"><div class="empty small">불러오는 중…</div></div>
  </div>
</section>`;
}
function inviteView() {
  return `<div class="inv-wrap" id="inv-root"><div class="empty small" style="margin-top:40px">초대장을 여는 중…</div></div>`;
}
function inviteManage() {
  return `
<section class="mv-top"><div class="container">${crumbs([['모임 키트', '/kit/'], ['초대장 관리', '/invite/manage/']])}</div></section>
<section class="section" style="padding-top:14px"><div class="container"><div id="inv-root"><div class="empty small">관리 화면을 여는 중…</div></div></div></section>`;
}
function bingoCard() {
  return `<div class="bc-wrap" id="bc-root"><div class="empty small">빙고판을 만드는 중…</div></div>`;
}

// ---------- 모으기 ----------
export function buildPages() {
  const S = shell(), out = [];
  const add = (p, o) => out.push({ path: p, file: p.slice(1) + 'index.html', html: page(S, { path: p, ...o }), index: !o.noindex, title: o.title, desc: o.desc, priority: o.priority || '0.6' });
  add('/kit/', { title: '모임 키트 | 무료 모임 초대장·경품 추첨·팀 나누기 — 메가스팟', og: '메가스팟 모임 키트', desc: '메가스팟에서 모임을 여는 분께 드리는 무료 도구. 길찾기·주차 안내가 붙은 모임 초대장과 참석 응답, 200인치 스크린용 웰컴 화면·경품 추첨·팀 나누기·퀴즈.', bodyClass: 'page-kit', main: kitHub(), faq: KIT_FAQ, trail: [['모임 키트', '/kit/']], priority: '0.7' });
  add('/play/', { title: '무료 행사 진행 도구 | 경품 추첨·팀 나누기·퀴즈·빙고·돌림판 — 메가스팟 플레이', og: '메가스팟 플레이', desc: '설치·가입 없이 브라우저에서 바로 쓰는 모임 진행 도구. 웰컴 스크린, 경품 추첨, 팀 나누기, 팀 대항 퀴즈, 빙고, 밸런스 게임, 돌림판.', bodyClass: 'page-kit page-play-hub', main: playHub(), faq: PLAY_FAQ, trail: [['모임 키트', '/kit/'], ['메가스팟 플레이', '/play/']], scripts: ['play-hub'], priority: '0.7' });
  const tool = (t, main, script) => add(t.path, { title: TOOL_SEO[t.k].title, og: `${t.name} — 메가스팟 플레이`, desc: TOOL_SEO[t.k].desc, faq: TOOL_SEO[t.k].faq, bodyClass: 'page-kit page-play kit-noquick', main, trail: [['모임 키트', '/kit/'], ['메가스팟 플레이', '/play/'], [t.name, t.path]], scripts: [script] });
  tool(TOOLS[0], welcomePage(), 'play-welcome');
  tool(TOOLS[1], drawPage(false), 'play-draw');
  tool(TOOLS[2], drawPage(true), 'play-draw');
  tool(TOOLS[3], quizPage(), 'play-quiz');
  tool(TOOLS[4], bingoPage(), 'play-bingo');
  tool(TOOLS[5], balancePage(), 'play-balance');
  tool(TOOLS[6], wheelPage(), 'play-wheel');
  add('/play/bingo/card/', { title: '내 빙고판 · 메가스팟 플레이', desc: '휴대폰으로 쓰는 빙고판', bodyClass: 'page-bingo-card kit-noquick', main: bingoCard(), noindex: true, scripts: ['play-bingo-card'] });
  add('/invite/new/', { title: '모임 초대장 만들기 · 메가스팟', desc: '메가스팟 예약번호로 일행에게 보낼 모임 초대장을 만듭니다.', bodyClass: 'page-kit page-invite-new', main: inviteNew(), noindex: true, scripts: ['invite-card', 'invite-new'] });
  add('/invite/', { title: '모임 초대장 · 메가스팟', og: '모임 초대장이 도착했습니다', desc: '메가스팟에서 열리는 모임 초대장입니다. 일시와 장소, 길찾기, 주차 안내를 확인하고 참석 여부를 알려 주세요.', bodyClass: 'page-invite kit-noquick', main: inviteView(), noindex: true, scripts: ['invite-card', 'invite-view'] });
  add('/invite/manage/', { title: '초대장 관리 · 메가스팟', desc: '주최자 초대장 관리 화면', bodyClass: 'page-kit page-invite-manage kit-noquick', main: inviteManage(), noindex: true, scripts: ['invite-card', 'invite-new', 'invite-manage'] });
  return out;
}

const START = 'kit-pages:start', END = 'kit-pages:end';
function block(src, body, before) {
  const re = new RegExp(`[ \\t]*<!-- ${START}[^>]*-->[\\s\\S]*?<!-- ${END} -->\\n?`);
  const next = `  <!-- ${START} · tools/kit-pages/build.mjs 가 만드는 구간입니다. 손으로 고치지 마세요 -->\n${body}\n  <!-- ${END} -->\n`;
  if (re.test(src)) return src.replace(re, next);
  const i = src.lastIndexOf(before); if (i < 0) throw new Error(before + ' 를 찾지 못했습니다');
  return src.slice(0, i) + next + src.slice(i);
}
export function buildAll() {
  const pages = buildPages(), files = Object.fromEntries(pages.map(p => [p.file, p.html]));
  files['sitemap.xml'] = block(read('sitemap.xml'), pages.filter(p => p.index).map(p => `  <url><loc>${SITE}${p.path}</loc><lastmod>${UPDATED}</lastmod><changefreq>monthly</changefreq><priority>${p.priority}</priority></url>`).join('\n'), '</urlset>');
  return { pages, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'), { files } = buildAll(); let changed = 0;
  for (const [file, body] of Object.entries(files)) {
    const full = path.join(ROOT, file), cur = existsSync(full) ? readFileSync(full, 'utf8') : null;
    if (cur === body) continue; changed++;
    if (check) { console.log('다름: ' + file); continue; }
    mkdirSync(path.dirname(full), { recursive: true }); writeFileSync(full, body); console.log('씀: ' + file);
  }
  console.log(check ? (changed ? `${changed}개 파일이 최신이 아닙니다. node tools/kit-pages/build.mjs 를 실행하세요.` : '모두 최신입니다.') : `${Object.keys(files).length}개 가운데 ${changed}개를 고쳤습니다.`);
  if (check && changed) process.exit(1);
}
