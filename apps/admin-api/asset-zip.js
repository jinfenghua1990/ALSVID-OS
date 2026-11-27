'use strict';

// 极简 ZIP 打包器：只实现 STORE（不压缩），够素材库批量下载用。
//
// 为什么不装 archiver / jszip：
//   1. 素材库里的东西是 jpg/png/webp/mp4，本身已经是压缩格式，再 deflate 一遍基本压不动，
//      白白吃 CPU，还要处理流式背压；
//   2. 只需要「把若干 Buffer 拼成一个能被系统解压的标准 zip」，手写 4 段固定结构比引依赖更可控。
//
// 产出的 zip 带 UTF-8 文件名标记（general purpose flag bit 11），
// Windows 资源管理器 / macOS 归档工具都能正确显示中文名。

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// MS-DOS 时间戳：zip 头里是 1980 年起算的 16 位打包字段，不是 Unix 时间。
function dosStamp(input) {
  const date = input instanceof Date && !Number.isNaN(input.getTime()) ? input : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
}

// 压缩包内的文件名：去掉路径分隔符与控制字符（防目录穿越），并保证同名自动加序号。
function safeEntryName(raw, used) {
  const cleaned = String(raw || '')
    .replace(/[\\/]+/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 160) || 'asset';
  const dot = cleaned.lastIndexOf('.');
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const ext = dot > 0 ? cleaned.slice(dot) : '';
  let name = cleaned;
  let index = 2;
  while (used.has(name.toLowerCase())) {
    name = `${stem}-${index}${ext}`;
    index += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/**
 * @param {Array<{name:string,data:Buffer,mtime?:Date}>} entries
 * @returns {Buffer} 标准 zip 字节流
 */
function buildZip(entries) {
  const list = Array.isArray(entries) ? entries.filter(entry => entry && Buffer.isBuffer(entry.data)) : [];
  if (!list.length) throw Object.assign(new Error('没有可打包的文件'), { statusCode: 400 });
  const used = new Set();
  const parts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of list) {
    const nameBuf = Buffer.from(safeEntryName(entry.name, used), 'utf8');
    const data = entry.data;
    const checksum = crc32(data);
    const stamp = dosStamp(entry.mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // 本地文件头签名
    local.writeUInt16LE(20, 4);           // 解压所需版本 2.0
    local.writeUInt16LE(0x0800, 6);       // bit 11：文件名是 UTF-8
    local.writeUInt16LE(0, 8);            // 压缩方法 0 = STORE
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18); // 压缩后大小
    local.writeUInt32LE(data.length, 22); // 原始大小
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // 扩展字段长度
    parts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 中央目录头签名
    central.writeUInt16LE(20, 4);         // 打包程序版本
    central.writeUInt16LE(20, 6);         // 解压所需版本
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // 扩展字段
    central.writeUInt16LE(0, 32);         // 注释
    central.writeUInt16LE(0, 34);         // 起始磁盘号
    central.writeUInt16LE(0, 36);         // 内部属性
    central.writeUInt32LE(0, 38);         // 外部属性
    central.writeUInt32LE(offset, 42);    // 对应本地头的偏移
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);       // 中央目录结束记录
  end.writeUInt16LE(0, 4);                // 当前磁盘号
  end.writeUInt16LE(0, 6);                // 中央目录起始磁盘号
  end.writeUInt16LE(list.length, 8);
  end.writeUInt16LE(list.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);               // 注释长度

  return Buffer.concat([...parts, centralBuf, end]);
}

module.exports = { buildZip, crc32 };
