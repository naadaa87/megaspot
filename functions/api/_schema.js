// 자동 생성 파일 — 고치지 마세요. 원본은 schema.sql 이고 tools/build_site.py 가 만듭니다.
export const SCHEMA = [
 "CREATE TABLE IF NOT EXISTS inquiries ( id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, space_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT '문의 접수', name TEXT, phone TEXT, email TEXT, event_date TEXT, headcount INTEGER, data TEXT NOT NULL, memo TEXT, created_at TEXT NOT NULL, updated_at TEXT )",
 "CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status, created_at)",
 "CREATE TABLE IF NOT EXISTS host_applications ( id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT '접수', data TEXT NOT NULL, created_at TEXT NOT NULL )",
 "CREATE TABLE IF NOT EXISTS bookings ( id INTEGER PRIMARY KEY AUTOINCREMENT, booking_code TEXT NOT NULL UNIQUE, space_id TEXT NOT NULL, inquiry_ref TEXT, customer_name TEXT NOT NULL, phone TEXT NOT NULL, phone_last4 TEXT NOT NULL, date TEXT NOT NULL, slot TEXT, headcount INTEGER, memo TEXT, status TEXT NOT NULL DEFAULT 'confirmed', amount INTEGER, start_h INTEGER, end_h INTEGER, created_at TEXT NOT NULL, updated_at TEXT )",
 "CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(space_id, date)",
 "CREATE TABLE IF NOT EXISTS reviews ( id INTEGER PRIMARY KEY AUTOINCREMENT, space_id TEXT NOT NULL, booking_code TEXT NOT NULL UNIQUE, author TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), title TEXT NOT NULL, body TEXT NOT NULL, event_type TEXT, headcount INTEGER, status TEXT NOT NULL DEFAULT 'pending', reply TEXT, created_at TEXT NOT NULL, updated_at TEXT )",
 "CREATE INDEX IF NOT EXISTS idx_reviews_space ON reviews(space_id, status)",
 "CREATE TABLE IF NOT EXISTS calendar_blocks ( space_id TEXT NOT NULL, date TEXT NOT NULL, state TEXT NOT NULL, memo TEXT, PRIMARY KEY (space_id, date) )",
 "CREATE TABLE IF NOT EXISTS event_log ( id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, actor TEXT, detail TEXT, created_at TEXT NOT NULL )",
 "CREATE INDEX IF NOT EXISTS idx_event_log_ref_kind ON event_log(ref, kind)",
 "CREATE TABLE IF NOT EXISTS members ( id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, phone TEXT, org TEXT, pw_hash TEXT NOT NULL, agree_marketing INTEGER NOT NULL DEFAULT 0, agreed_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT, last_login_at TEXT )",
 "CREATE TABLE IF NOT EXISTS sessions ( token_hash TEXT PRIMARY KEY, member_id INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ua TEXT )",
 "CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id)",
 "CREATE TABLE IF NOT EXISTS auth_attempts ( key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL )",
 "CREATE TABLE IF NOT EXISTS admin_sessions ( token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT )",
 "CREATE TABLE IF NOT EXISTS quotes ( id INTEGER PRIMARY KEY AUTOINCREMENT, quote_no TEXT NOT NULL UNIQUE, inquiry_ref TEXT, customer TEXT, event_date TEXT, total INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL )",
 "CREATE INDEX IF NOT EXISTS idx_quotes_ref ON quotes(inquiry_ref, created_at)",
 "CREATE TABLE IF NOT EXISTS inquiry_checks ( ref TEXT PRIMARY KEY, checks TEXT NOT NULL, updated_at TEXT NOT NULL )",
 "CREATE TABLE IF NOT EXISTS orders ( id INTEGER PRIMARY KEY AUTOINCREMENT, oid TEXT NOT NULL UNIQUE, product_id TEXT NOT NULL, title TEXT NOT NULL, event_date TEXT, people INTEGER, price INTEGER NOT NULL, buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_email TEXT, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'created', pay_method TEXT, tid TEXT, appl_at TEXT, result_msg TEXT, booking_code TEXT, inquiry_ref TEXT, member_id INTEGER, memo TEXT, test INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, paid_at TEXT, updated_at TEXT )",
 "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at)",
 "CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL )"
];
