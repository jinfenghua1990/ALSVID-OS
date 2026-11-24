-- 数据库层兜底：欧盟 EN 15194 功率 / 助力切断时速 / 标称电压上限。
-- 服务端已硬校验，这里再加一道 CHECK，任何绕过 API 的直连写入同样无法落库。
ALTER TABLE alsvid_v2.products DROP CONSTRAINT IF EXISTS products_ebi_eu_limits;
ALTER TABLE alsvid_v2.products ADD CONSTRAINT products_ebi_eu_limits CHECK (
  kind <> 'vehicle' OR product_type <> 'EBI' OR (
    (
      specs->>'rated_power_w' IS NULL OR (
        specs->>'rated_power_w' ~ '^[0-9]+(\.[0-9]+)?$'
        AND (specs->>'rated_power_w')::numeric <= 250
      )
    )
    AND (
      specs->>'max_assist_speed_kmh' IS NULL OR (
        specs->>'max_assist_speed_kmh' ~ '^[0-9]+(\.[0-9]+)?$'
        AND (specs->>'max_assist_speed_kmh')::numeric <= 25
      )
    )
    AND (
      specs->>'electrical_voltage' IS NULL OR (
        specs->>'electrical_voltage' ~ '^[0-9]+(\.[0-9]+)?$'
        AND (specs->>'electrical_voltage')::numeric <= 48
      )
    )
  )
);
