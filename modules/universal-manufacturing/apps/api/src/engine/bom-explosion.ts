import { ExactDecimal } from '@gigalibs/contracts';

export interface BomLineNode {
  readonly componentProductId: string;
  readonly uomId: string;
  readonly quantityPer: string;
  readonly subBomId?: string | null;
}

export interface BomNode {
  readonly id: string;
  readonly finishedProductId: string;
  readonly lines: readonly BomLineNode[];
}

/** WI-OI-126 S1: multi-level BOM explosion into gross component requirements (pure). */
export function explodeBomRequirements(
  rootBom: BomNode,
  orderQuantity: string,
  bomsById: ReadonlyMap<string, BomNode>,
): Map<string, { uomId: string; quantity: string }> {
  const totals = new Map<string, { uomId: string; quantity: string }>();
  const visit = (bom: BomNode, multiplier: string): void => {
    for (const line of bom.lines) {
      const lineQty = ExactDecimal.multiply(multiplier, line.quantityPer);
      if (line.subBomId) {
        const child = bomsById.get(line.subBomId);
        if (!child) throw new Error(`Sub-BOM ${line.subBomId} is missing.`);
        visit(child, lineQty);
      } else {
        const existing = totals.get(line.componentProductId);
        if (existing && existing.uomId !== line.uomId) {
          throw new Error(`Component ${line.componentProductId} has conflicting units of measure.`);
        }
        const next = existing
          ? ExactDecimal.add(existing.quantity, lineQty)
          : lineQty;
        totals.set(line.componentProductId, { uomId: line.uomId, quantity: next });
      }
    }
  };
  visit(rootBom, orderQuantity);
  return totals;
}
