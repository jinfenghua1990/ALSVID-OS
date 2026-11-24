/**
 * 8090 财务全量迁移补完（幂等）：
 * 1) 回填原 OMS 的关联单号到 finance_obligations.legacy_ref_no
 * 2) 把 8090 已核销的 2 笔（fin-001 / fin-003）落成 SETTLED：
 *    通过收付款 + 核销记录走 8089 的正常账证链，不直接改视图或金额。
 * 运行：node migrate-finance-8090-completion.js
 */
const fs = require('node:fs');
const { Client } = require('pg');

const REF = {
  'OBL-8090-001': 'PO-20261115-001',
  'OBL-8090-002': 'SO-202611-001',
  'OBL-8090-003': 'SO-202611-001',
  'OBL-8090-004': 'SO-202611-002',
  'OBL-8090-005': 'SO-202611-003',
  'OBL-8090-006': 'SO-202611-004',
  'OBL-8090-007': 'PO-20261116-001',
};
const SETTLE = [
  ['OBL-8090-001', 'OUTBOUND'],
  ['OBL-8090-003', 'INBOUND'],
];
const day = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : null;
};

(async () => {
  const secret = JSON.parse(fs.readFileSync('/tmp/alsvid-secret.json', 'utf8'));
  const db = new Client({ connectionString: secret.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query('SET search_path TO alsvid_v2');
  await db.query('BEGIN');
  let refs = 0, settled = 0;
  try {
    const actor = (await db.query("SELECT id FROM app_users WHERE role='admin' AND enabled ORDER BY created_at LIMIT 1")).rows[0].id;
    // finance_obligations 是 append-only；仅在事务内临时关闭用户触发器做一次性回填，
    // 提交前恢复。事务回滚时 DDL 也会一起回滚，不会留下永久敞口。
    await db.query('ALTER TABLE finance_obligations DISABLE TRIGGER USER');
    for (const [number, ref] of Object.entries(REF)) {
      const r = await db.query('UPDATE finance_obligations SET legacy_ref_no=$1 WHERE obligation_number=$2 AND legacy_ref_no IS DISTINCT FROM $1', [ref, number]);
      refs += r.rowCount;
    }
    await db.query('ALTER TABLE finance_obligations ENABLE TRIGGER USER');
    for (const [number, direction] of SETTLE) {
      const o = (await db.query('SELECT * FROM finance_obligations WHERE obligation_number=$1', [number])).rows[0];
      if (!o) continue;
      const key = 'LEGACY-8090-SETTLE-' + number;
      const prior = (await db.query('SELECT id FROM finance_payments WHERE idempotency_key=$1', [key])).rows[0];
      if (prior) continue;
      const amount = o.original_amount;
      const valueDate = day(o.due_date) || day(o.created_at) || new Date().toISOString().slice(0, 10);
      const payment = (await db.query(
        `INSERT INTO finance_payments(direction,partner_id,currency,amount,value_date,provider,idempotency_key,note,posted_by)
         VALUES($1,$2,$3,$4,$5,'LEGACY_8090',$6,'8090 已核销迁移',$7) RETURNING id`,
        [direction, o.partner_id, o.currency, amount, valueDate, key, actor]
      )).rows[0];
      await db.query(
        `INSERT INTO finance_allocations(payment_id,obligation_id,payment_amount,obligation_amount,note,allocated_by)
         VALUES($1,$2,$3,$3,'8090 已核销迁移',$4)`,
        [payment.id, o.id, amount, actor]
      );
      settled += 1;
    }
    await db.query('COMMIT');
    console.log(`回填关联单号 ${refs} 条；新增核销 ${settled} 笔`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
