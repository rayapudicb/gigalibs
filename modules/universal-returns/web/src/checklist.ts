import type { RmaV1 } from '@gigalibs/contracts';

export type RmaChecklistStep = {
  key: string;
  label: string;
  done: boolean;
  hint?: string;
};

/** Derives processing-checklist steps from persisted RMA state (WI-OI-128 S5). */
export function deriveRmaChecklistSteps(rma: RmaV1): RmaChecklistStep[] {
  const submitted = rma.status !== 'DRAFT';
  const authorized = !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(rma.status);
  const linesFullyReceived = rma.lines.every((line) => {
    const received = Number.parseFloat(line.receivedQuantity);
    const authorizedQty = Number.parseFloat(line.authorizedQuantity);
    return received >= authorizedQty && authorizedQty > 0;
  });
  const canDispose = ['AUTHORIZED', 'RECEIVING', 'INSPECTING'].includes(rma.status);

  return [
    { key: 'submit', label: 'Submit RMA for review', done: submitted },
    { key: 'authorize', label: 'Authorize return quantities', done: authorized },
    {
      key: 'inspect',
      label: 'Inspect goods and record disposition',
      done: linesFullyReceived,
      hint: canDispose ? 'Choose restock, quarantine, or scrap per line.' : undefined,
    },
    {
      key: 'credit',
      label: 'Request credit memo (Orders / AR)',
      done: false,
      hint: 'Use the credit memo action after disposition when a refund is due.',
    },
  ];
}
