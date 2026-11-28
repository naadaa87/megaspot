-- 수납 장부 (2026-11-28) — 관리자 '수납 장부'에서 쓰는 새 표 세 개
-- 서버가 처음 요청을 받을 때 functions/api/_schema.js 로 자동으로 만듭니다. 이 파일은 검토·수동 적용용입니다.
-- 기존 예약·문의·주문·결제·정산 표는 바꾸지 않습니다 (CREATE ... IF NOT EXISTS 만 있음).
CREATE TABLE IF NOT EXISTS ledger_entries (   -- 수납 장부 (2026-11-28): 예약(고객)별 수납·환불·보증금·추가 청구·할인 기록 · 기존 예약·결제 표와 따로 관리
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receipt','refund','deposit_in','deposit_out','charge','discount')),
  item TEXT NOT NULL DEFAULT '',            -- rental(이용료) | food | service | extra | deposit | other
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT '',          -- bank_corp | bank_personal | payapp | pos | cash | other ('' = 추가 청구·할인)
  method_note TEXT NOT NULL DEFAULT '',     -- '기타' 수납방법 직접 입력
  paid_on TEXT NOT NULL,                    -- 수납일자(추가 청구·할인은 청구일) YYYY-MM-DD
  payer TEXT NOT NULL DEFAULT '',           -- 입금자·결제자명
  proof TEXT NOT NULL DEFAULT '',           -- tax_invoice | cash_receipt | card | none
  ref_no TEXT NOT NULL DEFAULT '',          -- 승인번호·거래번호·페이앱 결제번호
  source_ref TEXT,                          -- 시스템 결제 기록에서 옮긴 경우 그 기록 (order:… refund:… link:… manual:… legacy:…)
  memo TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',     -- 담당자
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','void')),
  void_reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  request_id TEXT NOT NULL UNIQUE,          -- 같은 저장 요청이 두 번 들어와도 한 줄만
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_code ON ledger_entries(booking_code, state);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_day ON ledger_entries(paid_on, state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_source ON ledger_entries(source_ref) WHERE source_ref IS NOT NULL AND state = 'active';
CREATE TABLE IF NOT EXISTS ledger_bookings (   -- 수납 장부 (2026-11-28): 예약별 청구 기준 금액 지정 · 기존 결제 옮기기 확인 · 장부 메모
  booking_code TEXT PRIMARY KEY,
  base_override INTEGER,                    -- 예약 금액 대신 쓸 청구 기준 금액 (NULL = 예약 금액 그대로)
  base_reason TEXT NOT NULL DEFAULT '',
  checked_at TEXT,                          -- 기존 결제 기록을 장부에 옮기고 확인을 마친 때
  memo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_revisions (   -- 수납 장부 (2026-11-28): 기록·수정·취소 이력 (바뀌기 전·후 값을 그대로 보관)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL,
  entry_id INTEGER,                         -- NULL = 예약별 설정(meta)
  action TEXT NOT NULL,                     -- create | edit | void | meta
  before TEXT,
  after TEXT,
  reason TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_revisions_code ON ledger_revisions(booking_code, id);
