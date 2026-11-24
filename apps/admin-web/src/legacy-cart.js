// Legacy selections are browsing preferences, not priced or purchasable SKUs.
export function readLegacyCart(local, session) {
  try {
    const raw = local.getItem('alsvid_storefront_cart_preview_v1');
    const previous = !raw && session.getItem('alsvid_fc1_preview_cart_v1');
    if (!raw && !previous) return { items: [], available: true };
    const parsed = JSON.parse(raw || previous);
    const items = raw ? parsed.version === 1 && Array.isArray(parsed.items) ? parsed.items : null : parsed.version === 1 && parsed.product === 'FC1' ? [parsed] : null;
    if (!items || items.length > 18) return { items: [], available: false };
    const valid = items.every(x => x && Number.isInteger(x.quantity) && x.quantity >= 1 && x.quantity <= 9 && (
      x.product === 'FC1' && ['standard','pro'].includes(x.model) && ['sample','black','blue','silver'].includes(x.colour) ||
      x.product === 'FC2' || x.product === 'ACCESSORY' && ['basket','rack','mudguard','light','parts'].includes(x.category)));
    return valid ? { items, available: true } : { items: [], available: false };
  } catch (_) { return { items: [], available: false }; }
}
