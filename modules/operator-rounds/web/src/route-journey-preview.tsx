import type { RoundCheckpointDraftV1 } from '@gigalibs/contracts';
import { Text } from '@medusajs/ui';

function ruleLabel(rule: RoundCheckpointDraftV1['branchRules'][number]): string {
  if (rule.condition === 'ALWAYS') return `Always → checkpoint ${rule.nextPosition}`;
  if (rule.condition === 'STATUS_IS') return `${rule.value} reading → checkpoint ${rule.nextPosition}`;
  return `Value “${rule.value}” → checkpoint ${rule.nextPosition}`;
}

/** Preview is built from the editor's actual route draft; it never represents a published assignment. */
export function RouteJourneyPreview({points}:{readonly points:readonly RoundCheckpointDraftV1[]}) {
  return <section aria-label="Operator route preview" className="flex flex-col gap-3 rounded border border-ui-border-base p-3">
    <div>
      <h4 className="text-base font-semibold">Operator route preview</h4>
      <Text size="small" className="text-ui-fg-subtle">Draft visit order and conditional paths. Save and publish a revision before operators receive it.</Text>
    </div>
    {points.length === 0 ? <Text size="small">Add a checkpoint to preview the route.</Text> :
      <ol className="flex flex-col gap-2">
        {points.map((point,index) => <li key={point.id ?? `draft-${index}`} className="rounded border border-ui-border-base p-3">
          <Text weight="plus">{index+1}. {point.label.trim() || 'Unnamed checkpoint'}</Text>
          <Text size="small" className="text-ui-fg-subtle">
            {point.proofMode === 'EITHER' ? 'NFC or barcode' : point.proofMode === 'NFC' ? 'NFC scan' : 'Barcode scan'}
            {' · '}{point.readingKind === 'NUMERIC' ? `Numeric${point.unitCode ? ` (${point.unitCode})` : ''}` :
              point.readingKind === 'BOOLEAN' ? 'Pass / fail' : 'Choice'}
            {point.photoOnException ? ' · Photo for exception' : ''}
          </Text>
          {point.instructions && <Text size="small">{point.instructions}</Text>}
          {point.branchRules.length > 0 ? <ul className="mt-2 list-disc pl-5">
            {point.branchRules.map((rule,ruleIndex) => <li key={`${rule.condition}-${ruleIndex}`}>
              <Text size="small">{ruleLabel(rule)}</Text>
            </li>)}
          </ul> : <Text size="small" className="text-ui-fg-subtle">
            {index+1 < points.length ? `Next → checkpoint ${index+2}` : 'Next → complete route'}
          </Text>}
        </li>)}
      </ol>}
  </section>;
}
