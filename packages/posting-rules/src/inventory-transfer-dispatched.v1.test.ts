import { describe, expect, it } from 'vitest';
import { inventoryTransferDispatchedPostingPolicyV1 } from './inventory-transfer-dispatched.v1.js';

describe('inventoryTransferDispatchedPostingPolicyV1', () => {
  it('names the dispatch event and stable line document ids', () => {
    expect(inventoryTransferDispatchedPostingPolicyV1.eventType).toBe('inventory.transfer.dispatched.v1');
    expect(
      inventoryTransferDispatchedPostingPolicyV1.sourceLineDocumentId(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).toBe('11111111-1111-4111-8111-111111111111:dispatch:22222222-2222-4222-8222-222222222222');
  });
});
