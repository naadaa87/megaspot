// Admin lists expose status only; prices and supplier information stay in detail views.
export const SERVICE_DATA_SQL = "json_object('catering',json_extract(i.data,'$.catering'),'reception',json_extract(i.data,'$.reception'),'cocktail',json_extract(i.data,'$.cocktail'))";
export function reservationServices(raw, buffetOrder) {
  let data;
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { data = null; }
  data = data || {};
  return ['catering', 'reception', 'cocktail'].flatMap(kind => {
    const value = kind === 'catering' && buffetOrder ? buffetOrder : data[kind];
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.removed || !Object.keys(value).length) return [];
    return [{kind, status: ['confirmed', 'cancelled'].includes(value.status) ? value.status : 'pending'}];
  });
}
