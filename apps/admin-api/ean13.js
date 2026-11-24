'use strict';

// EAN-13 校验：13 位数字 + 标准模 10 校验位（前 12 位加权求和）。
function isValidEan13(value) {
  const code = String(value || '');
  if (!/^\d{13}$/.test(code)) return false;
  const sum = code.slice(0, 12).split('').reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

module.exports = { isValidEan13 };
