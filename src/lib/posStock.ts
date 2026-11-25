import type { Ingredient, Product } from '../types/ezflow';

export interface CartStockLine {
  product: Product;
  quantity: number;
}

/**
 * Resolves a recipe ingredient for a specific outlet.
 * When targetOutletId is specified (not 'ALL'), NEVER falls back to another outlet's stock.
 */
export function resolveIngredientForOutlet(
  allIngredients: Ingredient[],
  rec: { ingredientId: string; ingredientName: string },
  targetOutletId?: string
): Ingredient | undefined {
  if (!targetOutletId || targetOutletId === 'ALL') {
    return allIngredients.find((i) => i.id === rec.ingredientId);
  }
  const exactInOutlet = allIngredients.find(
    (i) => i.id === rec.ingredientId && i.outletId === targetOutletId
  );
  if (exactInOutlet) return exactInOutlet;

  const targetName = rec.ingredientName.trim().toLowerCase();
  const byNameInOutlet = allIngredients.find(
    (i) => i.outletId === targetOutletId && i.name.trim().toLowerCase() === targetName
  );
  return byNameInOutlet;
}

/**
 * Aggregates total ingredient demand across all lines in a cart for a specific outlet.
 */
export function aggregateCartIngredientRequirements(
  items: CartStockLine[],
  allIngredients: Ingredient[],
  targetOutletId?: string
): Map<string, { needed: number; name: string; unit: string; resolved?: Ingredient }> {
  const required = new Map<string, { needed: number; name: string; unit: string; resolved?: Ingredient }>();

  for (const line of items) {
    if (line.quantity <= 0) continue;
    for (const rec of line.product.recipe || []) {
      const resolvedIng = resolveIngredientForOutlet(allIngredients, rec, targetOutletId);
      const targetIngId = resolvedIng?.id || `missing:${rec.ingredientId}:${rec.ingredientName.toLowerCase()}`;
      const prev = required.get(targetIngId);
      const qtyNeeded = rec.quantity * line.quantity;
      if (prev) {
        prev.needed += qtyNeeded;
      } else {
        required.set(targetIngId, {
          needed: qtyNeeded,
          name: resolvedIng?.name || rec.ingredientName,
          unit: resolvedIng?.unit || rec.unit,
          resolved: resolvedIng,
        });
      }
    }
  }

  return required;
}

/**
 * Validates whether all aggregated ingredient requirements across a cart can be fulfilled
 * by the target outlet's current inventory.
 */
export function validateCartStockAvailability(
  items: CartStockLine[],
  allIngredients: Ingredient[],
  targetOutletId?: string
): { ok: true; requirements: Map<string, { needed: number; name: string; unit: string; resolved?: Ingredient }> } | { ok: false; error: string } {
  const requirements = aggregateCartIngredientRequirements(items, allIngredients, targetOutletId);

  for (const req of requirements.values()) {
    if (!req.resolved) {
      return {
        ok: false,
        error: `Bahan baku "${req.name}" belum tersedia di inventaris outlet ini.`,
      };
    }
    if (req.resolved.stock + 1e-9 < req.needed) {
      return {
        ok: false,
        error: `Stok "${req.resolved.name}" tidak mencukupi (tersedia ${req.resolved.stock} ${req.resolved.unit}, dibutuhkan ${Number(req.needed.toFixed(3))} ${req.resolved.unit}).`,
      };
    }
  }

  return { ok: true, requirements };
}

/**
 * Computes how many ADDITIONAL units of each product can still be added to the cart
 * after subtracting ingredients already committed to existing cart items.
 */
export function computeRemainingProducibleMap(
  products: Product[],
  allIngredients: Ingredient[],
  cart: CartStockLine[],
  targetOutletId?: string
): Map<string, number> {
  const map = new Map<string, number>();

  // Total ingredients already reserved by current cart lines
  const committedByIngId = new Map<string, number>();
  for (const line of cart) {
    if (line.quantity <= 0) continue;
    for (const rec of line.product.recipe || []) {
      const ing = resolveIngredientForOutlet(allIngredients, rec, targetOutletId);
      if (ing) {
        committedByIngId.set(ing.id, (committedByIngId.get(ing.id) || 0) + rec.quantity * line.quantity);
      }
    }
  }

  for (const p of products) {
    if (!p.recipe || p.recipe.length === 0) {
      map.set(p.id, 999);
      continue;
    }

    // Group product's own recipe demand per resolved ingredient (in case a recipe has duplicate lines)
    const perUnitByIng = new Map<string, { qty: number; ing?: Ingredient }>();
    let missing = false;
    for (const rec of p.recipe) {
      if (rec.quantity <= 0) {
        missing = true;
        break;
      }
      const ing = resolveIngredientForOutlet(allIngredients, rec, targetOutletId);
      if (!ing) {
        missing = true;
        break;
      }
      const prev = perUnitByIng.get(ing.id);
      if (prev) {
        prev.qty += rec.quantity;
      } else {
        perUnitByIng.set(ing.id, { qty: rec.quantity, ing });
      }
    }

    if (missing) {
      map.set(p.id, 0);
      continue;
    }

    let minAdditional = 999;
    for (const [ingId, { qty, ing }] of perUnitByIng.entries()) {
      const remainingStock = Math.max(0, (ing?.stock || 0) - (committedByIngId.get(ingId) || 0));
      const possible = Math.floor((remainingStock + 1e-9) / qty);
      if (possible < minAdditional) minAdditional = possible;
    }

    map.set(p.id, Math.max(0, minAdditional));
  }

  return map;
}
