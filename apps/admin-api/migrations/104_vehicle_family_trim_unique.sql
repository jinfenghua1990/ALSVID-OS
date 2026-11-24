-- 车型唯一性从「车型代号」改为「车型代际 + 配置版本」组合，由 create() 在事务内校验。
-- 同代际不同配置版本可并存（如 A1-STD 与 A1-ULT 各自独立主档），跨代际互不影响（如 A2）。
DROP INDEX IF EXISTS alsvid_v2.products_vehicle_model_unique;
