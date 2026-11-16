import { quoteStage, quoteStageLabel } from "./recipeHealth";
import type { CostLibrary, LegacyQuoteId, ProductRecipe } from "./types";

export interface PublicMenuItem {
  id: string;
  label: string;
  description?: string;
  legacyQuoteId?: LegacyQuoteId;
  href: string;
  ready: boolean;
  note?: string;
  favorite?: boolean;
}

export interface PublicMenuGroup {
  id: string;
  label: string;
  products: PublicMenuItem[];
}

export interface PublicCatalog {
  /** 그룹에 들어간 품목이 없으면 기존 버튼 목록처럼 한 줄로 보여 준다. */
  flat: boolean;
  groups: PublicMenuGroup[];
  ungrouped: PublicMenuItem[];
}

const LEGACY_ORDER: LegacyQuoteId[] = [
  "pop",
  "sticker-sheet",
  "sticker-solvent",
  "uv-acrylic-keyring",
  "dtf",
  "tshirt",
  "business-card",
  "banner",
];

export function customerQuoteBlockReason(recipe: ProductRecipe): string | null {
  if (recipe.legacyQuoteId) return null;
  if (recipe.lines.length === 0) return "원자재나 공정을 연결하면 직원 견적에 올릴 수 있습니다.";
  return null;
}

export function isListedOnCustomerHome(recipe: ProductRecipe): boolean {
  if (!recipe.active || recipe.staffHidden === true) return false;
  if (recipe.legacyQuoteId) return recipe.customerVisible !== false;
  if (recipe.lines.length === 0) return false;
  if (recipe.customerVisible === false && recipe.staffHidden == null) return true;
  return recipe.customerVisible !== false;
}

function toMenuItem(library: Pick<CostLibrary, "materials" | "processes" | "recipes">, recipe: ProductRecipe): PublicMenuItem | null {
  if (!isListedOnCustomerHome(recipe)) return null;
  const description = recipe.description?.trim();
  const stage = recipe.legacyQuoteId ? "ready" : quoteStage(library, recipe);
  const quoteId = recipe.legacyQuoteId ?? recipe.productId;
  return {
    id: recipe.productId,
    label: recipe.label.trim() || quoteId,
    description: description || undefined,
    legacyQuoteId: recipe.legacyQuoteId,
    href: `/quote?product=${encodeURIComponent(quoteId)}`,
    ready: stage === "ready",
    note: stage === "ready" ? undefined : quoteStageLabel(stage === "hidden" ? "incomplete" : stage),
    favorite: recipe.favorite === true,
  };
}

export function buildPublicCatalog(library: Pick<CostLibrary, "recipes" | "groups" | "materials" | "processes">): PublicCatalog {
  const order = new Map(library.recipes.map((recipe, index) => [recipe.productId, index]));
  const activeGroups = [...(library.groups ?? [])]
    .filter((group) => group.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"));
  const activeIds = new Set(activeGroups.map((group) => group.id));
  const sortItems = (rows: ProductRecipe[]) =>
    [...rows].sort((a, b) => (a.sortOrder ?? order.get(a.productId) ?? 0) - (b.sortOrder ?? order.get(b.productId) ?? 0));

  const groups: PublicMenuGroup[] = activeGroups.map((group) => {
    const products = sortItems(library.recipes.filter((recipe) => recipe.groupId === group.id))
      .map((recipe) => toMenuItem(library, recipe))
      .filter((item): item is PublicMenuItem => item != null);
    return { id: group.id, label: group.label, products };
  }).filter((group) => group.products.length > 0);

  const knownGroupIds = new Set((library.groups ?? []).map((group) => group.id));
  const ungrouped = sortItems(library.recipes.filter((recipe) => !recipe.groupId || !knownGroupIds.has(recipe.groupId)))
    .map((recipe) => toMenuItem(library, recipe))
    .filter((item): item is PublicMenuItem => item != null);

  return {
    flat: groups.length === 0,
    groups,
    ungrouped,
  };
}

export function defaultPublicCatalog(items: { id: LegacyQuoteId; label: string }[] = LEGACY_ORDER.map((id) => ({
  id,
  label: id,
}))): PublicCatalog {
  const labels: Record<LegacyQuoteId, string> = {
    pop: "POP",
    "sticker-sheet": "스티커 시트",
    "sticker-solvent": "스티커 솔벤트",
    "uv-acrylic-keyring": "UV아크릴키링",
    dtf: "DTF",
    tshirt: "티셔츠",
    "business-card": "명함",
    banner: "배너",
  };
  return {
    flat: true,
    groups: [],
    ungrouped: items.map((item) => ({
      id: item.id,
      label: item.label && item.label !== item.id ? item.label : labels[item.id],
      legacyQuoteId: item.id,
      href: `/quote?product=${encodeURIComponent(item.id)}`,
      ready: true,
    })),
  };
}

export function listedLegacyIds(catalog: PublicCatalog): string[] {
  return [...catalog.groups.flatMap((group) => group.products), ...catalog.ungrouped]
    .map((item) => item.legacyQuoteId)
    .filter((id): id is LegacyQuoteId => Boolean(id));
}
