import type { CostLibrary, LegacyQuoteId, ProductRecipe } from "./types";

export interface PublicMenuItem {
  id: string;
  label: string;
  description?: string;
  legacyQuoteId: LegacyQuoteId;
  href: string;
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
  if (recipe.approvedSupplyPrice == null && recipe.fixedSupplyPrice == null) {
    return "확정 판매가가 없습니다. 고객 견적 계산도 아직 없어 첫 화면에 올리지 않습니다.";
  }
  return "고객 견적 계산이 아직 없습니다. 확정 판매가만으로는 계산 화면이 생기지 않으므로 공개하지 않습니다.";
}

export function isListedOnCustomerHome(recipe: ProductRecipe): boolean {
  if (!recipe.active) return false;
  if (recipe.customerVisible === false) return false;
  if (!recipe.legacyQuoteId) return false;
  return recipe.customerVisible === true || recipe.customerVisible == null;
}

function toMenuItem(recipe: ProductRecipe): PublicMenuItem | null {
  if (!isListedOnCustomerHome(recipe) || !recipe.legacyQuoteId) return null;
  const description = recipe.description?.trim();
  return {
    id: recipe.productId,
    label: recipe.label.trim() || recipe.legacyQuoteId,
    description: description || undefined,
    legacyQuoteId: recipe.legacyQuoteId,
    href: `/quote?product=${encodeURIComponent(recipe.legacyQuoteId)}`,
  };
}

export function buildPublicCatalog(library: Pick<CostLibrary, "recipes" | "groups">): PublicCatalog {
  const order = new Map(library.recipes.map((recipe, index) => [recipe.productId, index]));
  const activeGroups = [...(library.groups ?? [])]
    .filter((group) => group.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"));
  const activeIds = new Set(activeGroups.map((group) => group.id));
  const sortItems = (rows: ProductRecipe[]) =>
    [...rows].sort((a, b) => (a.sortOrder ?? order.get(a.productId) ?? 0) - (b.sortOrder ?? order.get(b.productId) ?? 0));

  const groups: PublicMenuGroup[] = activeGroups.map((group) => {
    const products = sortItems(library.recipes.filter((recipe) => recipe.groupId === group.id))
      .map(toMenuItem)
      .filter((item): item is PublicMenuItem => item != null);
    return { id: group.id, label: group.label, products };
  }).filter((group) => group.products.length > 0);

  const knownGroupIds = new Set((library.groups ?? []).map((group) => group.id));
  const ungrouped = sortItems(library.recipes.filter((recipe) => !recipe.groupId || !knownGroupIds.has(recipe.groupId)))
    .map(toMenuItem)
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
    })),
  };
}

export function listedLegacyIds(catalog: PublicCatalog): string[] {
  return [...catalog.groups.flatMap((group) => group.products), ...catalog.ungrouped].map((item) => item.legacyQuoteId);
}
