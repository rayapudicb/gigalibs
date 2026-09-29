'use client';

/**
 * WI-OI-103d d7: formula measures of the chosen model that wait for review. Approving publishes the version so it
 * appears among the model's measures; Analytics refuses a review by the version's creator (maker-checker) and by
 * members without `analytics:models:publish`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Text } from '@medusajs/ui';
import type { FormulaExpressionV1, FormulaMeasureV1 } from '@gigalibs/contracts';
import { analyticsApi } from './analytics-api';

const OPERATOR: Record<string, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };

export function describeExpression(expression: FormulaExpressionV1, labels: ReadonlyMap<string, string>, nested = false): string {
  if (expression.kind === 'measure') return labels.get(expression.name) ?? expression.name;
  if (expression.kind === 'constant') return String(expression.value);
  const text = `${describeExpression(expression.left, labels, true)} ${OPERATOR[expression.operator]} ${describeExpression(expression.right, labels, true)}`;
  return nested ? `(${text})` : text;
}

export function FormulaReviewPanel({
  modelId,
  measureLabels,
  onPublished,
}: {
  modelId: string;
  measureLabels: ReadonlyMap<string, string>;
  onPublished: () => void;
}) {
  const [formulas, setFormulas] = useState<FormulaMeasureV1[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    analyticsApi<FormulaMeasureV1[]>(`v1/formula-measures/model/${modelId}`)
      .then(setFormulas)
      .catch(() => setFormulas([]));
  }, [modelId]);
  useEffect(refresh, [refresh]);

  const pending = formulas.flatMap((formula) =>
    formula.versions.filter((version) => version.state === 'PENDING_REVIEW').map((version) => ({ formula, version })),
  );
  if (pending.length === 0) return null;

  const decide = async (formulaId: string, versionId: string, decision: 'approve' | 'reject') => {
    setBusy(`${versionId}:${decision}`);
    setError(null);
    try {
      await analyticsApi(`v1/formula-measures/${formulaId}/versions/${versionId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ reason: null }),
      });
      refresh();
      if (decision === 'approve') onPublished();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
      <Text size="small" weight="plus" className="text-ui-fg-base">Waiting for review</Text>
      {pending.map(({ formula, version }) => (
        <div key={version.id} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Text size="small" className="text-ui-fg-base">{version.definition.displayLabel}</Text>
            <Badge size="2xsmall" color="purple">{version.definition.unit}</Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {describeExpression(version.definition.expression, measureLabels)} · version {version.versionNumber} by{' '}
            {version.createdBy}
          </Text>
          <div className="flex gap-2">
            <Button
              type="button"
              size="small"
              isLoading={busy === `${version.id}:approve`}
              disabled={busy !== null}
              onClick={() => void decide(formula.id, version.id, 'approve')}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={busy === `${version.id}:reject`}
              disabled={busy !== null}
              onClick={() => void decide(formula.id, version.id, 'reject')}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
