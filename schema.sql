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

CREATE TABLE IF NOT EXISTS host_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                 -- HS-YYMM-XXXX
  status TEXT NOT NULL DEFAULT '접수',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(space_id, date);

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
