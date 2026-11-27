// 不把已属于其他模块的内容当作当前模块编辑；旧版无编号内容仅在槽位和类型一致时复用。
export function selectHomepageBlock(blocks, moduleId, slot, allowed) {
  const rows = Array.isArray(blocks) ? blocks : [];
  const matches = rows.filter(row => row.moduleId === moduleId);
  if (matches.length === 1) return { block: matches[0], ambiguous: false };
  if (matches.length > 1) return { block: null, ambiguous: true };
  const unassigned = rows.filter(row => !row.moduleId && allowed.includes(row.componentKey));
  if (unassigned.length === 1 && rows[slot] === unassigned[0]) return { block: unassigned[0], ambiguous: false };
  return { block: null, ambiguous: unassigned.length > 0 };
}
