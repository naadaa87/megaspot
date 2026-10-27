-- 메가스팟 D1 스키마 (Cloudflare D1 · SQLite)
-- 적용: Cloudflare 대시보드 → D1 → 데이터베이스 → Console 에 아래 전체를 붙여 넣고 실행
--       또는 터미널에서  npx wrangler d1 execute megaspot-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- 문의번호 MS-YYMM-XXXX
  space_id TEXT NOT NULL,                   -- megaspot-gundae | request(맞춤 공간 요청) | 그 외 공간 id
  status TEXT NOT NULL DEFAULT '문의 접수', -- 문의 접수 → 조건 확인 → 견적 발송 → 결제 대기 → 예약 확정 → 이용 완료 / 취소·환불
  name TEXT, phone TEXT, email TEXT,
  event_date TEXT, headcount INTEGER,
  data TEXT NOT NULL,                       -- 문의서 전체(JSON). inquiry_type: event(행사 대관) | regular(정기·반복 모임) | partner(제휴·협력)
  memo TEXT,                                -- 운영 메모
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status, created_at);

CREATE TABLE IF NOT EXISTS host_applications (   -- 입점 상담 · 공간 등록 신청 · 광고·제휴 문의
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- HS-YYMM-XXXX
  status TEXT NOT NULL DEFAULT '접수',      -- 접수 → 검토 중 → 보완 요청 → 진행 확정 / 보류 / 반려·종료
  data TEXT NOT NULL,
  kind TEXT,                                -- host(입점 상담) | space(공간 등록 신청) | ad(광고·제휴 문의) — 2026-10-24 추가
  memo TEXT,                                -- 운영 메모
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL UNIQUE,        -- 예약번호 (후기 작성 시 사용)
  space_id TEXT NOT NULL,
  inquiry_ref TEXT,                         -- 연결된 문의번호
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_last4 TEXT NOT NULL,                -- 후기 작성 확인용
  date TEXT NOT NULL,                       -- 이용일 YYYY-MM-DD
  slot TEXT,                                -- am | pm | ev | ampm | pmev | day(전일) | custom
  headcount INTEGER,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | completed | cancelled
  amount INTEGER,                           -- 예약 금액(원) — 2026-10-16 추가
  start_h INTEGER,                          -- 시작 시각(7~30, 24 이상은 다음 날)
  end_h INTEGER,                            -- 종료 시각(8~31)
  confirm_doc TEXT,                         -- 예약확정서 발급 내용 JSON (2026-10-22 추가 · 관리자 '예약확정서')
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(space_id, date);

CREATE TABLE IF NOT EXISTS booking_deposit_checks (
  booking_code TEXT PRIMARY KEY,
  paid INTEGER NOT NULL CHECK (paid IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id TEXT NOT NULL,
  booking_code TEXT NOT NULL UNIQUE,        -- 예약 1건당 후기 1건
  author TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  event_type TEXT, headcount INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | hidden
  reply TEXT,                               -- 운영자 답변
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_space ON reviews(space_id, status);

CREATE TABLE IF NOT EXISTS calendar_blocks (
  space_id TEXT NOT NULL,
  date TEXT NOT NULL,
  state TEXT NOT NULL,                      -- full(마감) | hold(임시 확보)
  memo TEXT,
  PRIMARY KEY (space_id, date)
);

CREATE TABLE IF NOT EXISTS event_log (                -- 모든 상태·금액·정책 변경 이력
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, ref TEXT, actor TEXT, detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_log_ref_kind ON event_log(ref, kind);

-- ---------- 회원 (2026-10-11 추가) ----------
-- 이미 위 표들을 만들어 둔 데이터베이스에도 이 파일 전체를 다시 실행하면 됩니다 (IF NOT EXISTS 라 기존 데이터는 그대로).
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, -- 로그인 아이디
  name TEXT NOT NULL,
  phone TEXT,
  org TEXT,                                  -- 소속(회사·단체·모임명, 선택)
  pw_hash TEXT NOT NULL,                     -- pbkdf2$반복횟수$솔트$해시 (원문 비밀번호는 저장하지 않음)
  agree_marketing INTEGER NOT NULL DEFAULT 0,
  agreed_at TEXT NOT NULL,                   -- 약관·개인정보 동의 시각
  status TEXT NOT NULL DEFAULT 'active',     -- active | suspended
  created_at TEXT NOT NULL,
  updated_at TEXT,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (        -- 로그인 상태 (쿠키 토큰의 SHA-256 해시만 저장)
  token_hash TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);

CREATE TABLE IF NOT EXISTS auth_attempts (   -- 로그인 실패·가입 시도 횟수 (일정 횟수 넘으면 잠시 막음)
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);
-- 회원이 로그인한 상태로 보낸 문의는 inquiries.data 안에 member_id 가 들어가 마이페이지에 표시됩니다.

-- ---------- 관리자 (2026-10-11 추가) ----------
CREATE TABLE IF NOT EXISTS admin_sessions (  -- 관리자 로그인 상태 (쿠키 토큰의 해시만 저장)
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS quotes (          -- 관리자가 계산·저장한 견적 (문의 1건에 여러 번 저장 가능, 마지막 것이 최신)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT NOT NULL UNIQUE,             -- Q-YYMM-XXXX
  inquiry_ref TEXT,                          -- 연결된 문의번호 (없으면 단독 견적)
  customer TEXT,                             -- 고객 이름·소속
  event_date TEXT,
  total INTEGER NOT NULL,                    -- 합계 (보증금 제외)
  data TEXT NOT NULL,                        -- 견적 전체(JSON): 조건·항목·할인·추가 항목·안내 메모
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_ref ON quotes(inquiry_ref, created_at);

CREATE TABLE IF NOT EXISTS inquiry_checks (  -- 문의별 진행 체크리스트
  ref TEXT PRIMARY KEY,
  checks TEXT NOT NULL,                      -- {"available":true, "quote_sent":true, ...}
  updated_at TEXT NOT NULL
);
-- 서버는 처음 요청을 받을 때 위 표들이 없으면 스스로 만듭니다 (functions/api/_middleware.js).

-- ---------- 온라인 결제 (2026-10-13 추가) ----------
CREATE TABLE IF NOT EXISTS orders (          -- 이용권·옵션 온라인 주문 (KG이니시스)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oid TEXT NOT NULL UNIQUE,                  -- 주문번호 MS + 일시 + 난수 (이니시스 oid)
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT,                           -- 이용일 (이용권)
  people INTEGER,
  price INTEGER NOT NULL,                    -- 결제 금액 (서버 계산)
  buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_email TEXT,
  data TEXT NOT NULL,                        -- 항목·옵션·메모 JSON
  status TEXT NOT NULL DEFAULT 'created',    -- created(결제창 열림) | paid | failed | cancelled | refunded
  pay_method TEXT, tid TEXT, appl_at TEXT, result_msg TEXT,
  booking_code TEXT,                         -- 결제 완료 시 자동 등록된 예약번호
  inquiry_ref TEXT, member_id INTEGER,
  memo TEXT,                                 -- 운영 메모 (환불 처리 등)
  test INTEGER NOT NULL DEFAULT 0,           -- 1 = 이니시스 테스트 상점으로 결제한 주문
  created_at TEXT NOT NULL, paid_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);

-- ---------- 운영 설정 (2026-10-20 추가) ----------
CREATE TABLE IF NOT EXISTS settings (        -- 관리자 화면에서 바꾸는 운영 설정 (출장뷔페 발주처 연락처·1인 수수료 등). 공개 저장소에 두지 않을 값은 여기에 둡니다.
  key TEXT PRIMARY KEY,                      -- 'catering'
  value TEXT NOT NULL,                       -- JSON
  updated_at TEXT NOT NULL
);

-- ---------- 플랫폼 (2026-10-24 추가) ----------
CREATE TABLE IF NOT EXISTS listings (        -- 등록 공간 (외부 호스트 공간 · 문의형). 공간 등록 신청을 검토한 뒤 관리자가 만들고 공개합니다.
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,                 -- 공개 주소용 번호 L-YYMM-XXXX (/spaces/listing/?id=)
  status TEXT NOT NULL DEFAULT 'draft',      -- draft(작성 중) | published(공개) | hidden(숨김)
  name TEXT NOT NULL,
  region TEXT, address TEXT,
  area INTEGER, capacity INTEGER,            -- 평 · 최대 인원
  host_ref TEXT,                             -- 연결된 공간 등록 신청 번호 (HS-)
  sort INTEGER NOT NULL DEFAULT 0,           -- 클수록 먼저 보임
  data TEXT NOT NULL,                        -- 소개·시설·목적·사진 주소·요금 안내·호스트 정보 JSON
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, sort);

CREATE TABLE IF NOT EXISTS meetups (         -- 모임 홍보·참가자 모집 (운영팀 확인 뒤 공개)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                  -- 모임번호 MO-YYMM-XXXX
  status TEXT NOT NULL DEFAULT 'pending',    -- pending(검토 중) | open(모집 중) | closed(모집 마감) | cancelled(주최자 취소) | rejected(반려) | hidden(숨김)
  title TEXT NOT NULL,
  category TEXT, venue TEXT,                 -- venue: megaspot-gundae | megaspot-gundae-2 | tbd(협의 중) | other
  event_date TEXT,                           -- 모임 날짜 YYYY-MM-DD
  capacity INTEGER,                          -- 정원
  featured INTEGER NOT NULL DEFAULT 0,       -- 1 = 추천 모임 (목록 위에 먼저)
  verified INTEGER NOT NULL DEFAULT 0,       -- 1 = 메가스팟 예약 확인 (예약번호로 확인한 모임)
  data TEXT NOT NULL,                        -- 소개·시간·참가비·질문·대표 이미지 + 주최자 연락처(비공개)
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_meetups_status ON meetups(status, event_date);

CREATE TABLE IF NOT EXISTS meetup_apps (     -- 모임 참가 신청 (이름·연락처는 신청자 동의를 받아 주최자에게 보입니다)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                  -- 신청번호 AP-YYMM-XXXX
  meetup_ref TEXT NOT NULL,
  status TEXT NOT NULL,                      -- confirmed(참가 확정) | pending(승인 대기) | waitlist(대기) | cancelled(취소) | rejected(참가 불가)
  name TEXT NOT NULL, phone TEXT NOT NULL, phone_last4 TEXT NOT NULL,
  people INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,                        -- 질문 답변·메모·동의 시각
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_meetup_apps ON meetup_apps(meetup_ref, status, created_at);

CREATE TABLE IF NOT EXISTS ads (             -- 배너 광고 · 메가스팟 안내 배너
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,                        -- home-mid | list-top | list-card | content-bottom
  status TEXT NOT NULL DEFAULT 'off',        -- on | off
  kind TEXT NOT NULL DEFAULT 'paid',         -- paid(광고 — 화면에 '광고' 표시) | house(메가스팟 안내)
  title TEXT NOT NULL,
  advertiser TEXT,
  link TEXT NOT NULL,                        -- https:// 주소 또는 /로 시작하는 홈페이지 경로
  start_date TEXT, end_date TEXT,            -- 게재 기간 (비우면 제한 없음)
  priority INTEGER NOT NULL DEFAULT 0,       -- 같은 자리에 여러 개면 큰 값 먼저
  imps INTEGER NOT NULL DEFAULT 0,           -- 노출 수
  clicks INTEGER NOT NULL DEFAULT 0,         -- 클릭 수
  data TEXT NOT NULL,                        -- 보조 문구·버튼 문구·이미지 주소·색·메모
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ads_slot ON ads(slot, status);

-- ---------- 현장답사 일정 (2026-10-27 추가) ----------
CREATE TABLE IF NOT EXISTS site_visits (     -- 예약 문의 고객의 현장답사 (관리자 등록 · 홈페이지 답사 희망)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                  -- 답사번호 SV-YYMM-XXXX
  inquiry_ref TEXT,                          -- 연결된 문의번호 (없으면 단독 답사)
  space_id TEXT NOT NULL,                    -- megaspot-gundae | megaspot-gundae-2
  visit_date TEXT,                           -- 답사 날짜 YYYY-MM-DD (조율 중이면 비어 있을 수 있음)
  start_time TEXT,                           -- 시작 시각 HH:MM (조율 중이면 비어 있음)
  duration INTEGER NOT NULL DEFAULT 30,      -- 예상 소요 시간(분)
  status TEXT NOT NULL DEFAULT 'scheduled',  -- requested(조율 중) | scheduled(예정) | done(완료) | noshow(노쇼) | cancelled(취소)
  name TEXT NOT NULL, phone TEXT,
  people INTEGER,                            -- 방문 인원
  staff TEXT,                                -- 안내 담당자
  memo TEXT,                                 -- 운영 메모
  data TEXT NOT NULL,                        -- 출처(admin/web) · 고객 희망 일시 · 답사 후 결과
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visit_date, status);
CREATE INDEX IF NOT EXISTS idx_site_visits_inquiry ON site_visits(inquiry_ref);
