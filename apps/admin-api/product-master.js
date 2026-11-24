'use strict';

// Older creation drafts may contain marketplace fields and the intermediate
// official-name key. Split them before writing the physical product record.
function validateVehicleStatus(status) {
  if (status !== undefined && !['启用', '停用'].includes(status)) throw new Error('整车档案状态无效');
}

function validatePhysicalSpecs(specs) {
  if (specs && Object.prototype.hasOwnProperty.call(specs, '_market')) throw new Error('商城资料请在商城运营中维护');
}


function splitVehicleMaster(input) {
  const source = input.specs == null ? {} : input.specs;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('产品参数格式无效');
  const specs = { ...source };
  const legacyMarket = specs._market;
  if (legacyMarket != null && (typeof legacyMarket !== 'object' || Array.isArray(legacyMarket))) throw new Error('历史商城资料格式无效');
  delete specs._market;
  delete specs._officialModelName;
  return { specs, legacyMarket: legacyMarket ?? null };
}

async function archiveLegacyMarket(client, productId, productName, market) {
  if (!market) return;
  const draft = { model: '', languages: { zh: { title: String(productName).trim(), description: '', specifications: [] } }, mediaIds: [] };
  await client.query('INSERT INTO catalog_publications(product_id,draft,revision,legacy_product_market) VALUES($1,$2,1,$3)',
    [productId, JSON.stringify(draft), JSON.stringify(market)]);
}

module.exports = { splitVehicleMaster, archiveLegacyMarket, validateVehicleStatus, validatePhysicalSpecs };
