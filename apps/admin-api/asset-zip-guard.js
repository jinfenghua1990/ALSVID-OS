'use strict';

function zipError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Read from the S3 Node stream, enforcing the actual byte limit before concatenation.
async function readZipBody(body, remaining) {
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw zipError('素材对象流不可用', 502);
  }
  const parts = [];
  let size = 0;
  for await (const chunk of body) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (data.length > remaining - size) throw zipError('所选素材总体积过大，请分批下载', 413);
    size += data.length;
    parts.push(data);
  }
  return Buffer.concat(parts, size);
}

// A slot is held until BOTH preparation and HTTP response have ended.
function createZipGate() {
  let active = false;
  return function acquire(raw) {
    if (active) throw zipError('已有素材打包任务，请稍后重试', 429);
    active = true;
    let prepared = false, ended = false;
    const release = () => { if (prepared && ended) active = false; };
    const onEnd = () => {
      if (ended) return;
      ended = true;
      raw.removeListener('finish', onEnd);
      raw.removeListener('close', onEnd);
      release();
    };
    raw.once('finish', onEnd);
    raw.once('close', onEnd);
    if (raw.destroyed || raw.writableFinished) onEnd();
    return () => { if (prepared) return; prepared = true; release(); };
  };
}
module.exports = { readZipBody, createZipGate };
