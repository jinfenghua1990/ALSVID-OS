-- P0 数据底座：包裹级物流事件。
-- 规格 §4.4 / §6：事件按业务发生时间排序，同时保留接口接收时间；重复事件幂等。
-- 旧事件乱序到达不得回滚"已妥投"状态——由上层状态机决定，本表只存事实。
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.tracking_events (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  package_id text NOT NULL REFERENCES alsvid_v2.delivery_parcels(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL DEFAULT '' CHECK (length(provider_event_id) <= 200),
  tracking_no text NOT NULL DEFAULT '' CHECK (length(tracking_no) <= 120),
  event_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (length(trim(status)) BETWEEN 1 AND 120),
  status_code text NOT NULL DEFAULT '' CHECK (length(status_code) <= 60),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 300),
  source text NOT NULL DEFAULT '手工' CHECK (source IN ('手工', 'DHL', '货代', '其他')),
  actor text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text, 15, 1) = '7' AND substring(id::text, 20, 1) IN ('8','9','a','b'))
);

-- 承运商事件 ID 去重；手工录入 provider_event_id 为空时不受约束。
CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_provider_key
  ON alsvid_v2.tracking_events(package_id, provider_event_id)
  WHERE provider_event_id <> '';

CREATE INDEX IF NOT EXISTS tracking_events_timeline_idx
  ON alsvid_v2.tracking_events(package_id, event_time, id);
CREATE INDEX IF NOT EXISTS tracking_events_tracking_no_idx
  ON alsvid_v2.tracking_events(tracking_no, event_time DESC);

COMMIT;
