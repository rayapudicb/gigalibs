import type { RoundCheckpointDraftV1 } from '@gigalibs/contracts';

/** Keep branch targets attached to the same checkpoint when the editor changes visit order. */
export function reorderRoundCheckpoints(
  points: readonly RoundCheckpointDraftV1[],
  from: number,
  to: number,
): RoundCheckpointDraftV1[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
    from >= points.length || to >= points.length)
    throw new Error('Select an existing checkpoint position.');
  if (new Set(points.map((point) => point.position)).size !== points.length)
    throw new Error('Checkpoint positions must be unique before reordering.');
  const reordered = [...points];
  const [moved] = reordered.splice(from,1);
  if (!moved) throw new Error('Checkpoint is missing from the route.');
  reordered.splice(to,0,moved);
  const oldToNew = new Map(reordered.map((point,index) => [point.position,index+1]));
  return reordered.map((point,index) => ({
    ...point,
    position:index+1,
    branchRules:point.branchRules.map((rule) => {
      const target = oldToNew.get(rule.nextPosition);
      if (!target) throw new Error('A branch points to a checkpoint that is no longer in the route.');
      if (target <= index+1)
        throw new Error('This move would make a conditional branch go backward. Edit the branch before reordering.');
      return {...rule,nextPosition:target};
    }),
  }));
}
