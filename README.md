# 메가스팟 MEGASPOT — 홈페이지 · 플랫폼 (Cloudflare Pages 배포용)

큰 모임에 맞는 공간을 찾다. 대형 공간 탐색·예약 플랫폼 **메가스팟**의 홈페이지와, 첫 직영 공간 **메가스팟 건대**(서울 광진구 화양동 10-1 한아름건물 2층)의 상세·예약·후기 기능이 들어 있는 정적 사이트 + Cloudflare Pages Functions(API) + D1 데이터베이스 구성입니다.

터미널 없이 **GitHub 웹 화면과 Cloudflare 대시보드만으로** 배포할 수 있게 만들었습니다.

---

## 1. 폴더 구성

```
/                         ← 이 폴더 전체를 GitHub 저장소 루트에 올립니다
├─ index.html             플랫폼 메인 (큰 모임에 맞는 공간을 찾다)
├─ spaces/                공간 찾기(필터) · 메가스팟 건대 상세 · 3D 뷰어
│   └─ megaspot-gundae/
│       ├─ index.html     건대 상세 (공간 전경·현장 사진·조감도 갤러리, 활용 장면, 조감도 각도 보기, 3D, 도면·배치, 시설, 이용안내, 요금, 예상 금액, 예약문의, 후기, 오시는길)
│       ├─ pricing/       건대 요금 안내 (요금표·이용 방식별 요금·시즌·할인·패키지·옵션·보증금·결제·취소·견적 예시)
│       └─ 3d/            3D 공간 뷰어(index.html) + MEGASPOT_2F.glb
├─ inquiry/               문의서 — 행사 대관 / 정기·반복 모임 / 제휴·협력·파트너 (?type=regular, ?type=partner)
├─ purpose/               어떤 모임 — 목적별 확인 조건 안내
├─ guide/                 이용 안내 · 예약 상태 · 견적서 읽는 법 · 취소·환불 · FAQ
├─ host/                  공간 등록(호스트 입점 기준·절차·문의 폼)
├─ about/                 메가스팟 소개
├─ admin/                 운영자 페이지 (문의함·예약 등록·후기 승인·일정 관리·입점 문의)
├─ terms/ privacy/        이용약관·개인정보처리방침 초안
├─ assets/
│   ├─ css/site.css       디자인 시스템 (Industrial Raw 팔레트)
│   ├─ js/site.js         ★ 연락처·운영 정보 설정(CONFIG) + 공통 스크립트
│   ├─ js/data/spaces.js  ★ 공간 데이터 (새 공간 추가는 여기)
│   ├─ js/data/pricing-gundae.js ★ 건대 요금표 v1.0 (요금·할인·패키지·옵션·보증금·취소 규정·견적 예시)
│   ├─ js/data/holidays-kr.js    공휴일 목록 (요금의 공휴일 규칙 계산용, 2028년 6월까지)
│   ├─ js/pricing-engine.js      요금 계산 (가격구조도의 계산 순서 그대로)
│   ├─ js/pricing-ui.js          요금표·예상 금액 계산기 화면
│   ├─ js/data/scenes.js  활용 장면(연출 예시) 22컷 목록
│   ├─ js/data/visuals.js 공간 전경 CG 11컷·조감도 CG 7컷 목록과 안내 문구
│   ├─ js/data/facilities.js  건대 시설·장비·비품 80개 항목
│   ├─ js/data/gundae-plan.js 건대 평면 기하(도면) 데이터
│   ├─ img/gundae/        현장 사진 23장 (p01~p23.jpg, 중간 크기 m/, 썸네일 t/)
│   ├─ img/scenes/        활용 장면 22컷 (s01~s23.jpg, m/, t/) — '연출 예시'로 표시
│   ├─ img/views/         공간 전경 CG 11컷 (v01~v11.jpg, m/, t/) — 'CG 이미지'로 표시
│   ├─ img/aerial/        조감도 CG 7컷 (a01~a07.jpg, m/, t/) — '조감도 CG'로 표시
│   ├─ img/brand/         로고·파비콘, 링크 미리보기 이미지(og-megaspot·og-gundae·og-pricing.jpg), 카카오톡 문의 QR(kakao-qr.svg)
│   └─ docs/              실측 평면도 PDF·PNG, 원본 손도면
├─ functions/api/         Cloudflare Pages Functions (서버 API)
│   ├─ health.js  inquiry.js  host.js  reviews.js  availability.js
│   └─ admin/[[path]].js  운영자 API (X-Admin-Key 인증)
├─ schema.sql             D1 데이터베이스 테이블 정의
├─ _headers  _redirects  robots.txt  sitemap.xml
└─ README.md              이 문서
```

---

## 2. 배포 순서 (약 15분)

### ① GitHub 저장소 만들기
1. github.com → **New repository** → 이름 예: `megaspot` → Public/Private 아무거나 → Create.
2. 저장소 화면에서 **Add file → Upload files** 를 누르고, 이 폴더 안의 **모든 파일과 폴더를 그대로** 끌어다 놓습니다. (`index.html`이 저장소 최상위에 있어야 합니다.)
   - 파일이 252개(약 33MB)라 웹 화면의 한 번 업로드 한도(100개)를 넘습니다. 함께 드린 **분할 업로드용 zip 네 개**(1: 페이지·스크립트·문서, 2: 현장 사진, 3: 활용 장면, 4: 공간 전경·조감도)를 하나씩 풀어 차례로 올리면 됩니다.
3. **Commit changes** 를 누릅니다.

### ② Cloudflare Pages 연결
1. dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → 위 저장소 선택.
2. 빌드 설정은 **모두 비워 둡니다.**
   - Framework preset: `None`
   - Build command: (비움)
   - Build output directory: `/` (또는 비움)
3. **Save and Deploy** → 1분쯤 뒤 `https://megaspot.pages.dev` 같은 주소가 생깁니다. 이 단계에서 이미 모든 페이지·3D·도면이 동작합니다.
   - 아직 데이터베이스가 없으므로 문의·후기 폼은 자동으로 **체험 모드**(문의 내용 복사·문자·이메일 전송 안내)로 동작합니다.

### ③ D1 데이터베이스 만들기
1. Cloudflare 대시보드 → **Storage & Databases → D1 SQL Database → Create** → 이름 `megaspot-db` → Create.
2. 만든 DB 화면의 **Console** 탭을 열고, 저장소의 `schema.sql` 내용을 **전부 복사해 붙여 넣고 Execute**. (테이블 6개가 생깁니다.)

### ④ Pages 프로젝트에 DB·운영자 키 연결
1. Workers & Pages → `megaspot` 프로젝트 → **Settings → Bindings → Add → D1 database**
   - Variable name: **`DB`** (대문자, 정확히)
   - D1 database: `megaspot-db`
2. 같은 Settings → **Variables and Secrets → Add**
   - Variable name: **`ADMIN_KEY`** · Type: **Secret** · Value: 운영자 페이지 비밀번호(길고 복잡하게)
3. **Deployments 탭 → 최신 배포의 ⋯ → Retry deployment** (바인딩은 재배포 후 적용됩니다.)

### ⑤ 확인
- `https://(내주소)/api/health` 에 접속해 `"db": true` 가 보이면 연결 완료.
- `https://(내주소)/admin/` 에서 ADMIN_KEY 로 접속 → 문의함·예약·후기·일정 관리가 열립니다.
- 상세 페이지에서 문의서를 한 번 보내 보고 운영자 페이지 문의함에 들어오는지 확인합니다.

### ⑥ 도메인 연결(선택)
Pages 프로젝트 → **Custom domains → Set up a custom domain**. 도메인을 정하면 `sitemap.xml`, `robots.txt`, 각 페이지 `<link rel="canonical">`·OG 주소의 `https://megaspot.pages.dev` 를 새 도메인으로 바꿔 주세요. (GitHub에서 파일 열기 → 연필 아이콘 → 수정 → Commit)

---

## 3. 운영 방법

### 연락처·사업자 정보 바꾸기 — `assets/js/site.js` 맨 위 `CONFIG`
```js
phone: '010-2384-9580',          // 대표 상담 번호
email: 'spaceblank0100@gmail.com', // 대표 이메일
kakaoChannel: 'http://pf.kakao.com/_uTiFX', // 카카오톡 문의 채널 (소셜팩토리 채널에서 함께 응대). 비우면 카카오톡 버튼이 숨겨집니다
kakaoNote: '메가스팟 문의는 소셜팩토리 카카오톡 채널에서 함께 응대합니다.',
hours: '평일 10:00–19:00 …',
companyName: '', bizNo: '', ceo: '',  // 사업자 상호·등록번호·대표자 — 입력하면 푸터에 표시됩니다
```
한 곳만 바꾸면 모든 페이지의 전화·이메일·카카오톡 링크·푸터가 함께 바뀝니다.

**카카오톡 문의 채널** — 아래 위치에 QR코드·버튼·링크가 들어가 있습니다.
- 모든 페이지 푸터(QR코드 + 링크), 모바일 메뉴(카카오톡 문의 버튼)
- 건대 상세: 맨 위 '카카오톡 문의' 버튼, 예약·문의 섹션의 바로 연락 카드(QR코드·버튼·전화·이메일)
- 문의 페이지 오른쪽 바로 연락 카드, 문의 완료 화면의 '카카오톡으로 보내기'(문의 내용을 복사하고 채널을 엽니다)
- 소개·요금 안내·이용 안내(FAQ 포함) 페이지의 문의 버튼, 개인정보처리방침의 카카오톡 상담 항목

QR 이미지는 `assets/img/brand/kakao-qr.svg` 입니다. **채널 주소를 바꾸면 QR 이미지도 새 주소로 다시 만들어 같은 이름으로 교체**해야 합니다(CONFIG만 바꾸면 버튼·링크는 바뀌지만 QR 그림은 그대로입니다).

### 예약 흐름 (운영자 페이지)
1. 고객이 **문의서**(행사 대관·정기 모임·제휴)를 보내면 문의번호 `MS-YYMM-XXXX` 가 발급되고 문의함에 **문의 접수** 상태로 들어옵니다. 예상 금액 계산기로 낸 금액이 있으면 '예상 금액 첨부' 표시와 함께 내용 전체에서 확인할 수 있습니다.
2. 조건을 확인하고 견적을 보낸 뒤 상태를 **조건 확인 → 견적 발송 → 결제 대기** 로 바꿔 둡니다. (운영 메모에 견적 금액·통화 내용 기록) 견적 뒤 72시간(11–12월 48시간)은 가예약 기간이니 **일정 관리**에서 해당 날짜를 '임시 확보'로 막아 두세요.
3. 결제가 끝나면 **예약 관리 → 예약 확정 등록**. 연결할 문의번호를 넣으면 문의 상태가 자동으로 '예약 확정'이 되고, 해당 날짜가 달력에서 **마감**으로 표시됩니다. 발급된 **예약번호**를 고객에게 안내합니다.
4. 행사 뒤 **이용 완료 처리**를 누르면 고객이 상세 페이지에서 예약번호 + 휴대폰 뒷 4자리로 **이용 확인 후기**를 쓸 수 있습니다.
5. 후기는 **후기 관리 → 승인 대기** 에서 확인 후 '게시'를 누르면 공개됩니다. 운영자 답변도 함께 남길 수 있습니다.
6. 외부 채널로 받은 예약이나 내부 행사는 **일정 관리**에서 날짜를 '마감' 또는 '임시 확보'로 막아 두세요.

### 이미지 종류와 표시
| 표시 | 파일 | 뜻 |
|---|---|---|
| 현장 사진 | `img/gundae/p01~p23` | 실제로 찍은 사진 |
| 연출 예시 | `img/scenes/s01~s23` | 현장 사진을 바탕으로 행사 장면을 그려 본 이미지 |
| CG 이미지 | `img/views/v01~v11` | 현장을 바탕으로 조명·색감·시점을 다듬은 공간 전경 |
| 조감도 CG | `img/aerial/a01~a07` | 실측 도면을 바탕으로 만든 조감도 |

표시는 이미지 이름의 첫 글자(p·s·v·a)로 자동으로 붙습니다. 실제 사진으로 바꾸고 싶으면 같은 이름의 파일을 교체하고, 활용 장면이라면 `scenes.js`의 `staged`를 `false`로 바꿉니다. 공간 전경·조감도의 제목과 설명은 `visuals.js`에서 고칩니다.

### 요금 바꾸기 — `assets/js/data/pricing-gundae.js`
요금표의 숫자는 이 파일 한 곳에만 있습니다. 숫자를 고치면 상세 페이지 요금표, 요금 안내 페이지의 모든 표(연속 이용·팝업·12월·공급가액), 패키지 예시 총액, 예상 금액 계산기, 목적별 페이지의 요금 예시, 공간 카드의 '4시간 55만 원부터'가 함께 바뀝니다.
- 기본 공간료: `base` (원 단위, 부가세 포함). 예: 토요일 저녁을 140만 원으로 → `ev: { … sat:1400000 … }`
- 연속 이용 할인 `continuous`, 12월 할증 `december`, 할인 `discounts`, 패키지 `packages`, 옵션 단가 `opt`, 보증금 `deposit`, 취소 규정 `cancelPersonal`·`cancelContract`
- 요금을 바꿀 때는 맨 위 `version`(예: 'v1.1')과 `effective`(시행 월)도 함께 고쳐 주세요. 견적서에 적는 요금표 버전입니다.
- 공간 카드의 '부터' 금액은 `spaces.js`의 `price.from` 에서 바꿉니다.
- 공휴일: `assets/js/data/holidays-kr.js`. 정부가 임시공휴일을 지정하거나 2028년 음력 공휴일이 확정되면 날짜를 추가합니다. (공휴일 낮은 토요일 요금, 공휴일 전날 저녁은 금요일 요금 등 규칙은 자동 적용)

### 예상 금액 계산기
상세 페이지(#estimate)와 요금 안내 페이지에 있습니다. 행사 대관(블록)·팝업·촬영 세 가지 방식으로 공휴일 규칙, 연속 이용 할인, 12월 할증과 45일 전 계약 면제, 패키지·옵션, 정기 대관·학생·학기 묶음·결합·환불 불가 특가 할인(합계 25% 한도), 보증금, 결제 방식(개인 전액 / 행사 계약 30%·70%), 취소 규정까지 계산합니다. '이 조건으로 견적 문의'를 누르면 계산 내용이 문의서에 함께 담겨 운영자 문의함에 '예상 금액 첨부'로 들어옵니다. 계산 결과는 예상 금액이며 최종 금액은 견적서로 확정한다는 문구가 함께 표시됩니다.

### 문의 유형과 별도 협의
문의서 위쪽에서 **행사 대관 / 정기·반복 모임 / 제휴·협력·파트너** 중 하나를 고릅니다. 주소 끝에 `?type=regular` 또는 `?type=partner` 를 붙이면 해당 유형으로 바로 열립니다(`/partner` 로 접속해도 제휴 문의로 이동).
- 정기·반복 모임: 반복 주기·기간·선호 요일을 받습니다. 첫 이용일은 비워도 됩니다.
- 제휴·협력·파트너: 회사·단체명과 제안 내용을 받습니다. 날짜·인원 칸은 숨겨집니다.
- 운영자 페이지 문의함에서 유형별로 걸러 볼 수 있습니다(데이터베이스 표는 바뀌지 않아 기존 D1을 그대로 씁니다).
- '반복 모임과 제휴·협력은 따로 협의합니다' 안내 띠는 홈·건대 상세·요금 안내·어떤 모임·이용 안내 다섯 페이지에 같은 내용으로 들어 있습니다. HTML에서 `<!-- include:partner-band -->` 와 `<!-- /include:partner-band -->` 사이가 그 부분이니, 문구를 바꿀 때는 다섯 곳을 함께 바꿔 주세요.

### 공간 추가 (외부 호스트·2호점) — `assets/js/data/spaces.js`
`MEGASPOT_SPACES` 배열의 건대 객체를 복사해 `id`, `name`, `type`('direct' | 'managed' | 'host'), 주소, 면적·인원, 사진 목록 등을 채우면 공간 찾기 목록과 홈에 자동으로 나타납니다. 사진은 `assets/img/<공간id>/` 폴더에 `p01.jpg…` 와 썸네일 `t/p01.jpg…` 로 넣습니다. 상세 페이지는 `spaces/megaspot-gundae/index.html` 을 복사해 만들고 `space.js`의 공간 id 한 줄만 바꾸면 됩니다. (확인되지 않은 수치는 비워 두거나 '확인 필요'로 적습니다 — 사업계획서 12장 입점 기준)

### 시설 목록 갱신 — `assets/js/data/facilities.js`
엑셀(메가스팟_시설장비비품_종합목록)에서 수량·제공 조건을 확정하면 해당 항목의 `qty`, `status`, `memo` 를 수정합니다. `pending`(추가 확인 항목)에서 확정된 것은 지웁니다.

### 도면·3D 교체
- 평면도 PDF/PNG: `assets/docs/` 교체 (파일명 유지)
- 3D: `spaces/megaspot-gundae/3d/MEGASPOT_2F.glb` 교체. 뷰어 자체(index.html)는 도면 수치가 바뀌면 다시 제작이 필요합니다.

---

## 4. 데이터베이스 표 (schema.sql)

| 테이블 | 내용 |
|---|---|
| `inquiries` | 행사 문의서 (문의번호·상태·연락처·문의 전체 JSON·운영 메모) |
| `host_applications` | 호스트 입점 문의 |
| `bookings` | 확정 예약 (예약번호·이용일·휴대폰 뒷 4자리·상태 confirmed/completed/cancelled) |
| `reviews` | 이용 확인 후기 (예약 1건당 1건, pending/approved/hidden, 운영자 답변) |
| `calendar_blocks` | 달력 마감·임시 확보 날짜 |
| `event_log` | 상태·금액·정책 변경 이력 (누가 언제 무엇을 바꿨는지) |

데이터 백업: D1 Console에서 `SELECT * FROM inquiries;` 등을 실행해 내보내거나, 대시보드의 Export 기능을 사용합니다.

---

## 5. 공개 전 확인할 것

- [ ] `site.js` CONFIG의 전화번호·이메일이 공개용 번호가 맞는지 확인
- [ ] 사업자 상호·등록번호·대표자(CONFIG)와 이용약관·개인정보처리방침의 '확정 시 표기' 부분 채우기
- [x] 카카오톡 문의 채널 연결 (http://pf.kakao.com/_uTiFX, 소셜팩토리 채널에서 함께 응대) — 채널에서 1:1 채팅이 켜져 있는지 확인
- [ ] 주차 대수·요금, 무선마이크 수량, 음식 반입 범위 등 '확인 필요' 항목을 확정하는 대로 `spaces.js`·`facilities.js` 갱신
- [ ] 배치별 인원이 확정되면 `spaces.js`의 `layouts[].capacityNote` 를 실제 수치로 교체
- [ ] 도메인 확정 후 sitemap·robots·canonical 주소 교체
- [ ] 요금 공개 전 확인(가격구조도 17장): 무선마이크 기본 2개와 테이블·의자 수량, 23시 이후 운영 가능 여부와 음량 기준, 주차 대수·요금, 스모그머신 화재감지기 대응
- [ ] 취소·환불 규정과 이용약관 초안 법률 검토 (청약철회 예외 고지, 위약금 수준, 정기 대관 중도 해지 조건)
- [ ] 같은 건물 1층·4층 공간 요금 확정 (결합 할인 안내에 쓰임)
- [ ] '오픈 혜택(오픈 후 8주 안 계약 시 10만 원 이하 옵션 1개 무료)'의 오픈일이 정해지면 안내 문구에 기간을 적기
- [ ] 2028년 음력 공휴일·임시공휴일이 발표되면 `holidays-kr.js` 갱신

---

## 6. 기술 메모

- 빌드 도구·프레임워크 없이 순수 HTML/CSS/JS 로 되어 있어 GitHub 웹에서 파일을 직접 고칠 수 있습니다.
- 서체: Pretendard(jsDelivr CDN), Anton·Black Han Sans(Google Fonts). 오프라인에서는 기본 고딕으로 표시됩니다.
- 3D 뷰어는 three.js(MIT, `THREE-LICENSE.txt`)를 포함한 단일 파일이며, 실측 도면과 현장 사진으로 재구성한 모델입니다(실제 스캔 아님).
- API 가 없거나 DB 가 연결되지 않으면 모든 폼은 자동으로 체험 모드로 바뀌어 사이트가 깨지지 않습니다.
- 운영자 API 는 `X-Admin-Key` 헤더로 보호되며, 키는 Cloudflare Secret 에만 저장됩니다. 운영자 페이지 주소는 검색 엔진에 노출되지 않습니다(`noindex`, robots Disallow).
