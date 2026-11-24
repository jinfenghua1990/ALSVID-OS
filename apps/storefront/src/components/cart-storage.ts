export const guestCartKey = 'alsvid-guest-cart-v1';
export const cartChangedEvent = 'alsvid-cart-changed';

export function readGuestCart() {
  try {
    const rows = JSON.parse(localStorage.getItem(guestCartKey) || '[]');
    return Array.isArray(rows) ? rows.filter((row: any) => row && typeof row.productId === 'string' && typeof row.sku === 'string' && ['EUR', 'CNY'].includes(row.currency) && Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.quantity <= 100).slice(0, 50) : [];
  } catch { return []; }
}

export function guestCartQuantity() {
  return readGuestCart().reduce((total, item) => total + item.quantity, 0);
}

export function notifyCartChanged() {
  window.dispatchEvent(new Event(cartChangedEvent));
}
