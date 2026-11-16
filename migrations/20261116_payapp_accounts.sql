-- Apply once to an existing database; existing NULL bindings remain the original PAYAPP_USERID.
ALTER TABLE payapp_payments ADD COLUMN merchant_userid TEXT;
ALTER TABLE host_billing_pay ADD COLUMN merchant_userid TEXT;

-- 계정 전환 전후의 요청을 개별 보존합니다. nonce는 API 호출 전에 저장합니다.
CREATE TABLE IF NOT EXISTS host_billing_pay_requests (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  merchant_userid TEXT NOT NULL,
  nonce TEXT NOT NULL,
  mul_no TEXT,
  status TEXT NOT NULL DEFAULT 'requesting', -- requesting | requested | pending | legacy | paid | cancelled | rejected
  created_at TEXT NOT NULL,
  UNIQUE(merchant_userid, mul_no)
);
CREATE INDEX IF NOT EXISTS idx_host_billing_pay_requests_ref ON host_billing_pay_requests(ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_host_billing_pay_requests_open ON host_billing_pay_requests(ref) WHERE status IN ('requesting','requested','pending');
