import type { CostLibrary, ProductRecipe } from "./types";

export type QuoteStage = "ready" | "review" | "incomplete" | "hidden";

/** 관리자가 저장한 상태가 있으면 그것을 쓴다. 없으면 구성으로 판단한다. */
export function quoteStage(library: Pick<CostLibrary, "materials" | "processes" | "recipes">, recipe: ProductRecipe): QuoteStage {
  if (!recipe.active || recipe.staffHidden === true) return "hidden";
  if (recipe.quoteStatus === "ready" || recipe.quoteStatus === "review" || recipe.quoteStatus === "incomplete") return recipe.quoteStatus;
  if (recipe.legacyQuoteId) return "ready";
  const issues = recipeIssues(library, recipe);
  if (issues.length > 0 || recipe.lines.length === 0) return "incomplete";
  const provisional = recipe.lines.some((line) => {
    if (line.kind !== "process") return false;
    const process = library.processes.find((row) => row.id === line.refId);
    return Boolean(process && (process.label.includes("잠정") || process.label.includes("임시") || process.variable?.status === "code-reference"));
  });
  if (provisional || recipe.label === "DTF출력") return "review";
  return "ready";
}

export function quoteStageLabel(stage: QuoteStage): string {
  if (stage === "ready") return "사용 가능";
  if (stage === "review") return "검증 중";
  if (stage === "hidden") return "비활성";
  return "설정 필요";
}

/** 직원 화면에 보여줄 설정 상태. 금액은 넣지 않는다. */
export function recipeIssues(library: Pick<CostLibrary, "materials" | "processes" | "recipes">, recipe: ProductRecipe): string[] {
  const issues: string[] = [];
  if (recipe.lines.length === 0) {
    issues.push("원자재나 공정이 연결되지 않았습니다.");
    return issues;
  }
  for (const line of recipe.lines) {
    if (line.kind === "material") {
      const material = library.materials.find((row) => row.id === line.refId);
      if (!material) {
        issues.push("연결한 원자재를 찾을 수 없습니다.");
        continue;
      }
      if (line.usage === "per-piece" && (material.usageUnit === "m" || material.purchaseUnit === "roll")) {
        issues.push(`${material.label}을 개당 고정 길이로 쓰고 있습니다. 실제 사용량이 확정되기 전에는 원가 구성이 미완성입니다.`);
      }
    }
    if (line.kind === "process" && !library.processes.find((row) => row.id === line.refId)) {
      issues.push("연결한 공정을 찾을 수 없습니다.");
    }
  }
  const myMaterials = new Set(recipe.lines.filter((line) => line.kind === "material").map((line) => line.refId));
  const richer = library.recipes.find((other) => {
    if (other.productId === recipe.productId || !other.active || other.lines.length <= recipe.lines.length) return false;
    const otherMaterials = new Set(other.lines.filter((line) => line.kind === "material").map((line) => line.refId));
    const shares = [...myMaterials].some((id) => otherMaterials.has(id));
    return shares && other.lines.some((line) => line.kind === "process") && recipe.lines.filter((line) => line.kind === "process").length < other.lines.filter((line) => line.kind === "process").length;
  });
  if (richer) {
    const last = richer.label.charCodeAt(richer.label.length - 1);
    const batchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
    issues.push(`${richer.label}${batchim ? "과" : "와"} 같은 원자재를 쓰지만 연결된 공정이 더 적습니다. 구형 설정일 수 있어 삭제하거나 합치지 않았습니다.`);
  }
  return issues;
}
