const BASE = '';

export async function adminFetch(...args) {
  try { return await fetch(...args); }
  catch (_) { throw new Error('网络连接失败，请检查网络后重试'); }
}

async function req(method, url, body) {
  let res;
  try {
    res = await fetch(BASE + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new Error('网络连接失败，请检查网络后重试'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      const error = new Error('登录状态已过期，请重新登录');
      error.status = 401;
      try { window.location.reload(); } catch (_) {}
      throw error;
    }
    const error = new Error((data && data.error) || `请求失败 (${res.status})`); error.status = res.status; error.code = data?.code; error.references = data?.references || []; throw error;
  }
  return data;
}

async function assetQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) search.set(key, String(value));
  return req('GET', `/api/assets?${search.toString()}`);
}

// 素材下拉需要完整列表，接口单页最多 100 条，这里自动翻页（最多 10 页）。
async function assetsAll(params = {}) {
  const pageSize = 100;
  const first = await assetQuery({ ...params, page: 1, pageSize });
  const items = [...(first.items || [])];
  const pages = Math.min(10, Math.ceil((Number(first.total) || 0) / pageSize));
  for (let page = 2; page <= pages; page++) {
    const next = await assetQuery({ ...params, page, pageSize });
    items.push(...(next.items || []));
  }
  return items;
}

export const api = {
  startShellReview: (id,revision) => req('POST',`/api/cms/pages/${encodeURIComponent(id)}/release-review`,{revision}),
  publishReviewedShell: (id,body) => req('POST',`/api/cms/pages/${encodeURIComponent(id)}/review-publish`,body),
  systemConnections: () => req('GET','/api/system/connections'),
  meta: () => req('GET', '/api/meta'),
  procurement: () => req('GET','/api/procurement'),
  createProcurementSupplier: body => req('POST','/api/procurement/suppliers',body),
  createQuotation: body => req('POST','/api/procurement/quotations',body),
  deleteProcurementQuotation: id => req('DELETE',`/api/procurement/quotations/${encodeURIComponent(id)}`),
  setQuotationStatus: (id,status) => req('POST',`/api/procurement/quotations/${encodeURIComponent(id)}/status`,{status}),
  createPurchaseOrder: body => req('POST','/api/procurement/purchase-orders',body),
  deleteProcurementPurchaseOrder: id => req('DELETE',`/api/procurement/purchase-orders/${encodeURIComponent(id)}`),
  issuePurchaseOrder: id => req('POST',`/api/procurement/purchase-orders/${encodeURIComponent(id)}/issue`,{}),
  confirmPurchaseOrder: (id,body) => req('POST',`/api/procurement/purchase-orders/${encodeURIComponent(id)}/confirm`,body),
  recordProcurementReceipt: (id,body) => req('POST',`/api/procurement/purchase-orders/${encodeURIComponent(id)}/receipts`,body),
  testRides: () => req('GET', '/api/test-rides'),
  colourInterest: () => req('GET', '/api/colour-interest/summary'),
  publicLocations: () => req('GET', '/api/public-locations'),
  publicLocationSource: id => req('GET', `/api/public-locations/${encodeURIComponent(id)}/source`),
  savePublicLocation: (id, body) => req('PUT', `/api/public-locations/${encodeURIComponent(id)}`, body),
  testRideHistory: id => req('GET', `/api/test-rides/${encodeURIComponent(id)}/history`),
  testRideSource: id => req('GET', `/api/test-rides/${encodeURIComponent(id)}/source`),
  testRideLocations: () => req('GET', '/api/test-ride-locations'),
  testRideLocationAuthorization: (id, body) => req('PUT', `/api/test-ride-locations/${encodeURIComponent(id)}/authorization`, body),
  testRideAssignment: id => req('GET', `/api/test-rides/${encodeURIComponent(id)}/assignment`),
  assignTestRide: (id, body) => req('PUT', `/api/test-rides/${encodeURIComponent(id)}/assignment`, body),
  dealerCompanies: () => req('GET', '/api/portal-management/dealer-companies'),
  reviewTestRide: (id, body) => req('PATCH', `/api/test-rides/${encodeURIComponent(id)}`, body),
  customers: () => req('GET','/api/customers'),
  customerVehicles: id => req('GET',`/api/customers/${encodeURIComponent(id)}/vehicles`),
  pendingCustomerFollowups: () => req('GET','/api/customer-followups'),
  customerInteractions: id => req('GET',`/api/customers/${encodeURIComponent(id)}/interactions`),
  addCustomerInteraction: (id,body) => req('POST',`/api/customers/${encodeURIComponent(id)}/interactions`,body),
  changeCustomerFollowup: (id,interactionId,body) => req('POST',`/api/customers/${encodeURIComponent(id)}/interactions/${encodeURIComponent(interactionId)}/changes`,body),
  completeCustomerFollowup: (id,interactionId,note) => req('POST',`/api/customers/${encodeURIComponent(id)}/interactions/${encodeURIComponent(interactionId)}/complete`,{note}),
  createCustomer: body => req('POST','/api/customers',body),
  updateCustomer: (id,body) => req('PUT',`/api/customers/${encodeURIComponent(id)}`,body),
  warrantyAssessments: id => req('GET',`/api/repairs/${encodeURIComponent(id)}/warranty-assessments`),
  addWarrantyAssessment: (id,body) => req('POST',`/api/repairs/${encodeURIComponent(id)}/warranty-assessments`,body),
  warranties: (id,asOf) => req('GET',`/api/vins/${encodeURIComponent(id)}/warranties?asOf=${encodeURIComponent(asOf)}`),
  addWarranty: (id,body) => req('POST',`/api/vins/${encodeURIComponent(id)}/warranties`,body),
  revokeWarranty: (id,warrantyId,reason) => req('POST',`/api/vins/${encodeURIComponent(id)}/warranties/${encodeURIComponent(warrantyId)}/revoke`,{reason}),
  customerHistory: id => req('GET',`/api/vins/${encodeURIComponent(id)}/customer-history`),
  assignCustomer: (id,body) => req('POST',`/api/vins/${encodeURIComponent(id)}/customer-history`,body),
  serviceCenters: () => req('GET','/api/service-centers'),
  createServiceCenter: body => req('POST','/api/service-centers',body),
  updateServiceCenter: (id,body) => req('PATCH',`/api/service-centers/${encodeURIComponent(id)}`,body),
  catalogHomepage: lang => req('GET',`/api/catalog/homepage?lang=${encodeURIComponent(lang)}`),
  catalogProducts: (lang,page=1) => req('GET',`/api/catalog/products?lang=${encodeURIComponent(lang)}&page=${page}`),
  // 商品发布到官网（catalog_publications）：草稿 → 发布 → 下架
  productPublication: id => req('GET',`/api/products/${encodeURIComponent(id)}/publication`),
  saveProductPublication: (id,body) => req('PUT',`/api/products/${encodeURIComponent(id)}/publication`,body),
  publishProductPublication: (id,body) => req('POST',`/api/products/${encodeURIComponent(id)}/publication/publish`,body),
  unpublishProductPublication: (id,body) => req('POST',`/api/products/${encodeURIComponent(id)}/publication/unpublish`,body),
  // 官网公开价格（storefront_offers）：按 SKU + 币种维护，发布后官网与加购才可见
  storefrontOffers: () => req('GET','/api/storefront/offers'),
  createStorefrontOffer: body => req('POST','/api/storefront/offers',body),
  updateStorefrontOffer: (id,body) => req('PUT',`/api/storefront/offers/${encodeURIComponent(id)}`,body),
  homepageAdmin: () => req('GET','/api/site/homepage'),
  storefrontLayoutDraft: (meta) => req('GET','/api/site/layout-draft'+(meta?'?meta=1':'')),
  saveStorefrontLayoutDraft: body => req('PUT','/api/site/layout-draft',body),
  saveLayoutSnapshot: body => req('POST','/api/site/layout-draft/snapshot',body),
  publishStorefrontLayout: body => req('POST','/api/site/layout-draft/publish',body),
  unpublishStorefrontLayout: () => req('POST','/api/site/layout-draft/unpublish',{}),
  // 单语言发布/下线：只动这一种语言，其余语言线上不变
  publishStorefrontLocale: body => req('POST','/api/site/layout-draft/publish-locale',body),
  unpublishStorefrontLocale: body => req('POST','/api/site/layout-draft/unpublish-locale',body),
  storefrontLocaleStatus: () => req('GET','/api/site/layout-draft/locale-status'),
  layoutTranslateStatus: () => req('GET','/api/site/layout-translations/status'),
  autoTranslateLayout: body => req('POST','/api/site/layout-translations/auto',body),
  syncLayoutProduction: () => req('POST','/api/site/layout-draft/production-sync',{}),
  // SEO 与流量中心
  seoSources: () => req('GET','/api/seo/sources'),
  saveSeoSource: (source, body) => req('PUT','/api/seo/sources/'+encodeURIComponent(source),body),
  testSeoSource: (source) => req('POST','/api/seo/sources/'+encodeURIComponent(source)+'/test',{}),
  syncSeoSource: (source, days=30) => req('POST','/api/seo/sources/'+encodeURIComponent(source)+'/sync?days='+encodeURIComponent(days),{}),
  seoSyncLog: (limit=60) => req('GET','/api/seo/sync-log?limit='+encodeURIComponent(limit)),
  seoConversion: (days=30) => req('GET','/api/seo/conversion?days='+encodeURIComponent(days)),
  seoTechAudit: (origin='') => req('GET','/api/seo/tech-audit'+(origin?'?origin='+encodeURIComponent(origin):'')),
  reportEcomEvent: (payload) => req('POST','/api/public/ecom-event',payload),
  // 线上支付统一适配层（骨架）：6 种支付方式的连接状态与配置（密钥只存服务端，不回显）
  paymentProviders: () => req('GET','/api/payment/providers'),
  savePaymentProvider: (provider, body) => req('PUT','/api/payment/providers/'+encodeURIComponent(provider),body),
  testPaymentProvider: (provider) => req('POST','/api/payment/providers/'+encodeURIComponent(provider)+'/test',{}),
  layoutProductionSyncStatus: () => req('GET','/api/site/layout-draft/production-sync'),
  // 发布版本：列表 / 单版本快照（对比用）/ 回滚
  layoutVersions: (limit=20) => req('GET','/api/site/layout-draft/versions?limit='+encodeURIComponent(limit)),
  layoutVersionDetail: (version) => req('GET','/api/site/layout-draft/versions/'+encodeURIComponent(version)),
  rollbackLayout: (body) => req('POST','/api/site/layout-draft/rollback',body),
  // 新站 8091 缓存刷新通道状态
  layoutStorefrontRevalidateStatus: () => req('GET','/api/site/layout-draft/storefront-revalidate'),
  refreshLayoutStorefront: () => req('POST','/api/site/layout-draft/storefront-revalidate',{}),
  // 草稿预览令牌：换取 8091 的 Draft Mode 预览链接
  layoutPreviewToken: (locale) => req('POST','/api/site/layout-draft/preview-token',{locale}),
  publishedLayout: (locale='zh') => req('GET',`/api/site/layout?locale=${encodeURIComponent(locale)}`),
  storefrontOrders: ({page=1,status='all',q='',from='',to=''}={}) => req('GET',`/api/storefront/orders?page=${page}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  storefrontOrderCounts: () => req('GET','/api/storefront/orders/counts'),
  storefrontReviews: ({page=1,status='all',q=''}={}) => req('GET',`/api/storefront/reviews?page=${page}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`),
  replyStorefrontReview: (id,reply) => req('POST',`/api/storefront/reviews/${encodeURIComponent(id)}/reply`,{reply}),
  setStorefrontReviewVisibility: (id,hidden) => req('POST',`/api/storefront/reviews/${encodeURIComponent(id)}/visibility`,{hidden}),
  publicReviews: (limit=20) => req('GET',`/api/site/reviews?limit=${limit}`),
  assets: (params = {}) => assetQuery(params),
  assetProductIndex: () => req('GET', '/api/assets/product-index'),
  assetFolders: (params = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) search.set(key, String(value));
    return req('GET', `/api/assets/folders?${search.toString()}`);
  },
  assetsAll,
  asset: id => req('GET', `/api/assets/${encodeURIComponent(id)}`),
  uploadAsset: async (file, meta = {}) => {
    const res = await adminFetch('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name), 'X-Meta': encodeURIComponent(JSON.stringify(meta)) },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) { const error = new Error(data?.error || '素材上传失败'); error.status = res.status; throw error; }
    return data;
  },
  replaceAsset: async (id, file, { note = '', label = '' } = {}) => {
    const res = await adminFetch(`/api/assets/${encodeURIComponent(id)}/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-File-Name': encodeURIComponent(file.name),
        'X-Note': encodeURIComponent(note),
        'X-Meta': encodeURIComponent(JSON.stringify(label ? { label } : {})),
      },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(data?.error || '素材替换失败');
      error.status = res.status;
      if (data?.existingAssetId) error.existingAssetId = data.existingAssetId;
      if (data?.existingLabel) error.existingLabel = data.existingLabel;
      throw error;
    }
    return data;
  },
  updateAsset: (id, body) => req('PATCH', `/api/assets/${encodeURIComponent(id)}`, body),
  deleteAsset: async id => {
    const res = await adminFetch(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(data?.error || '素材删除失败');
      error.status = res.status;
      if (data?.references) error.references = data.references;
      throw error;
    }
    return data;
  },
  addAssetLink: (id, body) => req('POST', `/api/assets/${encodeURIComponent(id)}/links`, body),
  removeAssetLink: linkId => req('DELETE', `/api/assets/links/${encodeURIComponent(linkId)}`),
  assetUrl: (id, { version = '', download = false } = {}) => `/api/assets/${encodeURIComponent(id)}/file${version ? `?version=${encodeURIComponent(version)}` : download ? '?download=1' : ''}`,
  cmsPages: ({type='',locale='',q='',path=''}={}) => req('GET',`/api/cms/pages?type=${encodeURIComponent(type)}&locale=${encodeURIComponent(locale)}&q=${encodeURIComponent(q)}&path=${encodeURIComponent(path)}`),
  cmsPage: id => req('GET',`/api/cms/pages/${encodeURIComponent(id)}`),
  createCmsPage: body => req('POST','/api/cms/pages',body),
  saveCmsDraft: (id,body) => req('PUT',`/api/cms/pages/${encodeURIComponent(id)}/draft`,body),
  publishCmsPage: (id,revision) => req('POST',`/api/cms/pages/${encodeURIComponent(id)}/publish`,{revision}),
  cmsVersions: id => req('GET',`/api/cms/pages/${encodeURIComponent(id)}/versions`),
  rollbackCmsPage: (id,version,revision) => req('POST',`/api/cms/pages/${encodeURIComponent(id)}/rollback`,{version,revision}),
  restoreCmsVersionDraft: (id,version,revision) => req('POST',`/api/cms/pages/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/restore-draft`,{revision}),
  deleteCmsVersion: (id,version) => req('DELETE',`/api/cms/pages/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`),
  renameCmsPage: (id,name) => req('PATCH',`/api/cms/pages/${encodeURIComponent(id)}/name`,{name}),
  setCmsLabels: (id,body) => req('PATCH',`/api/cms/pages/${encodeURIComponent(id)}/labels`,body),
  setCmsVersionLabel: (id,version,label) => req('PATCH',`/api/cms/pages/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/label`,{label}),
  setCmsPageStatus: (id,status) => req('PATCH',`/api/cms/pages/${encodeURIComponent(id)}/status`,{status}),
  deleteCmsPage: id => req('DELETE',`/api/cms/pages/${encodeURIComponent(id)}`),
  cmsTemplates: (targetType = '') => req('GET', `/api/cms/templates${targetType ? `?targetType=${encodeURIComponent(targetType)}` : ''}`),
  saveCmsTemplate: body => req('POST', '/api/cms/templates', body),
  applyCmsTemplate: (pageId, templateId, revision) => req('POST', `/api/cms/pages/${encodeURIComponent(pageId)}/apply-template`, { templateId, revision }),
  deleteCmsTemplate: id => req('DELETE', `/api/cms/templates/${encodeURIComponent(id)}`),
  ensureProductOverride: body => req('POST', '/api/cms/product-override', body),
  publicCmsPage: (locale,path,params = {}) => req('GET',`/api/cms/pages/public?locale=${encodeURIComponent(locale)}&path=${encodeURIComponent(path)}${params.version?`&version=${encodeURIComponent(params.version)}`:''}${params.draft?'&draft=1':''}`),
  // 商品详情页模板（含全局模块与全部产品版式）；draft/version 仅管理员预览可用
  cmsProductTemplate: (locale, productId = '', params = {}) => req('GET',`/api/cms/product-template?locale=${encodeURIComponent(locale)}&productId=${encodeURIComponent(productId)}${params.version?`&version=${encodeURIComponent(params.version)}`:''}${params.draft?'&draft=1':''}`),
  // 渠道商品（官网 listing）：装修工作区按商品编辑主图与图文详情时复用发布流
  productListings: id => req('GET',`/api/products/${encodeURIComponent(id)}/listings`),
  saveListing: (id, body) => req('PUT',`/api/storefront/listings/${encodeURIComponent(id)}`,body),
  publishListing: (id, revision) => req('POST',`/api/storefront/listings/${encodeURIComponent(id)}/publish`,{revision}),
  listingVersions: id => req('GET',`/api/storefront/listings/${encodeURIComponent(id)}/versions`),
  listingVersion: (id, revision) => req('GET',`/api/storefront/listings/${encodeURIComponent(id)}/versions/${encodeURIComponent(revision)}`),
  rollbackListing: (id, revision, targetRevision) => req('POST',`/api/storefront/listings/${encodeURIComponent(id)}/rollback`,{revision,targetRevision}),
  saveHomepage: body => req('PUT','/api/site/homepage',body),
  publishHomepage: revision => req('POST','/api/site/homepage/publish',{revision}),
  unpublishHomepage: revision => req('POST','/api/site/homepage/unpublish',{revision}),
  fields: () => req('GET', '/api/fields'),
  addField: (f) => req('POST', '/api/fields', f),
  updateField: (code, f) => req('PUT', `/api/fields/${code}`, f),
  colors: () => req('GET', '/api/colors'),
  addColor: (c) => req('POST', '/api/colors', c),
  updateColor: (code, c) => req('PUT', `/api/colors/${code}`, c),
  products: (kind, includeDeleted = false) => { const query = new URLSearchParams(); if (kind) query.set('kind', kind); if (includeDeleted) query.set('includeDeleted', 'true'); return req('GET', `/api/products${query.size ? `?${query}` : ''}`); },
  product: (id) => req('GET', `/api/products/${id}`),
  productExternalLinks: id => req('GET',`/api/products/${encodeURIComponent(id)}/external-links`),
  saveProductExternalLinks: (id,links) => req('PUT',`/api/products/${encodeURIComponent(id)}/external-links`,{links}),
  productHistory: (id,beforeId) => req('GET',`/api/products/${encodeURIComponent(id)}/history${beforeId?`?beforeId=${encodeURIComponent(beforeId)}`:''}`),
  productVersions: id => req('GET',`/api/products/${encodeURIComponent(id)}/versions`),
  createProductVersion: (id,body) => req('POST',`/api/products/${encodeURIComponent(id)}/versions`,body),
  productDraft: kind => req('GET',`/api/product-drafts/${encodeURIComponent(kind)}`),
  saveProductDraft: (kind,draft,expectedVersion) => req('PUT',`/api/product-drafts/${encodeURIComponent(kind)}`,{draft,expectedVersion}),
  deleteProductDraft: (kind,expectedVersion) => req('DELETE',`/api/product-drafts/${encodeURIComponent(kind)}`,{expectedVersion}),
  createProduct: (p) => req('POST', '/api/products', p),
  updateProduct: (id, p, version) => req('PUT', `/api/products/${id}`, { ...p, version }),
  uploadMedia: async (id, file) => { const res = await adminFetch(`/api/products/${encodeURIComponent(id)}/media`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file }); const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.error || '图片上传失败'); return data; },
  deleteProduct: (id) => req('DELETE', `/api/products/${id}`),
  restoreProduct: id => req('POST', `/api/products/${encodeURIComponent(id)}/restore`, {}),
  saveBom: (id, bom) => req('PUT', `/api/products/${id}/bom`, bom),
  bomVersions: (id) => req('GET', `/api/products/${encodeURIComponent(id)}/bom/versions`),
  bomVersion: (id, version) => req('GET', `/api/products/${encodeURIComponent(id)}/bom/versions/${encodeURIComponent(version)}`),
  publishBom: (id, version, draftRevision) => req('POST', `/api/products/${encodeURIComponent(id)}/bom/versions/${encodeURIComponent(version)}/publish`, {draftRevision}),
  addSkus: (id, items) => req('POST', `/api/products/${id}/skus`, items),
  updateSkuAttributes: (id, sku, attributes) => req('PUT', `/api/products/${id}/skus/${encodeURIComponent(sku)}/attributes`, { attributes }),
  deleteSku: (id, sku) => req('DELETE', `/api/products/${id}/skus/${encodeURIComponent(sku)}`),
  setSkuDisabled: (id, sku, disabled) => req('PATCH', `/api/products/${id}/skus/${encodeURIComponent(sku)}`, { disabled }),
  setProductStatus: (id, status) => req('PATCH', `/api/products/${id}/status`, { status }),
  updateSkuDetail: (id, sku, input) => req('PATCH', `/api/products/${id}/skus/${encodeURIComponent(sku)}/detail`, input),
  fx: () => req('GET', '/api/fx'),
  search: (q) => req('GET', `/api/search?q=${encodeURIComponent(q)}`),
  summary: () => req('GET', '/api/summary'),
  audit: () => req('GET', '/api/audit'),
  auditDetail: id => req('GET', `/api/audit/${encodeURIComponent(id)}`),
  factories: () => req('GET','/api/factories'),
  createFactory: (factory) => req('POST','/api/factories',factory),
  updateFactory: (id,patch) => req('PATCH',`/api/factories/${encodeURIComponent(id)}`,patch),
  inTransitDeliveries: () => req('GET','/api/production-deliveries/in-transit'),
  deliveries: ({status=''}={}) => req('GET',`/api/production-deliveries?status=${encodeURIComponent(status)}`),
  warehouseLocations: warehouseId => req('GET',`/api/warehouse-locations?warehouseId=${encodeURIComponent(warehouseId)}`),
  inventoryStocktakes: () => req('GET','/api/stocktakes'),
  inventoryStocktakeItems: () => req('GET','/api/stocktakes/items'),
  postInventoryNonSkuMovement: body => req('POST','/api/inventory/non-sku-movements',body),
  releaseInventoryNonSkuReservation: id => req('POST',`/api/inventory/non-sku-reservations/${encodeURIComponent(id)}/release`,{}),
  inventoryNonSkuReservations: () => req('GET','/api/inventory/non-sku-reservations'),
  createInventoryNonSkuReservation: body => req('POST','/api/inventory/non-sku-reservations',body),
  openInventoryStocktake: body => req('POST','/api/stocktakes',body),
  recordInventoryStocktakeCount: (id,body) => req('POST',`/api/stocktakes/${encodeURIComponent(id)}/counts`,body),
  closeInventoryStocktake: id => req('POST',`/api/stocktakes/${encodeURIComponent(id)}/close`,{}),
  cancelInventoryStocktake: id => req('POST',`/api/stocktakes/${encodeURIComponent(id)}/cancel`,{}),
  productionDeliveries: (id) => req('GET',`/api/production-orders/${encodeURIComponent(id)}/deliveries`),
  productionDeliveryItems: (id) => req('GET',`/api/production-deliveries/${encodeURIComponent(id)}/items`),
  saveProductionDeliveryItems: (id,body) => req('PUT',`/api/production-deliveries/${encodeURIComponent(id)}/items`,body),
  deliveryVins: id => req('GET',`/api/production-deliveries/${encodeURIComponent(id)}/vins`),
  assignDeliveryVins: (id,vinIds) => req('PUT',`/api/production-deliveries/${encodeURIComponent(id)}/vins`,{vinIds}),
  deliveryReceipts: (id) => req('GET',`/api/production-deliveries/${encodeURIComponent(id)}/receipts`),
  deliveryCustomsHistory: (id) => req('GET',`/api/production-deliveries/${encodeURIComponent(id)}/customs-history`),
  createProductionDelivery: (id,body) => req('POST',`/api/production-orders/${encodeURIComponent(id)}/deliveries`,body),
  cancelProductionDelivery: (id,reason) => req('POST',`/api/production-deliveries/${encodeURIComponent(id)}/cancel`,{reason}),
  dispatchProductionDelivery: (id) => req('POST',`/api/production-deliveries/${encodeURIComponent(id)}/dispatch`,{}),
  updateDeliveryCustoms: (id,body) => req('PATCH',`/api/production-deliveries/${encodeURIComponent(id)}/customs`,body),
  updateDeliveryLogistics: (id,body) => req('PATCH',`/api/production-deliveries/${encodeURIComponent(id)}/logistics`,body),
  receiveProductionDelivery: (id,body) => req('POST',`/api/production-deliveries/${encodeURIComponent(id)}/receive`,body),
  deliveryParcels: (id) => req('GET',`/api/production-deliveries/${encodeURIComponent(id)}/parcels`),
  createDeliveryParcels: (id,parcels) => req('POST',`/api/production-deliveries/${encodeURIComponent(id)}/parcels`,{parcels}),
  updateDeliveryParcel: (id,body) => req('PATCH',`/api/delivery-parcels/${encodeURIComponent(id)}`,body),
  dispatchDeliveryParcel: (id) => req('POST',`/api/delivery-parcels/${encodeURIComponent(id)}/dispatch`,{}),
  receiveDeliveryParcel: (id,body) => req('POST',`/api/delivery-parcels/${encodeURIComponent(id)}/receive`,body||{}),
  deliveryParcelTrackings: (id) => req('GET',`/api/delivery-parcels/${encodeURIComponent(id)}/trackings`),
  addDeliveryParcelTracking: (id,body) => req('POST',`/api/delivery-parcels/${encodeURIComponent(id)}/trackings`,body||{}),
  deliveryOverview: (orderId) => req('GET',`/api/production-orders/${encodeURIComponent(orderId)}/delivery-overview`),
  deliveryReconciliation: (id) => req('GET',`/api/production-deliveries/${encodeURIComponent(id)}/reconciliation`),
  productionAttachments: (id) => req('GET',`/api/production-orders/${encodeURIComponent(id)}/attachments`),
  uploadProductionAttachment: async (id,file,meta={}) => { const headers={'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)}; if(meta.category)headers['X-File-Category']=encodeURIComponent(meta.category); if(meta.refId)headers['X-Ref-Id']=meta.refId; const r=await adminFetch(`/api/production-orders/${encodeURIComponent(id)}/attachments`,{method:'POST',headers,body:file});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||'附件上传失败');return data;},
  productionMaterials: (id) => req('GET',`/api/production-orders/${encodeURIComponent(id)}/materials`),
  updateProductionMaterial: (id,materialId,supplyParty,warehouseId) => req('PATCH',`/api/production-orders/${encodeURIComponent(id)}/materials/${encodeURIComponent(materialId)}`,{supplyParty,warehouseId}),
  productionCosts: () => req('GET','/api/finance/production-costs'),
  // B2B渠道：销售订单（sales_orders 域，见 server/sales-orders.js）
  salesOrders: ({status='',q=''}={}) => req('GET',`/api/sales-orders?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`),
  salesOrderSummary: () => req('GET','/api/sales-orders/summary'),
  salesOrderOptions: () => req('GET','/api/sales-orders/options'),
  salesOrderTracking: ({q=''}={}) => req('GET',`/api/sales-orders/tracking?q=${encodeURIComponent(q)}`),
  salesOrder: id => req('GET',`/api/sales-orders/${encodeURIComponent(id)}`),
  createSalesOrder: body => req('POST','/api/sales-orders',body),
  startSalesOrder: id => req('POST',`/api/sales-orders/${encodeURIComponent(id)}/start`,{}),
  readySalesOrder: (id,body) => req('POST',`/api/sales-orders/${encodeURIComponent(id)}/ready`,body||{}),
  shipSalesOrder: (id,body) => req('POST',`/api/sales-orders/${encodeURIComponent(id)}/ship`,body||{}),
  deliverSalesOrder: id => req('POST',`/api/sales-orders/${encodeURIComponent(id)}/deliver`,{}),
  cancelSalesOrder: (id,reason) => req('POST',`/api/sales-orders/${encodeURIComponent(id)}/cancel`,{reason}),
  bulkSalesOrders: (action,ids,payload={}) => req('POST','/api/sales-orders/bulk',{action,ids,...payload}),
  salesOrderAssets: ({owner='',q=''}={}) => req('GET',`/api/sales-orders/assets?owner=${encodeURIComponent(owner)}&q=${encodeURIComponent(q)}`),
  trackingEvents: ({delivery='',order='',trackingNo=''}={}) => req('GET',`/api/sales-orders/tracking-events?delivery=${encodeURIComponent(delivery)}&order=${encodeURIComponent(order)}&trackingNo=${encodeURIComponent(trackingNo)}`),
  addTrackingEvent: body => req('POST','/api/sales-orders/tracking-events',body),
  financeAging: (asOf='') => req('GET',`/api/finance/aging?asOf=${encodeURIComponent(asOf)}`),
  financeSummary: () => req('GET','/api/finance'),
  createFinanceDocument: body => req('POST','/api/finance/documents',body),
  financeDocumentAction: (id,action,body) => req('POST',`/api/finance/documents/${encodeURIComponent(id)}/${action}`,body),
  createFinanceObligation: body => req('POST','/api/finance/obligations',body),
  voidFinanceObligation: (id,body) => req('POST',`/api/finance/obligations/${encodeURIComponent(id)}/void`,body),
  settleFinanceObligation: (id,body) => req('POST',`/api/finance/obligations/${encodeURIComponent(id)}/settle`,body),
  createFinancePayment: body => req('POST','/api/finance/payments',body),
  reverseFinancePayment: (id,body) => req('POST',`/api/finance/payments/${encodeURIComponent(id)}/reverse`,body),
  createFinanceFxRate: body => req('POST','/api/finance/fx',body),
  allocateFinancePayment: body => req('POST','/api/finance/allocations',body),
  reverseFinanceAllocation: (id,body) => req('POST',`/api/finance/allocations/${encodeURIComponent(id)}/reverse`,body),
  createLandedCostBatch: body => req('POST','/api/finance/landed-cost',body),
  addLandedCostComponent: (id,body) => req('POST',`/api/finance/landed-cost/${encodeURIComponent(id)}/components`,body),
  allocateLandedCost: (id,body) => req('POST',`/api/finance/landed-cost/components/${encodeURIComponent(id)}/allocations`,body),
  deleteLandedCostAllocation: id => req('DELETE',`/api/finance/landed-cost/allocations/${encodeURIComponent(id)}`),
  distributeLandedCost: (id,body) => req('POST',`/api/finance/landed-cost/${encodeURIComponent(id)}/distribute`,body),
  finalizeLandedCost: id => req('POST',`/api/finance/landed-cost/${encodeURIComponent(id)}/finalize`,{}),
  productionOrders: () => req('GET','/api/production-orders'),
  productionOverviewExtras: () => req('GET','/api/production-orders/overview-extras'),
  productionFinance: id => req('GET',`/api/production-orders/${encodeURIComponent(id)}/finance`),
  createProductionPayment: (id,body) => req('POST',`/api/production-orders/${encodeURIComponent(id)}/payments`,body),
  createProductionInvoice: (id,body) => req('POST',`/api/production-orders/${encodeURIComponent(id)}/invoices`,body),
  productionBomSnapshot: id => req('GET',`/api/production-orders/${encodeURIComponent(id)}/bom-snapshot`),
  createProductionOrder: (order) => req('POST','/api/production-orders',order),
  updateProductionOrder: (id, order) => req('PATCH',`/api/production-orders/${encodeURIComponent(id)}`,order),
  transitionProductionOrder: (id,status) => req('PATCH',`/api/production-orders/${encodeURIComponent(id)}/status`,{status}),
  updateProductionProgress: (id,body) => req('PATCH',`/api/production-orders/${encodeURIComponent(id)}/progress`,body),
  confirmProductionFactory: id => req('POST',`/api/production-orders/${encodeURIComponent(id)}/factory-confirm`,{}),
  productionProgressEvents: id => req('GET',`/api/production-orders/${encodeURIComponent(id)}/progress-events`),
  updateProductionQuality: (id,body) => req('PATCH',`/api/production-orders/${encodeURIComponent(id)}/quality`,body),
  productionVinQuality: id => req('GET',`/api/production-orders/${encodeURIComponent(id)}/vin-quality`),
  vins: (q = '') => req('GET', `/api/vins${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createVin: (v) => req('POST', '/api/vins', v),
  updateVin: (id, v) => req('PATCH', `/api/vins/${id}`, v),
  vinTrace: (id) => req('GET', `/api/vins/${id}/trace`),
  replaceInstalled: (id, items) => req('PUT', `/api/vins/${id}/installed`, { items }),
  repairs: (q = '') => req('GET', `/api/repairs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createRepair: (r) => req('POST', '/api/repairs', r),
  updateRepair: (id, r) => req('PATCH', `/api/repairs/${id}`, r),
  repairFinance: id => req('GET',`/api/repairs/${encodeURIComponent(id)}/finance`),
  createRepairQuote: (id,body) => req('POST',`/api/repairs/${encodeURIComponent(id)}/quotes`,body),
  decideRepairQuote: (id,quoteId,body) => req('POST',`/api/repairs/${encodeURIComponent(id)}/quotes/${encodeURIComponent(quoteId)}/decision`,body),
  recordRepairPayment: (id,quoteId,body) => req('POST',`/api/repairs/${encodeURIComponent(id)}/quotes/${encodeURIComponent(quoteId)}/payments`,body),
  completeRepair: (id, body) => req('POST', `/api/repairs/${encodeURIComponent(id)}/complete`,body),
  completeRepairService: (id, body) => req('POST', `/api/repairs/${encodeURIComponent(id)}/complete-service`,body),
  oldPart: (id) => req('GET', `/api/repairs/${encodeURIComponent(id)}/old-part`),
  updateOldPart: (id, body) => req('POST', `/api/repairs/${encodeURIComponent(id)}/old-part`,body),
  oldPartRestock: (id, action, body={}) => req('POST', `/api/repairs/${encodeURIComponent(id)}/old-part/restock/${action}`,body),
  repairStock: (id) => req('GET', `/api/repairs/${encodeURIComponent(id)}/stock`),
  repairStockMove: (id,move) => req('POST', `/api/repairs/${encodeURIComponent(id)}/stock`,move),
  shippingRateTemplates: () => req('GET','/api/shipping-rate-templates'),
  shippingRateTemplateHistory: id => req('GET',`/api/shipping-rate-templates/${encodeURIComponent(id)}/history`),
  saveShippingRateTemplate: (id,body) => id ? req('PUT',`/api/shipping-rate-templates/${encodeURIComponent(id)}`,body) : req('POST','/api/shipping-rate-templates',body),
  warehouses: () => req('GET','/api/warehouses'),
  stock: () => req('GET','/api/stock'),
  stockValuation: () => req('GET','/api/stock/valuation'),
  inventory8090: () => req('GET','/api/inventory-8090/snapshot'),
  stockInTransit: () => req('GET','/api/stock/in-transit'),
  stockMove: body => req('POST','/api/stock/movements',body),
  stockAdjustment: body => req('POST','/api/stock/adjustments',body),
  outboundOrders: () => req('GET','/api/inventory/outbound-orders'),
  createOutboundOrder: body => req('POST','/api/inventory/outbound-orders',body),
  confirmOutboundOrder: id => req('POST',`/api/inventory/outbound-orders/${encodeURIComponent(id)}/confirm`,{}),
  cancelOutboundOrder: (id,reason) => req('POST',`/api/inventory/outbound-orders/${encodeURIComponent(id)}/cancel`,{reason}),
  returnOutboundOrder: (id,body) => req('POST',`/api/inventory/outbound-orders/${encodeURIComponent(id)}/return`,body||{}),
  inventoryLedger: () => req('GET','/api/stock/ledger'),
  inventoryReconciliation: () => req('GET','/api/stock/reconciliation'),
  createWarehouse: body => req('POST','/api/warehouses',body),
  updateWarehouse: (id,body) => req('PATCH',`/api/warehouses/${encodeURIComponent(id)}`,body),
  substitutes: () => req('GET', '/api/substitutes'),
  createSubstitute: (s) => req('POST', '/api/substitutes', s),
  updateSubstitute: (id, s) => req('PATCH', `/api/substitutes/${id}`, s),
};
