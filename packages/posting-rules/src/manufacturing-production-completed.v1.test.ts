import { describe, expect, it } from 'vitest';
import { manufacturingProductionCompletedPostingPolicyV1 } from './manufacturing-production-completed.v1.js';

describe('manufacturingProductionCompletedPostingPolicyV1', () => {
  it('names the production completed event and stable line ids', () => {
    expect(manufacturingProductionCompletedPostingPolicyV1.eventType).toBe('manufacturing.production.completed.v1');
    expect(
      manufacturingProductionCompletedPostingPolicyV1.sourceLineDocumentId(
        'a0000000-0000-4000-a000-000000000001',
        'b0000000-0000-4000-a000-000000000002',
      ),
    ).toBe('a0000000-0000-4000-a000-000000000001:wip:b0000000-0000-4000-a000-000000000002');
  });
});
