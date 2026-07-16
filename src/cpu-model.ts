export function normalizeCpuModel(value?: string | null) {
  if (!value) return '';
  const coreUltra = value.match(/core\s*ultra\s*(?:[579]\s*)?(\d{3})\s*(kf|k|f)?(?:\s*(plus))?\b/i);
  if (coreUltra) return `core-ultra-${coreUltra[1]}${coreUltra[2] ?? ''}${coreUltra[3] ? '-plus' : ''}`.toLowerCase();

  const intel = value.match(/\bi\s*([3579])\s*[- ]?\s*(\d{4,5})\s*([a-z]{0,3})\b/i);
  if (intel) return `i${intel[1]}-${intel[2]}${intel[3]}`.toLowerCase();

  const ryzen = value.match(/(?:ryzen|라이젠)\s*([3579])\s*[- ]?\s*(\d{3,4})\s*(x3d|xt|x|g|f|gt|t)?\b/i);
  if (ryzen) return `ryzen${ryzen[1]}-${ryzen[2]}${ryzen[3] ?? ''}`.toLowerCase();

  const athlon = value.match(/athlon(?:\s+pro)?\s*(\d{3,4}[a-z]{0,2})\b/i);
  return athlon ? `athlon-${athlon[1]}`.toLowerCase() : '';
}
