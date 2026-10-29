import { ExactDecimal } from '@gigalibs/contracts';

export interface MrpSupplyDemand {
  readonly productId: string;
  readonly warehouseId: string;
  readonly demand: string;
  readonly supply: string;
}

/** WI-OI-126 S4: classic net requirement = max(0, demand - supply). */
export function netMrpRequirements(rows: readonly MrpSupplyDemand[]): Array<{
  productId: string;
  warehouseId: string;
  netRequirement: string;
}> {
  return rows.map((row) => {
    const net = ExactDecimal.subtract(row.demand, row.supply);
    const netRequirement = ExactDecimal.isNegative(net) ? '0' : net;
    return { productId: row.productId, warehouseId: row.warehouseId, netRequirement };
  });
}
