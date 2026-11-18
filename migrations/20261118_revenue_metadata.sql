-- 매출 분석용 분류만 저장합니다. 결제·수납·환불 원장은 변경하지 않습니다.
CREATE TABLE IF NOT EXISTS revenue_payment_metadata (
  movement_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'unknown'
    CHECK(channel IN ('unknown','spacecloud','payapp','toss_terminal','bank_corporate','bank_personal')),
  account TEXT NOT NULL DEFAULT '',
  components TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_at TEXT NOT NULL
);
