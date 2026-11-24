export function resolveFitments(fitments, vehicles) {
  return fitments.map(fit => {
    const matches = fit.vehicleUuid
      ? vehicles.filter(v => v.entityUuid === fit.vehicleUuid)
      : vehicles.filter(v => v.model === fit.vehicleModel);
    const vehicle = matches.length === 1 ? matches[0] : null;
    return { ...fit, vehicleId: vehicle?.id || '' };
  });
}

export function fitmentError(fitments, vehicles) {
  if (fitments.some(f => !f.vehicleId)) return '请先确认或移除无法识别的旧适配记录';
  if (new Set(fitments.map(f => f.vehicleId)).size !== fitments.length) return '同一整车不能重复添加';
  for (const fit of fitments) {
    const vehicle = vehicles.find(v => v.id === fit.vehicleId);
    if (!vehicle) return '适配整车不存在，请重新选择';
    if (!vehicle.entityUuid && vehicles.filter(v => v.model === vehicle.model).length !== 1) return '该车型对应多辆整车，须先更新后端后才能精确关联';
  }
  return '';
}

export function fitmentPayload(fitments, vehicles) {
  return fitments.map(f => {
    const vehicle = vehicles.find(v => v.id === f.vehicleId);
    return { vehicleUuid: vehicle.entityUuid || undefined, vehicleModel: vehicle.model, note: f.note || '' };
  });
}
