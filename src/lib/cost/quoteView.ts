export interface QuoteCalcResult {
  missing: string[];
  warnings?: string[];
  supplyCost?: number;
  targetRate?: number;
  targetSupplyPrice?: number;
  productMinimumSupply?: number;
  recommendedSupplyPrice?: number;
  vatRate: number;
  lines?: QuoteDetailLine[];
  costLibraryRevision?: number;
  minimumApplied?: boolean;
  usage?: PaperUsage[];
  details?: QuoteDetails;
}

export interface QuoteDetailLine {
  kind?: string;
  name?: string;
  usageQty?: number;
  unitLabel?: string;
  layoutQty?: number;
  layoutUnit?: string;
  spec?: string;
  perSheet?: number;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
}

export interface QuoteDetails {
  materials: { name: string; text: string }[];
  timeText?: string;
}

export interface PaperUsage {
  name: string;
  qty: number;
  unit: "장" | "m";
  text: string;
}

export function paperUsage(lines: QuoteCalcResult["lines"]): PaperUsage[] {
  const rows: PaperUsage[] = [];
  for (const line of lines ?? []) {
    if (line.kind !== "material" || !line.name) continue;
    const unit = line.layoutUnit ?? line.unitLabel;
    const qty = line.layoutQty ?? line.usageQty;
    if ((unit !== "장" && unit !== "m") || qty == null || !Number.isFinite(qty)) continue;
    const shown = unit === "장" ? Math.round(qty * 10) / 10 : Math.round(qty * 100) / 100;
    rows.push({
      name: line.name,
      qty: shown,
      unit,
      text: unit === "장" ? `${line.name} ${shown}장` : `${line.name} ${shown}m 출력`,
    });
  }
  return rows;
}

export interface QuoteCalcBody {
  label: string;
  stage: string;
  stageLabel: string;
  issues: string[];
  fields: { width: boolean; height: boolean; gap: boolean };
  result: QuoteCalcResult;
}

export function quoteDetails(
  lines: QuoteCalcResult["lines"],
  timing?: { secondsPerSheet?: number; minutesPerMeter?: number }
): QuoteDetails {
  const materials: QuoteDetails["materials"] = [];
  let sheetQty = 0;
  let dtfMeters = 0;
  for (const line of lines ?? []) {
    if (line.kind !== "material" || !line.name) continue;
    const text = materialDetailText(line);
    if (text) materials.push({ name: line.name, text });
    const unit = line.layoutUnit ?? line.unitLabel;
    const qty = line.layoutQty ?? line.usageQty;
    if (qty == null || !Number.isFinite(qty)) continue;
    if (unit === "장") sheetQty += qty;
    if (unit === "m" && /dtf/i.test(line.name)) dtfMeters += qty;
  }
  const minutes = estimatedMinutes(sheetQty, dtfMeters, timing);
  return { materials, timeText: minutes == null ? undefined : formatMinutes(minutes) };
}

function materialDetailText(line: QuoteDetailLine): string {
  const parts: string[] = [];
  const spec = (line.spec ?? "").replace(/\s+/g, " ").trim();
  const width = line.sheetWidthMm;
  const height = line.sheetHeightMm;
  if (/^a4$/i.test(spec) && width && height) parts.push(`A4 ${width}×${height}mm`);
  else if (spec) parts.push(spec);
  else if (width && height) parts.push(`${width}×${height}mm`);
  const unit = line.layoutUnit ?? line.unitLabel;
  const qty = line.layoutQty ?? line.usageQty;
  if (qty != null && Number.isFinite(qty)) {
    if (unit === "장") parts.push(`${Math.round(qty * 10) / 10}장`);
    else if (unit === "m" || unit === "㎡") parts.push(`${Math.round(qty * 100) / 100}${unit}`);
    else if (unit) parts.push(`${Math.round(qty * 10) / 10}${unit}`);
  }
  if (line.perSheet != null && line.perSheet > 0) parts.push(`한 장에 ${line.perSheet}개`);
  return parts.join(" · ");
}

function estimatedMinutes(
  sheetQty: number,
  dtfMeters: number,
  timing?: { secondsPerSheet?: number; minutesPerMeter?: number }
): number | undefined {
  let minutes = 0;
  let known = false;
  const seconds = timing?.secondsPerSheet;
  if (sheetQty > 0 && seconds != null && seconds > 0) {
    minutes += Math.ceil((sheetQty * seconds) / 60);
    known = true;
  }
  const perMeter = timing?.minutesPerMeter;
  if (dtfMeters > 0 && perMeter != null && perMeter > 0) {
    minutes += Math.ceil(dtfMeters * perMeter);
    known = true;
  }
  return known && minutes > 0 ? minutes : undefined;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `약 ${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `약 ${hours}시간` : `약 ${hours}시간 ${rest}분`;
}

/** 직원 응답에는 판매가 계산에 필요한 값만 남긴다. 원가와 이익률은 관리자만 받는다. */
export function quoteCalculationForRole(
  body: QuoteCalcBody,
  role: "admin" | "staff",
  timing?: { secondsPerSheet?: number; minutesPerMeter?: number }
): QuoteCalcBody {
  const usage = paperUsage(body.result.lines);
  const details = quoteDetails(body.result.lines, timing);
  if (role === "admin") return { ...body, result: { ...body.result, usage, details } };
  const recommended = body.result.recommendedSupplyPrice;
  const floor = body.result.productMinimumSupply;
  const target = body.result.targetSupplyPrice ?? 0;
  return {
    label: body.label,
    stage: body.stage,
    stageLabel: body.stageLabel,
    issues: [],
    fields: body.fields,
    result: {
      missing: body.result.missing,
      recommendedSupplyPrice: recommended,
      productMinimumSupply: floor,
      minimumApplied: floor != null && recommended === floor && target < floor,
      vatRate: body.result.vatRate,
      usage,
      details,
    },
  };
}

export function quoteEntryForRole<T extends { internal?: unknown }>(entry: T, role: "admin" | "staff"): T {
  if (role === "admin") return entry;
  const copy = { ...entry };
  delete copy.internal;
  return copy;
}
