import type { CostLibrary, ProductRecipe } from "./types";

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
    issues.push(`${richer.label}과 같은 원자재를 쓰지만 연결된 공정이 더 적습니다. 구형 설정일 수 있어 삭제하거나 합치지 않았습니다.`);
  }
  return issues;
}
