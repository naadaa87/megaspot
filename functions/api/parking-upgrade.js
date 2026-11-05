import {json,err,hasDb,requireAdmin,sameOrigin,readJson,log} from './_lib.js';
const VERSION='20261105_parking_batches';
const BACKUP='parking_orders_backup_20261105';
const TABLES=['orders','parking_orders','parking_notifications','parking_notification_links','parking_admin_sms'];
const MIGRATION=[
 "-- Preserve all existing rows and links while removing the old one-vehicle-per-payment foreign key.\nCREATE TABLE IF NOT EXISTS parking_schema_versions(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL);",
 "INSERT INTO parking_schema_versions VALUES('20261105_parking_batches',datetime('now'));",
 "CREATE TABLE parking_migration_guard (violations INTEGER CHECK(violations=0));",
 "INSERT INTO parking_migration_guard SELECT COUNT(*) FROM pragma_table_info('parking_orders') WHERE name='payment_oid';",
 "PRAGMA defer_foreign_keys=ON;",
 "DROP TRIGGER IF EXISTS parking_notify_paid;",
 "DROP TRIGGER IF EXISTS parking_notify_arrival;",
 "DROP TRIGGER IF EXISTS parking_notify_status;",
 "DROP TRIGGER IF EXISTS parking_notify_cancel;",
 "DROP TRIGGER IF EXISTS parking_notify_refund;",
 "DROP TRIGGER IF EXISTS parking_admin_sms_paid;",
 "CREATE TABLE IF NOT EXISTS parking_orders_new (\n oid TEXT PRIMARY KEY,\n payment_oid TEXT REFERENCES orders(oid),\n vehicle_price INTEGER CHECK(vehicle_price>0),\n plate TEXT NOT NULL,\n visit_date TEXT NOT NULL,\n ticket TEXT NOT NULL,\n hours INTEGER,\n daily_terms TEXT NOT NULL DEFAULT '',\n token_hash TEXT NOT NULL,\n status TEXT NOT NULL DEFAULT 'waiting',\n arrival_at TEXT,\n session_id INTEGER REFERENCES parking_sessions(id),\n free_hours INTEGER NOT NULL DEFAULT 0,\n paid_hours INTEGER NOT NULL DEFAULT 0,\n cost INTEGER,\n memo TEXT NOT NULL DEFAULT '',\n refund_requested_at TEXT,\n refund_reason TEXT,\n refund_reviewed_at TEXT,\n applied_at TEXT,\n updated_at TEXT NOT NULL,\n created_at TEXT NOT NULL\n);",
 "INSERT INTO parking_orders_new(oid,plate,visit_date,ticket,hours,daily_terms,token_hash,status,arrival_at,session_id,free_hours,paid_hours,cost,memo,refund_requested_at,refund_reason,refund_reviewed_at,applied_at,updated_at,created_at) SELECT oid,plate,visit_date,ticket,hours,daily_terms,token_hash,status,arrival_at,session_id,free_hours,paid_hours,cost,memo,refund_requested_at,refund_reason,refund_reviewed_at,applied_at,updated_at,created_at FROM parking_orders;",
 "DROP TABLE parking_orders;",
 "ALTER TABLE parking_orders_new RENAME TO parking_orders;",
 "CREATE INDEX IF NOT EXISTS parking_orders_queue ON parking_orders(status,visit_date,created_at);",
 "CREATE UNIQUE INDEX IF NOT EXISTS parking_one_processing_per_entry ON parking_orders(session_id) WHERE status = 'processing';",
 "CREATE TRIGGER IF NOT EXISTS parking_notify_paid AFTER UPDATE OF status ON orders\nWHEN NEW.status='paid' AND OLD.status IN ('created','pending')\n AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1\nBEGIN\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)\n VALUES(NEW.oid,'paid',NEW.oid||':paid',COALESCE(NEW.paid_at,datetime('now')));\nEND;",
 "CREATE TRIGGER IF NOT EXISTS parking_notify_arrival AFTER UPDATE OF arrival_at ON parking_orders\nWHEN OLD.arrival_at IS NULL AND NEW.arrival_at IS NOT NULL\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1\nBEGIN\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)\n VALUES(NEW.oid,'arrival_received',NEW.oid||':arrival',NEW.arrival_at);\nEND;",
 "CREATE TRIGGER IF NOT EXISTS parking_notify_status AFTER UPDATE OF status ON parking_orders\nWHEN OLD.status<>NEW.status AND NEW.status IN ('applied','issue')\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1\nBEGIN\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)\n VALUES(NEW.oid,CASE NEW.status WHEN 'applied' THEN 'applied' ELSE 'issue' END,\n NEW.oid||':'||NEW.status||':'||NEW.updated_at,NEW.updated_at);\nEND;",
 "CREATE TRIGGER IF NOT EXISTS parking_notify_cancel AFTER UPDATE OF refund_requested_at ON parking_orders\nWHEN NEW.refund_requested_at IS NOT NULL AND (OLD.refund_requested_at IS NULL OR OLD.refund_reviewed_at IS NOT NULL)\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1\nBEGIN\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)\n VALUES(NEW.oid,'cancel_requested',NEW.oid||':cancel:'||NEW.refund_requested_at,NEW.refund_requested_at);\nEND;",
 "CREATE TRIGGER IF NOT EXISTS parking_notify_refund AFTER INSERT ON payapp_refunds\nWHEN EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1\nBEGIN\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at,payload)\n SELECT NEW.oid,CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=NEW.oid)>=o.price THEN 'refunded' ELSE 'partially_refunded' END,\n 'refund:'||NEW.mul_no,NEW.created_at,\n json_object('refund_amount',NEW.amount,'refunded_amount',MIN(o.price,(SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=NEW.oid)))\n FROM orders o WHERE o.oid=NEW.oid;\nEND;",
 "CREATE TRIGGER IF NOT EXISTS parking_admin_sms_paid AFTER UPDATE OF status ON orders\nWHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND NEW.test=0\n AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_admin_alerts'),0)=1\nBEGIN\n INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)\n SELECT NEW.oid,j.value,NEW.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')\n FROM settings s,json_each(s.value,'$.phones') j WHERE s.key='parking_admin_alerts';\nEND;",
 "-- One payment can contain independent parking registrations for up to ten vehicles.\nCREATE TABLE IF NOT EXISTS parking_batches (oid TEXT PRIMARY KEY REFERENCES orders(oid),token_hash TEXT NOT NULL,created_at TEXT NOT NULL);",
 "CREATE INDEX IF NOT EXISTS parking_orders_payment ON parking_orders(payment_oid,created_at);",
 "CREATE TRIGGER IF NOT EXISTS parking_batch_paid AFTER UPDATE OF status ON orders\nWHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND EXISTS(SELECT 1 FROM parking_batches WHERE oid=NEW.oid)\nBEGIN\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)\n SELECT p.oid,'paid',p.oid||':paid',COALESCE(NEW.paid_at,datetime('now')) FROM parking_orders p\n WHERE p.payment_oid=NEW.oid AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1;\n INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)\n SELECT p.oid,j.value,p.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')\n FROM parking_orders p,settings s,json_each(s.value,'$.phones') j WHERE p.payment_oid=NEW.oid AND NEW.test=0 AND s.key='parking_admin_alerts' AND json_extract(s.value,'$.enabled')=1;\nEND;",
 "CREATE TRIGGER IF NOT EXISTS parking_batch_refund AFTER INSERT ON payapp_refunds\nWHEN EXISTS(SELECT 1 FROM parking_batches WHERE oid=NEW.oid)\nBEGIN\n UPDATE parking_orders SET status='issue',memo='통합 결제 취소 내역 확인 필요 · 등록 보류',updated_at=NEW.created_at\n WHERE payment_oid=NEW.oid AND status IN ('waiting','requested');\n INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at,payload)\n SELECT p.oid,'refunded','refund:'||NEW.mul_no||':'||p.oid,NEW.created_at,json_object('refund_amount',p.vehicle_price,'refunded_amount',p.vehicle_price)\n FROM parking_orders p JOIN orders o ON o.oid=p.payment_oid WHERE p.payment_oid=NEW.oid\n AND (SELECT SUM(amount) FROM payapp_refunds WHERE oid=NEW.oid)>=o.price\n AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1;\nEND;",
 "-- SQLite's deferred counter retains the dropped-table references even after the\n-- replacement restores every key. Check the actual graph before closing deferral.\nINSERT INTO parking_migration_guard SELECT COUNT(*) FROM pragma_foreign_key_check;",
 "DROP TABLE parking_migration_guard;",
 "PRAGMA defer_foreign_keys=OFF;"
];

async function snapshot(env){
 const columns=(await env.DB.prepare('PRAGMA table_info(parking_orders)').all()).results||[];
 const counts={};for(const table of TABLES)counts[table]=Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n);
 return {ready:columns.some(c=>c.name==='payment_oid'),counts};
}
export async function onRequest({request,env}){
 if(!hasDb(env))return err('데이터베이스 연결이 필요합니다.',503);
 const denied=await requireAdmin(request,env);if(denied)return denied;
 if(request.method==='GET')return json({ok:true,version:VERSION,...await snapshot(env)});
 if(request.method!=='POST')return err('지원하지 않는 요청입니다.',405);
 if(!sameOrigin(request))return err('허용되지 않은 요청입니다.',403);
 const d=await readJson(request);if(d.version!==VERSION||d.confirm_preserve!==true)return err('기존 이력 보존과 이번 주차 DB 업데이트를 확인해 주세요.');
 const before=await snapshot(env);if(before.ready)return json({ok:true,already_applied:true,...before});
 try{
  const backup=env.DB.prepare('CREATE TABLE '+BACKUP+' AS SELECT * FROM parking_orders');
  await env.DB.batch([backup,...MIGRATION.map(sql=>env.DB.prepare(sql))]);
 }catch{
  if((await snapshot(env)).ready)return json({ok:true,already_applied:true,...await snapshot(env)});
  return err('업데이트를 완료하지 못했습니다. 트랜잭션을 취소했으며 기존 이력을 유지합니다.',500);
 }
 const after=await snapshot(env),violations=(await env.DB.prepare('PRAGMA foreign_key_check').all()).results||[];
 const backupRows=Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM '+BACKUP).first()).n);
 await log(env,'parking.schema.updated',VERSION,'admin',{before:before.counts,after:after.counts,backup_rows:backupRows,foreign_key_errors:violations.length});
 return json({ok:after.ready&&violations.length===0,before:before.counts,...after,backup:BACKUP,backup_rows:backupRows,foreign_key_errors:violations.length});
}
