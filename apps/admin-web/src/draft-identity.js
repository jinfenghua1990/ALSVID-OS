import { uuidv7 } from './uuidv7.js';

export const isUuidv7 = value => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
export const needsDraftIdentityRecovery = draft => !isUuidv7(draft?.id) || (draft?.images || []).some(image => !isUuidv7(image?.id));

export async function recoverDraftIdentity(draft, exists, save, createId = uuidv7) {
  const originalId = String(draft?.id || '');
  if (!originalId) throw new Error('产品暂存资料无效');
  if (await exists(originalId)) throw new Error('该产品已经保存，不能覆盖云端草稿');

  const embeddedId = originalId.startsWith('p-') ? originalId.slice(2) : '';
  let productId = originalId;
  if (embeddedId) {
    if (await exists(embeddedId)) throw new Error('草稿产品 ID 已被使用，不能覆盖现有产品');
    productId = isUuidv7(embeddedId) ? embeddedId : createId();
  } else if (!isUuidv7(originalId)) {
    productId = createId();
  }

  const imageIds = new Map();
  const images = (Array.isArray(draft.images) ? draft.images : []).map(image => {
    if (isUuidv7(image.id)) return image;
    const id = imageIds.get(image.id) || createId();
    imageIds.set(image.id, id);
    return { ...image, id };
  });
  const items = Array.isArray(draft.bom?.items) ? draft.bom.items.map(item => ({
    ...item,
    ...(imageIds.has(item.drawingMediaId) ? { drawingMediaId: imageIds.get(item.drawingMediaId) } : {}),
  })) : draft.bom?.items;
  const recovered = {
    ...draft,
    id: productId,
    images,
    ...(draft.bom ? { bom: { ...draft.bom, ...(items ? { items } : {}) } } : {}),
  };
  await save(recovered);
  return recovered;
}
