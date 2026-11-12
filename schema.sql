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
CREATE TABLE IF NOT EXISTS admin_inquiry_reads (
  ref TEXT PRIMARY KEY,
  read_at TEXT NOT NULL
);

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
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | completed | cancelled | payment_review(결제 완료·일정 검토)
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
CREATE TABLE IF NOT EXISTS orders (          -- 이용권·옵션 온라인 주문 (페이앱 · 기존 주문 유지)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oid TEXT NOT NULL UNIQUE,                  -- 주문번호 MS + 일시 + 난수 (페이앱 var1)
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT,                           -- 이용일 (이용권)
  people INTEGER,
  price INTEGER NOT NULL,                    -- 결제 금액 (서버 계산)
  buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_email TEXT,
  data TEXT NOT NULL,                        -- 항목·옵션·메모 JSON
  status TEXT NOT NULL DEFAULT 'created',    -- created(결제창 열림) | pending(입금 대기) | paid | failed | cancelled | refunded
  pay_method TEXT, tid TEXT, appl_at TEXT, result_msg TEXT,
  booking_code TEXT,                         -- 결제 완료 시 자동 등록된 예약번호
  inquiry_ref TEXT, member_id INTEGER,
  memo TEXT,                                 -- 운영 메모 (환불 처리 등)
  test INTEGER NOT NULL DEFAULT 0,           -- 1 = 이전 PG의 테스트 주문
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

-- 출장뷔페 진행 건 (2026-10-27) — 관리자 '출장뷔페'에서 예약·문의를 골라 계산한 구성과 대기·확정·취소 상태
CREATE TABLE IF NOT EXISTS catering_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- 진행 번호 CO-YYMM-XXXX
  inquiry_ref TEXT,                         -- 연결된 문의번호
  booking_code TEXT,                        -- 연결된 예약번호 (문의 없이 등록한 예약도 연결)
  space_id TEXT,
  event_date TEXT,                          -- 행사일 YYYY-MM-DD
  meal_time TEXT,                           -- 식사 시작 시간 (예: 18:30)
  customer TEXT NOT NULL,
  phone TEXT,
  people INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending 대기 | confirmed 확정 | cancelled 취소
  total INTEGER,                            -- 고객 금액 (부가세 포함)
  data TEXT NOT NULL,                       -- 구성·계산 결과 JSON (코스·인원·바베큐·생맥주·출장비·메모·공급가·부가세)
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_catering_orders_date ON catering_orders(event_date, status);
CREATE INDEX IF NOT EXISTS idx_catering_orders_inquiry ON catering_orders(inquiry_ref);
CREATE INDEX IF NOT EXISTS idx_catering_orders_booking ON catering_orders(booking_code);

-- 페이앱 거래 연결·부분 환불 (기존 주문 컬럼은 변경하지 않습니다)
CREATE TABLE IF NOT EXISTS payapp_payments (
  oid TEXT PRIMARY KEY,
  mul_no TEXT UNIQUE,
  nonce TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payapp_refunds (
  mul_no TEXT PRIMARY KEY,
  oid TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payapp_refunds_oid ON payapp_refunds(oid);
-- Additive parking checkout and manual fulfillment. Existing orders/payments remain the payment ledger.
CREATE TABLE IF NOT EXISTS parking_sessions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id TEXT NOT NULL UNIQUE,
 plate TEXT NOT NULL,
 entry_at TEXT NOT NULL,
 free_external INTEGER NOT NULL DEFAULT 0,
 free_order TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_orders (
 oid TEXT PRIMARY KEY,
 payment_oid TEXT REFERENCES orders(oid),
 vehicle_price INTEGER CHECK(vehicle_price>0),
 plate TEXT NOT NULL,
 visit_date TEXT NOT NULL,
 ticket TEXT NOT NULL,
 hours INTEGER,
 daily_terms TEXT NOT NULL DEFAULT '',
 token_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'waiting',
 arrival_at TEXT,
 session_id INTEGER REFERENCES parking_sessions(id),
 free_hours INTEGER NOT NULL DEFAULT 0,
 paid_hours INTEGER NOT NULL DEFAULT 0,
 cost INTEGER,
 memo TEXT NOT NULL DEFAULT '',
 refund_requested_at TEXT,
 refund_reason TEXT,
 refund_reviewed_at TEXT,
 applied_at TEXT,
 updated_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS parking_orders_queue ON parking_orders(status,visit_date,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS parking_one_processing_per_entry ON parking_orders(session_id) WHERE status = 'processing';

-- 이용 안내 알림톡. 운영자 시험 발송은 예약 체크·고객 중복 방지에서 제외합니다.
CREATE TABLE IF NOT EXISTS booking_guide_messages (
  id TEXT PRIMARY KEY,
  booking_code TEXT,
  purpose TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','test')),
  status TEXT NOT NULL CHECK (status IN ('queued','sending','accepted','unknown','delivered','failed','cancelled')),
  snapshot TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  provider_mid TEXT,
  provider_result TEXT,
  error TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guide_messages_booking ON booking_guide_messages(booking_code,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS guide_messages_one_active ON booking_guide_messages(booking_code,purpose) WHERE mode='live' AND status IN ('queued','sending','accepted','unknown','delivered');
CREATE TABLE IF NOT EXISTS booking_guide_previews (id TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL);

-- 보증금 환급 계좌·수동 송금 관리 (2026-11-03)
-- Additive only; bank details and invitation tokens are AES-GCM ciphertext.
CREATE TABLE IF NOT EXISTS booking_refunds (
 booking_code TEXT PRIMARY KEY,
 token_hash TEXT UNIQUE,
 link_cipher TEXT,
 link_expires_at INTEGER,
 account_cipher TEXT,
 account_mask TEXT,
 bank_code TEXT,
 account_version INTEGER NOT NULL DEFAULT 0,
 submitted_at TEXT,
 account_updated_at TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','completed','hold')),
 amount INTEGER NOT NULL CHECK(amount >= 0 AND amount <= 10000000),
 deduction INTEGER NOT NULL DEFAULT 0 CHECK(deduction >= 0 AND deduction <= amount),
 deduction_reason TEXT NOT NULL DEFAULT '',
 deduction_notified INTEGER NOT NULL DEFAULT 0,
 inspected INTEGER NOT NULL DEFAULT 0,
 operator TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 claimed_by TEXT,
 claimed_at TEXT,
 settlement_snapshot TEXT,
 completed_at TEXT,
 completion_id TEXT UNIQUE,
 paid_amount INTEGER,
 refund_date TEXT,
 account_expires_at INTEGER,
 purged_at TEXT,
 consent_version TEXT,
 consent_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_refunds_state ON booking_refunds(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_booking_refunds_expiry ON booking_refunds(account_expires_at);

-- No backfill: triggers record only new transitions while the parking switch is on.
CREATE TABLE IF NOT EXISTS parking_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 oid TEXT NOT NULL REFERENCES parking_orders(oid),
 kind TEXT NOT NULL,
 event_key TEXT NOT NULL UNIQUE,
 occurred_at TEXT NOT NULL,
 payload TEXT NOT NULL DEFAULT '{}',
 mode TEXT NOT NULL DEFAULT 'live',
 status TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT UNIQUE,
 provider_mid TEXT,
 sms_mid TEXT,
 phone_hash TEXT,
 config_hash TEXT,
 error TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parking_notifications_queue ON parking_notifications(status,id);
CREATE TABLE IF NOT EXISTS parking_notification_links (
 notification_id INTEGER PRIMARY KEY REFERENCES parking_notifications(id),
 oid TEXT NOT NULL REFERENCES parking_orders(oid),
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS parking_notify_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending')
 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,'paid',NEW.oid||':paid',COALESCE(NEW.paid_at,datetime('now')));
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_arrival AFTER UPDATE OF arrival_at ON parking_orders
WHEN OLD.arrival_at IS NULL AND NEW.arrival_at IS NOT NULL
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,'arrival_received',NEW.oid||':arrival',NEW.arrival_at);
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_status AFTER UPDATE OF status ON parking_orders
WHEN OLD.status<>NEW.status AND NEW.status IN ('applied','issue')
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,CASE NEW.status WHEN 'applied' THEN 'applied' ELSE 'issue' END,
 NEW.oid||':'||NEW.status||':'||NEW.updated_at,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_cancel AFTER UPDATE OF refund_requested_at ON parking_orders
WHEN NEW.refund_requested_at IS NOT NULL AND (OLD.refund_requested_at IS NULL OR OLD.refund_reviewed_at IS NOT NULL)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,'cancel_requested',NEW.oid||':cancel:'||NEW.refund_requested_at,NEW.refund_requested_at);
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_refund AFTER INSERT ON payapp_refunds
WHEN EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at,payload)
 SELECT NEW.oid,CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=NEW.oid)>=o.price THEN 'refunded' ELSE 'partially_refunded' END,
 'refund:'||NEW.mul_no,NEW.created_at,
 json_object('refund_amount',NEW.amount,'refunded_amount',MIN(o.price,(SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=NEW.oid)))
 FROM orders o WHERE o.oid=NEW.oid;
END;

-- 보증금 알림: 활성화 후 새 상태 전환만 같은 트랜잭션으로 기록, 과거 예약 소급 없음.
CREATE TABLE IF NOT EXISTS deposit_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('payment','account','refunded')),
 event_key TEXT NOT NULL UNIQUE,
 occurred_at TEXT NOT NULL,
 payload TEXT NOT NULL DEFAULT '{}',
 mode TEXT NOT NULL DEFAULT 'live',
 status TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT UNIQUE,
 provider_mid TEXT,
 phone_hash TEXT,
 config_hash TEXT,
 error TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS deposit_notifications_queue ON deposit_notifications(status,id);
CREATE TABLE IF NOT EXISTS deposit_notification_lease(name TEXT PRIMARY KEY,until_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS deposit_notice_booking_insert AFTER INSERT ON bookings WHEN NEW.status='confirmed' BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'payment',b.booking_code||':payment',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)=0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.payment') FROM settings WHERE key='deposit_alimtalk'),0)=1;
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)<>0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS deposit_notice_booking_confirm AFTER UPDATE OF status ON bookings WHEN NEW.status='confirmed' AND OLD.status<>'confirmed' BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'payment',b.booking_code||':payment',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)=0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.payment') FROM settings WHERE key='deposit_alimtalk'),0)=1;
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)<>0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS deposit_notice_inquiry_checks_insert AFTER INSERT ON inquiry_checks WHEN (COALESCE(json_extract(NEW.checks,'$.guarantee_paid'),0))<>0 BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.inquiry_ref=NEW.ref AND b.status IN ('confirmed','completed') AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS deposit_notice_inquiry_checks_paid AFTER UPDATE OF checks ON inquiry_checks WHEN (COALESCE(json_extract(NEW.checks,'$.guarantee_paid'),0))<>0 AND (COALESCE(json_extract(OLD.checks,'$.guarantee_paid'),0))=0 BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.inquiry_ref=NEW.ref AND b.status IN ('confirmed','completed') AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS deposit_notice_booking_deposit_checks_insert AFTER INSERT ON booking_deposit_checks WHEN (NEW.paid)<>0 BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND b.inquiry_ref IS NULL AND b.status IN ('confirmed','completed') AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS deposit_notice_booking_deposit_checks_paid AFTER UPDATE OF paid ON booking_deposit_checks WHEN (NEW.paid)<>0 AND (OLD.paid)=0 BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND b.inquiry_ref IS NULL AND b.status IN ('confirmed','completed') AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS deposit_notice_refunded AFTER UPDATE OF state ON booking_refunds WHEN NEW.state='completed' AND OLD.state<>'completed' BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'refunded',b.booking_code||':refunded',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.refunded') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;

-- Existing reservations get a baseline only. Installing this migration never queues a send.
CREATE TABLE IF NOT EXISTS booking_guide_state (
 booking_code TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 manual_sent TEXT,
 manual_revision INTEGER NOT NULL DEFAULT 0,
 needs_review INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO booking_guide_state(booking_code,manual_sent)
 SELECT b.booking_code,CASE WHEN NOT EXISTS (
  SELECT 1 FROM booking_guide_messages m JOIN bookings other ON other.booking_code=m.booking_code
  WHERE other.inquiry_ref=b.inquiry_ref AND m.mode='live' AND m.purpose='reservation-guide-v1' AND m.status='delivered'
 ) THEN NULLIF(CAST(json_extract(ic.checks,'$.guide_sent') AS TEXT),'0') END
 FROM bookings b LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref;
CREATE TABLE IF NOT EXISTS booking_guide_events (
 booking_code TEXT NOT NULL,
 revision INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','handled','cancelled')),
 message_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(booking_code,revision)
);
CREATE INDEX IF NOT EXISTS guide_events_pending ON booking_guide_events(status,created_at);
CREATE TABLE IF NOT EXISTS booking_guide_lease(name TEXT PRIMARY KEY,until_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS guide_booking_created AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_guide_state(booking_code,manual_sent)
 SELECT NEW.booking_code,CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE inquiry_ref=NEW.inquiry_ref AND booking_code<>NEW.booking_code)
 THEN NULLIF(CAST((SELECT json_extract(checks,'$.guide_sent') FROM inquiry_checks WHERE ref=NEW.inquiry_ref) AS TEXT),'0') END;
 INSERT OR IGNORE INTO booking_guide_events(booking_code,revision)
 SELECT NEW.booking_code,0 WHERE NEW.status='confirmed'
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='reservation_guide'),0)=1
 AND COALESCE((SELECT json_extract(value,'$.automatic') FROM settings WHERE key='reservation_guide'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS guide_booking_changed AFTER UPDATE OF customer_name,phone,space_id,date,start_h,end_h,slot ON bookings
WHEN NEW.customer_name IS NOT OLD.customer_name OR NEW.phone IS NOT OLD.phone OR NEW.space_id IS NOT OLD.space_id
 OR NEW.date IS NOT OLD.date OR NEW.start_h IS NOT OLD.start_h OR NEW.end_h IS NOT OLD.end_h
 OR ((NEW.start_h IS NULL OR NEW.end_h IS NULL) AND NEW.slot IS NOT OLD.slot)
BEGIN
 UPDATE booking_guide_state SET revision=revision+1,needs_review=1 WHERE booking_code=NEW.booking_code;
 UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=NEW.booking_code AND status='pending';
 UPDATE booking_guide_messages SET status='cancelled',error='예약 변경 · 최신 내용으로 다시 미리보기해 주세요.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND status='queued'
 AND (purpose='reservation-guide-v1' OR purpose GLOB 'reservation-guide-v1:r[0-9]*');
END;
CREATE TRIGGER IF NOT EXISTS guide_booking_status AFTER UPDATE OF status ON bookings WHEN NEW.status IS NOT OLD.status BEGIN
 UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=NEW.booking_code AND status='pending' AND NEW.status<>'confirmed';
 UPDATE booking_guide_messages SET status='cancelled',error='확정 예약이 아니므로 발송을 중지했습니다.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND status='queued' AND NEW.status<>'confirmed'
 AND (purpose='reservation-guide-v1' OR purpose GLOB 'reservation-guide-v1:r[0-9]*');
 INSERT INTO booking_guide_events(booking_code,revision)
 SELECT booking_code,revision FROM booking_guide_state WHERE booking_code=NEW.booking_code AND NEW.status='confirmed' AND needs_review=0
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='reservation_guide'),0)=1
 AND COALESCE((SELECT json_extract(value,'$.automatic') FROM settings WHERE key='reservation_guide'),0)=1
 ON CONFLICT(booking_code,revision) DO UPDATE SET status='pending' WHERE booking_guide_events.status='cancelled';
END;
-- A manual inquiry check applies only to bookings present at that moment, at their current revision.
-- A newly added sibling must never inherit an older inquiry check.
CREATE TRIGGER IF NOT EXISTS guide_manual_insert AFTER INSERT ON inquiry_checks
WHEN COALESCE(json_extract(NEW.checks,'$.guide_sent'),0)<>0 BEGIN
 UPDATE booking_guide_state SET manual_sent=CAST(json_extract(NEW.checks,'$.guide_sent') AS TEXT),manual_revision=revision
 WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=NEW.ref AND status<>'cancelled');
END;
CREATE TRIGGER IF NOT EXISTS guide_manual_update AFTER UPDATE OF checks ON inquiry_checks
WHEN json_extract(NEW.checks,'$.guide_sent') IS NOT json_extract(OLD.checks,'$.guide_sent') BEGIN
 UPDATE booking_guide_state SET manual_sent=NULLIF(CAST(json_extract(NEW.checks,'$.guide_sent') AS TEXT),'0'),manual_revision=revision
 WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=NEW.ref AND status<>'cancelled');
END;
CREATE TRIGGER IF NOT EXISTS guide_manual_delete AFTER DELETE ON inquiry_checks BEGIN
 UPDATE booking_guide_state SET manual_sent=NULL WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=OLD.ref);
END;
-- An unsent deposit notice must remain visible after an edit. It is never resent automatically.
CREATE TRIGGER IF NOT EXISTS booking_deposit_review AFTER UPDATE OF customer_name,phone,space_id,date,start_h,end_h,slot,confirm_doc ON bookings
WHEN NEW.customer_name IS NOT OLD.customer_name OR NEW.phone IS NOT OLD.phone OR NEW.space_id IS NOT OLD.space_id
 OR NEW.date IS NOT OLD.date OR NEW.start_h IS NOT OLD.start_h OR NEW.end_h IS NOT OLD.end_h
 OR ((NEW.start_h IS NULL OR NEW.end_h IS NULL) AND NEW.slot IS NOT OLD.slot)
 OR COALESCE((SELECT amount FROM booking_refunds WHERE booking_code=NEW.booking_code),json_extract(NEW.confirm_doc,'$.deposit'),(SELECT json_extract(data,'$.deposit') FROM quotes WHERE inquiry_ref=NEW.inquiry_ref ORDER BY id DESC LIMIT 1),150000) IS NOT COALESCE((SELECT amount FROM booking_refunds WHERE booking_code=OLD.booking_code),json_extract(OLD.confirm_doc,'$.deposit'),(SELECT json_extract(data,'$.deposit') FROM quotes WHERE inquiry_ref=OLD.inquiry_ref ORDER BY id DESC LIMIT 1),150000)
BEGIN
 UPDATE deposit_notifications SET status='review',error='예약 변경 · 최신 내용 확인 후 재안내가 필요합니다.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND kind IN ('payment','account') AND status IN ('queued','review')
 AND request_id IS NULL AND provider_mid IS NULL;
END;

-- No existing customer links or messages are generated by this migration.
CREATE TABLE IF NOT EXISTS booking_portal_links (
 booking_code TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 link_cipher TEXT NOT NULL,
 recipient_hash TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_portal_expiry ON booking_portal_links(expires_at);

-- 실제 이용료 입금·환불 기록. 반환 보증금은 별도 관리합니다.
CREATE TABLE IF NOT EXISTS booking_payment_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('receipt','refund')),
 amount INTEGER NOT NULL CHECK(amount>0),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(booking_code,request_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_payment_entries ON booking_payment_entries(booking_code,id);

INSERT OR IGNORE INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at)
 SELECT b.booking_code,'legacy-confirmation','receipt',MAX(0,CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)-(SELECT COALESCE(SUM(MAX(0,o.price-MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid AND datetime(r.created_at)<=datetime(COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at))),CASE WHEN o.status='refunded' AND datetime(o.updated_at)<=datetime(COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at)) THEN o.price ELSE 0 END)))),0) FROM orders o WHERE o.booking_code=b.booking_code AND o.test=0 AND o.status IN ('paid','refunded') AND (o.paid_at IS NULL OR datetime(o.paid_at)<=datetime(COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at))))),'기존 확정서의 받은 금액 이관',COALESCE(json_extract(b.confirm_doc,'$.updated_at'),b.created_at)
 FROM bookings b WHERE json_valid(b.confirm_doc) AND CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)>0
 AND json_type(b.confirm_doc,'$.settlement') IS NULL AND NOT EXISTS(SELECT 1 FROM settings WHERE key='payment_legacy:'||b.booking_code)
 AND NOT EXISTS(SELECT 1 FROM booking_payment_entries e WHERE e.booking_code=b.booking_code)
 AND CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)>(SELECT COALESCE(SUM(MAX(0,o.price-MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid AND datetime(r.created_at)<=datetime(COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at))),CASE WHEN o.status='refunded' AND datetime(o.updated_at)<=datetime(COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at)) THEN o.price ELSE 0 END)))),0) FROM orders o WHERE o.booking_code=b.booking_code AND o.test=0 AND o.status IN ('paid','refunded') AND (o.paid_at IS NULL OR datetime(o.paid_at)<=datetime(COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at))));
INSERT OR IGNORE INTO settings(key,value,updated_at) SELECT 'payment_legacy:'||booking_code,'1',created_at FROM bookings WHERE json_valid(confirm_doc) AND json_type(confirm_doc,'$.settlement') IS NULL AND json_extract(confirm_doc,'$.paid') IS NOT NULL;

-- Corrections append history; original receipt/refund rows remain intact.
CREATE TABLE IF NOT EXISTS booking_payment_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 entry_id INTEGER NOT NULL REFERENCES booking_payment_entries(id),
 request_id TEXT NOT NULL,
 previous_version INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('correct','void')),
 kind TEXT NOT NULL CHECK(kind IN ('receipt','refund')),
 amount INTEGER NOT NULL CHECK(amount>0),
 note TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(booking_code,request_id),
 UNIQUE(entry_id,previous_version)
);
CREATE INDEX IF NOT EXISTS idx_payment_revisions_entry ON booking_payment_revisions(entry_id,id);
CREATE INDEX IF NOT EXISTS idx_payment_revisions_booking ON booking_payment_revisions(booking_code,id);
CREATE VIEW IF NOT EXISTS booking_payment_current AS
 SELECT e.id,e.booking_code,e.request_id,COALESCE(r.kind,e.kind) AS kind,
 COALESCE(r.amount,e.amount) AS amount,COALESCE(r.note,e.note) AS note,
 CASE WHEN r.action='void' THEN 'void' ELSE 'active' END AS state,
 COALESCE(r.id,0) AS version,e.created_at,COALESCE(r.created_at,e.created_at) AS updated_at,
 e.kind AS original_kind,e.amount AS original_amount,e.note AS original_note
 FROM booking_payment_entries e LEFT JOIN booking_payment_revisions r
 ON r.id=(SELECT MAX(latest.id) FROM booking_payment_revisions latest WHERE latest.entry_id=e.id);

-- Provider notices are deduplicated separately from effective refund accounting.
CREATE TABLE IF NOT EXISTS payapp_refund_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_key TEXT NOT NULL UNIQUE,
 oid TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('baseline','partial','full')),
 original_no TEXT NOT NULL,
 refund_no TEXT NOT NULL,
 raw_amount INTEGER NOT NULL CHECK(raw_amount>=0),
 effective_amount INTEGER NOT NULL CHECK(effective_amount>=0),
 state_changed INTEGER NOT NULL DEFAULT 0,
 fingerprint TEXT NOT NULL,
 processing_token TEXT NOT NULL,
 provider_at TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payapp_refund_events_oid ON payapp_refund_events(oid,created_at,event_key);

CREATE TABLE IF NOT EXISTS booking_cancellation_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 previous_version INTEGER NOT NULL,
 processing_token TEXT NOT NULL,
 terms TEXT NOT NULL CHECK(json_valid(terms)),
 created_at TEXT NOT NULL,
 UNIQUE(booking_code,request_id)
);
CREATE INDEX IF NOT EXISTS idx_cancellation_revisions_booking ON booking_cancellation_revisions(booking_code,id);
CREATE TABLE IF NOT EXISTS booking_cancellation_state (
 booking_code TEXT PRIMARY KEY,
 revision INTEGER NOT NULL,
 document TEXT CHECK(document IS NULL OR json_valid(document))
);

CREATE TABLE IF NOT EXISTS booking_reconfirmations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 signature TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 show_amount INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 processing_token TEXT NOT NULL,
 UNIQUE(booking_code,request_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_reconfirmations_code ON booking_reconfirmations(booking_code,id);

-- Payment notifications for staff are independent of customer Alimtalk settings.
CREATE TABLE IF NOT EXISTS admin_parking_payment_reads (
 oid TEXT PRIMARY KEY REFERENCES parking_orders(oid),
 read_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_admin_sms (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 oid TEXT REFERENCES parking_orders(oid),
 receiver TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live','test')),
 event_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT UNIQUE,
 provider_mid TEXT,
 config_hash TEXT,
 error TEXT NOT NULL DEFAULT '',
 occurred_at TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS parking_admin_sms_queue ON parking_admin_sms(status,id);
CREATE TRIGGER IF NOT EXISTS parking_admin_sms_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND NEW.test=0
 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_admin_alerts'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)
 SELECT NEW.oid,j.value,NEW.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')
 FROM settings s,json_each(s.value,'$.phones') j WHERE s.key='parking_admin_alerts';
END;

-- One bank receipt, split into rental income and a separately refundable deposit.
CREATE TABLE IF NOT EXISTS booking_combined_receipts (
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 total INTEGER NOT NULL CHECK(total>0),
 fee INTEGER NOT NULL CHECK(fee>0),
 deposit INTEGER NOT NULL CHECK(deposit>0 AND total=fee+deposit),
 note TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(booking_code,request_id)
);

CREATE TABLE IF NOT EXISTS deposit_account_reminder_previews (
 id TEXT PRIMARY KEY,
 items TEXT NOT NULL,
 config_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deposit_account_notice_lookup ON deposit_notifications(booking_code,kind,mode,id);
-- One payment can contain independent parking registrations for up to ten vehicles.
CREATE TABLE IF NOT EXISTS parking_batches (oid TEXT PRIMARY KEY REFERENCES orders(oid),token_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS parking_orders_payment ON parking_orders(payment_oid,created_at);
CREATE TRIGGER IF NOT EXISTS parking_batch_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND EXISTS(SELECT 1 FROM parking_batches WHERE oid=NEW.oid)
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 SELECT p.oid,'paid',p.oid||':paid',COALESCE(NEW.paid_at,datetime('now')) FROM parking_orders p
 WHERE p.payment_oid=NEW.oid AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1;
 INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)
 SELECT p.oid,j.value,p.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')
 FROM parking_orders p,settings s,json_each(s.value,'$.phones') j WHERE p.payment_oid=NEW.oid AND NEW.test=0 AND s.key='parking_admin_alerts' AND json_extract(s.value,'$.enabled')=1;
END;
CREATE TRIGGER IF NOT EXISTS parking_batch_refund AFTER INSERT ON payapp_refunds
WHEN EXISTS(SELECT 1 FROM parking_batches WHERE oid=NEW.oid)
BEGIN
 UPDATE parking_orders SET status='issue',memo='통합 결제 취소 내역 확인 필요 · 등록 보류',updated_at=NEW.created_at
 WHERE payment_oid=NEW.oid AND status IN ('waiting','requested');
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at,payload)
 SELECT p.oid,'refunded','refund:'||NEW.mul_no||':'||p.oid,NEW.created_at,json_object('refund_amount',p.vehicle_price,'refunded_amount',p.vehicle_price)
 FROM parking_orders p JOIN orders o ON o.oid=p.payment_oid WHERE p.payment_oid=NEW.oid
 AND (SELECT SUM(amount) FROM payapp_refunds WHERE oid=NEW.oid)>=o.price
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1;
END;

-- Service messages for new customer-facing transactions. Existing rows are not replayed.
CREATE TABLE IF NOT EXISTS transaction_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 audience TEXT NOT NULL CHECK(audience IN ('customer','admin')),
 ref TEXT NOT NULL,
 booking_code TEXT,
 receiver TEXT NOT NULL,
 amount INTEGER,
 status TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT UNIQUE,
 provider_mid TEXT,
 error TEXT NOT NULL DEFAULT '',
 occurred_at TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(event_key,audience,receiver)
);
CREATE INDEX IF NOT EXISTS transaction_notification_queue ON transaction_notifications(status,id);

CREATE TRIGGER IF NOT EXISTS transaction_notify_staff AFTER INSERT ON transaction_notifications
WHEN NEW.audience='customer' AND NEW.kind IN ('inquiry','reservation_request','payment_review')
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at)
 SELECT NEW.event_key,NEW.kind,'admin',NEW.ref,NEW.booking_code,COALESCE(j.value,''),NEW.amount,NEW.occurred_at
 FROM (SELECT 1) seed LEFT JOIN json_each((SELECT CASE WHEN json_valid(value) THEN value END
   FROM settings WHERE key='parking_admin_alerts'),'$.phones') j ON 1=1;
END;

CREATE TRIGGER IF NOT EXISTS transaction_notify_inquiry AFTER INSERT ON inquiries
WHEN NEW.status='문의 접수'
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,receiver,occurred_at)
 VALUES('inquiry:'||NEW.ref,CASE WHEN json_valid(NEW.data) AND json_extract(NEW.data,'$.reserve') THEN 'reservation_request' ELSE 'inquiry' END,
 'customer',NEW.ref,COALESCE(NEW.phone,''),NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS transaction_notify_payment_review AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND NEW.test=0
 AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=NEW.booking_code AND status='payment_review')
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at)
 VALUES('review:'||NEW.oid,'payment_review','customer',NEW.oid,NEW.booking_code,COALESCE(NEW.buyer_phone,''),NEW.price,COALESCE(NEW.paid_at,datetime('now')));
END;

CREATE TRIGGER IF NOT EXISTS transaction_notify_cancel AFTER UPDATE OF status ON bookings
WHEN NEW.status='cancelled' AND OLD.status IN ('confirmed','completed','payment_review')
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'cancel:'||NEW.booking_code||':'||COALESCE(MAX(id),0),'booking_cancelled','customer',
 NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),COALESCE(NEW.updated_at,datetime('now'))
 FROM booking_reconfirmations WHERE booking_code=NEW.booking_code;
END;

CREATE TRIGGER IF NOT EXISTS transaction_notify_manual_refund AFTER INSERT ON booking_payment_entries
WHEN NEW.kind='refund' AND NEW.amount>0
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at)
 SELECT 'manual-refund:'||NEW.id,'rental_refund','customer',b.booking_code,b.booking_code,COALESCE(b.phone,''),NEW.amount,NEW.created_at
 FROM bookings b WHERE b.booking_code=NEW.booking_code;
END;

CREATE TRIGGER IF NOT EXISTS transaction_notify_online_refund AFTER INSERT ON payapp_refunds
WHEN NEW.amount>0
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,receiver,amount,occurred_at)
 SELECT 'online-refund:'||NEW.mul_no,
 CASE WHEN o.product_id='parking-batch' THEN 'parking_partial_refund' ELSE 'rental_refund' END,
 'customer',o.oid,COALESCE(o.buyer_phone,''),NEW.amount,NEW.created_at
 FROM orders o WHERE o.oid=NEW.oid AND o.test=0 AND (
   o.product_id NOT LIKE 'parking-%' OR
   (o.product_id='parking-batch' AND (SELECT SUM(amount) FROM payapp_refunds WHERE oid=NEW.oid)<o.price)
 );
END;

-- ===== 입점 호스트 플랫폼 (2026-11-12) — 호스트 계정 · 입점 공간 · 사진 · 예약 · 본사 부가서비스 · 행사 지원 · 통계 · 이용료 =====
CREATE TABLE IF NOT EXISTS hosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                -- 호스트 번호 H-YYMM-XXXX
  email TEXT NOT NULL UNIQUE,               -- 로그인 이메일 (소문자)
  pw_hash TEXT NOT NULL,                    -- PBKDF2 (원문 저장 안 함)
  name TEXT NOT NULL,                       -- 담당자 이름
  phone TEXT NOT NULL,
  company TEXT, biz_no TEXT,                -- 상호 · 사업자등록번호 (선택)
  status TEXT NOT NULL DEFAULT 'active',    -- active | blocked | left
  settings TEXT NOT NULL DEFAULT '{}',      -- 알림 받을 연락처 등 JSON
  memo TEXT,                                -- 본사 메모
  created_at TEXT NOT NULL, updated_at TEXT, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS host_sessions (
  token_hash TEXT PRIMARY KEY, host_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_host_sessions_host ON host_sessions(host_id);
CREATE TABLE IF NOT EXISTS host_spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- 공간 번호 SP-YYMM-XXXX
  host_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',     -- draft 작성 중 | review 심사 대기 | fix 보완 요청 | live 공개 중 | paused 일시 중지(호스트) | hidden 숨김(본사) | rejected 반려
  name TEXT NOT NULL,
  region TEXT NOT NULL,                     -- seoul | incheon | gyeonggi | etc
  address TEXT,
  capacity INTEGER, area INTEGER,           -- 최대 인원 · 면적(평)
  tier TEXT,                                -- mega 초대형(100명·100평 이상) | large 대형(50명·50평 이상)
  types TEXT,                               -- 공간 유형 JSON 배열 (최대 5)
  price_from INTEGER,                       -- 목록에 보여 줄 최저 금액 (없으면 견적 문의)
  data TEXT NOT NULL,                       -- 소개·요금·옵션·시설·규정·연락 채널·결제 방법·사업자 정보 JSON
  free_until TEXT, paid_until TEXT,         -- 무료 등록 종료일 · 이용료 납부 종료일 (둘 중 늦은 날까지 공개)
  plan TEXT,                                -- 마지막으로 적용한 이용료 플랜
  boost INTEGER NOT NULL DEFAULT 0,         -- 목록 순서 가중치 (본사 설정)
  review_note TEXT, memo TEXT,              -- 호스트에게 보이는 심사 메모 · 본사 내부 메모
  submitted_at TEXT, approved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_host_spaces_host ON host_spaces(host_id);
CREATE INDEX IF NOT EXISTS idx_host_spaces_live ON host_spaces(status, region);
CREATE TABLE IF NOT EXISTS host_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pid TEXT NOT NULL UNIQUE,                 -- 사진 주소에 쓰는 무작위 값
  space_ref TEXT NOT NULL, host_id INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL, bytes INTEGER, w INTEGER, h INTEGER,
  body TEXT NOT NULL,                       -- 본문 (base64 · 브라우저에서 줄여서 올림)
  thumb TEXT,                               -- 목록용 작은 사진 (base64)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_host_photos_space ON host_photos(space_ref, sort);
CREATE TABLE IF NOT EXISTS host_blocks (    -- 호스트가 닫아 둔 날짜
  space_ref TEXT NOT NULL, day TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (space_ref, day)
);
CREATE TABLE IF NOT EXISTS host_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                -- 예약번호 HB-YYMM-XXXX
  space_ref TEXT NOT NULL, host_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',       -- new 새 문의 | quoted 견적 안내 | pending 예약 대기 | confirmed 예약 확정 | done 이용 완료 | cancelled 취소 | declined 진행 불가
  source TEXT NOT NULL DEFAULT 'web',       -- web 홈페이지 | host 호스트가 직접 등록 (전화·카톡·현장 예약)
  name TEXT NOT NULL, phone TEXT NOT NULL, phone_last4 TEXT, email TEXT,
  event_date TEXT, start_time TEXT, end_time TEXT, people INTEGER,
  amount INTEGER,                           -- 견적·확정 금액
  paid INTEGER NOT NULL DEFAULT 0,          -- 호스트가 기록한 받은 금액 합계
  data TEXT NOT NULL,                       -- 요청 내용·예상 금액·견적·결제 기록·주고받은 메시지 JSON
  created_at TEXT NOT NULL, updated_at TEXT, confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_host_bookings_host ON host_bookings(host_id, status);
CREATE INDEX IF NOT EXISTS idx_host_bookings_space ON host_bookings(space_ref, event_date);
CREATE TABLE IF NOT EXISTS hq_addons (      -- 본사 부가서비스 요청 (입점 공간 예약·행사 지원에서 들어옴)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- AO-YYMM-XXXX
  booking_code TEXT, planning_ref TEXT, space_ref TEXT,
  service TEXT NOT NULL,                    -- buffet | catering | cocktail | mc | manager | design
  status TEXT NOT NULL DEFAULT 'new',       -- new 접수 | talking 안내 중 | confirmed 확정 | done 완료 | cancelled 취소
  amount INTEGER,
  data TEXT NOT NULL,                       -- 고객·일정·요청 메모 JSON
  memo TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hq_addons_status ON hq_addons(status, created_at);
CREATE INDEX IF NOT EXISTS idx_hq_addons_booking ON hq_addons(booking_code);
CREATE TABLE IF NOT EXISTS planning_requests (  -- 행사 지원 요청 (메가스팟에 맡겨 주세요)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- PL-YYMM-XXXX
  status TEXT NOT NULL DEFAULT 'new',       -- new 접수 | planning 기획 중 | proposed 제안 발송 | won 진행 확정 | done 완료 | closed 종료
  name TEXT NOT NULL, phone TEXT NOT NULL, phone_last4 TEXT, email TEXT,
  event_date TEXT, people INTEGER, budget_pp INTEGER, region TEXT,
  data TEXT NOT NULL,                       -- 행사 종류·필요한 항목·요청 내용 JSON
  proposal TEXT,                            -- 본사 제안 요약 JSON (고객 조회 화면에 표시)
  memo TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_planning_status ON planning_requests(status, created_at);
CREATE TABLE IF NOT EXISTS host_stats (     -- 공간별·날짜별 노출·조회·연락·문의 수
  space_ref TEXT NOT NULL, day TEXT NOT NULL,
  imp INTEGER NOT NULL DEFAULT 0, view INTEGER NOT NULL DEFAULT 0, contact INTEGER NOT NULL DEFAULT 0,
  sns INTEGER NOT NULL DEFAULT 0, fav INTEGER NOT NULL DEFAULT 0, inquiry INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (space_ref, day)
);
CREATE TABLE IF NOT EXISTS host_billing (   -- 입점 이용료 신청·납부
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- BL-YYMM-XXXX
  host_id INTEGER NOT NULL, space_ref TEXT NOT NULL,
  plan TEXT NOT NULL, months INTEGER NOT NULL, amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested 결제 대기 | paid 결제 완료 | refunded 해지·환불 | cancelled 취소 (amount = 부가세 포함 합계)
  period_from TEXT, period_to TEXT,
  data TEXT,                                -- 세금계산서 요청 등 JSON
  created_at TEXT NOT NULL, paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_host_billing_space ON host_billing(space_ref, status);

-- Optional second Alimtalk recipient, managed only in admin; no public identity changes.
CREATE TABLE IF NOT EXISTS booking_contacts (
 booking_code TEXT PRIMARY KEY REFERENCES bookings(booking_code),
 phone2 TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL
);

-- Independent operator checklist; never writes payment amounts or sends notifications.
CREATE TABLE IF NOT EXISTS reservation_payment_checks (
 target_type TEXT NOT NULL CHECK(target_type IN ('booking','inquiry')),
 target_ref TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('unpaid','reservation_paid','balance_paid','fully_paid')),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(target_type,target_ref)
);
CREATE TRIGGER IF NOT EXISTS reservation_payment_inherit AFTER INSERT ON bookings WHEN NEW.inquiry_ref IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO reservation_payment_checks(target_type,target_ref,status,version,updated_at)
 SELECT 'booking',NEW.booking_code,status,1,updated_at FROM reservation_payment_checks WHERE target_type='inquiry' AND target_ref=NEW.inquiry_ref;
END;
CREATE TABLE IF NOT EXISTS host_billing_pay (   -- 입점 이용료 결제(페이앱·계좌이체)와 중도 해지 환불 기록 — host_billing 한 줄에 한 줄
  ref TEXT PRIMARY KEY,                     -- host_billing.ref
  method TEXT NOT NULL DEFAULT 'online',    -- online 온라인 결제(페이앱) | bank 계좌이체
  supply INTEGER, vat INTEGER,              -- 공급가액 · 부가세 (host_billing.amount = 합계)
  nonce TEXT, reqs TEXT, payurl TEXT, requested_at TEXT,   -- 결제 요청 확인값 · 요청해 받은 거래번호 목록(JSON) · 결제창 주소 · 요청 시각
  mul_no TEXT, pay_type TEXT, pg_state TEXT,               -- 결제된 거래번호 · 결제수단 · pending(입금 대기) | paid
  pg_refunded INTEGER NOT NULL DEFAULT 0, refund_nos TEXT, -- 페이앱이 통보한 취소 합계 · 반영한 부분 취소 번호(JSON)
  cancel_status TEXT,                       -- requested 해지 신청 | done 환불 완료 | withdrawn 신청 철회
  cancel_base TEXT, cancel_calc TEXT, cancel_reason TEXT, cancel_requested_at TEXT,   -- 해지 기준일 · 환불 계산 내역(JSON)
  refund_amount INTEGER, refunded_at TEXT, refund_memo TEXT,
  alert TEXT,                               -- 운영팀 확인이 필요한 일 (중복 결제 등)
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS host_notifications (   -- 호스트 문자 알림 (새 문의·견적 수락·입금 알림·취소·고객 메시지·심사 결과·이용료)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,           -- 같은 일은 한 번만 보냅니다
  receiver TEXT NOT NULL, msg TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',    -- queued | sending | accepted 발송 | failed | unknown 확인 필요 | held 발송 꺼짐 | skipped 한도 초과
  error TEXT, request_id TEXT, provider_mid TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_host_notifications_host ON host_notifications(host_id, created_at);
CREATE TABLE IF NOT EXISTS member_hosts (   -- 메가스팟 회원 계정 ↔ 호스트 계정 연결 (회원 로그인 → 호스트 전환)
  member_id INTEGER PRIMARY KEY,            -- members.id
  host_id INTEGER NOT NULL UNIQUE,          -- hosts.id
  created_at TEXT NOT NULL
);

-- Existing bookings are baselines; installation never sends old confirmation/paid notices.
CREATE TABLE IF NOT EXISTS booking_payment_schedule (
 booking_code TEXT PRIMARY KEY,
 due_date TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_journey_state (
 booking_code TEXT PRIMARY KEY,
 confirm_version INTEGER NOT NULL DEFAULT 0,
 confirmed_at TEXT,
 amount_visible INTEGER NOT NULL DEFAULT 1,
 paid_state INTEGER NOT NULL DEFAULT 1,
 paid_cycle INTEGER NOT NULL DEFAULT 0,
 checked_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO booking_journey_state(booking_code,confirmed_at,amount_visible)
 SELECT booking_code,created_at,CASE WHEN json_valid(confirm_doc) THEN COALESCE(json_extract(confirm_doc,'$.show_amount'),1) ELSE 1 END FROM bookings;
CREATE TRIGGER IF NOT EXISTS journey_booking_created AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_journey_state(booking_code,confirm_version,confirmed_at,paid_state)
 VALUES(NEW.booking_code,CASE WHEN NEW.status='confirmed' THEN 1 ELSE 0 END,datetime('now','+9 hours'),0);
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'journey-confirm:'||NEW.booking_code||':1','booking_confirmed','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),datetime('now')
 WHERE NEW.status='confirmed' AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS journey_booking_confirmed AFTER UPDATE OF status ON bookings
WHEN NEW.status='confirmed' AND OLD.status<>'confirmed' BEGIN
 UPDATE booking_journey_state SET confirm_version=confirm_version+1,confirmed_at=datetime('now','+9 hours'),paid_state=0 WHERE booking_code=NEW.booking_code;
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'journey-confirm:'||NEW.booking_code||':'||confirm_version,'booking_confirmed','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),datetime('now')
 FROM booking_journey_state WHERE booking_code=NEW.booking_code AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=1;
END;

CREATE TRIGGER IF NOT EXISTS journey_amount_visibility AFTER UPDATE OF confirm_doc ON bookings
WHEN json_valid(NEW.confirm_doc) OR json_valid(OLD.confirm_doc) BEGIN
 UPDATE booking_journey_state SET amount_visible=CASE WHEN json_valid(NEW.confirm_doc) THEN COALESCE(json_extract(NEW.confirm_doc,'$.show_amount'),1) ELSE COALESCE(json_extract(OLD.confirm_doc,'$.show_amount'),1) END WHERE booking_code=NEW.booking_code;
END;
