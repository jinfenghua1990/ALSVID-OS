const storageNames = ['localStorage', 'sessionStorage'];

export function readBrowserValue(key) {
  for (const name of storageNames) {
    try {
      const value = window[name].getItem(key);
      if (value !== null) return value;
    } catch {}
  }
  return null;
}

export function writeBrowserValue(key, value) {
  let saved = false;
  for (const name of storageNames) {
    try {
      window[name].setItem(key, value);
      saved = true;
    } catch {}
  }
  return saved;
}

export function removeBrowserValue(key) {
  for (const name of storageNames) {
    try { window[name].removeItem(key); } catch {}
  }
}
