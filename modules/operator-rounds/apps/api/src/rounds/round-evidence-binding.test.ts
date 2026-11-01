import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertRoundEvidenceAvailable } from './runs.service.js';

const tenant='tenant-a';
const evidence='10000000-0000-4000-8000-000000000001';
const assignment='10000000-0000-4000-8000-000000000002';
const checkpoint='10000000-0000-4000-8000-000000000003';
const committed={actor_subject:'operator-a',state:'COMMITTED',
  assignment_id:assignment,checkpoint_id:checkpoint};

function clientFor(media:typeof committed|null,used=false) {
  const query=vi.fn(async (sql:string) => ({rows:sql.includes('media_evidence')
    ? (media ? [media] : []) : (used ? [{id:'reading-id'}] : [])}));
  return {query};
}

describe('round evidence binding',() => {
  it('accepts one committed photo from the same operator, assignment and checkpoint',async () => {
    const client=clientFor(committed);
    await expect(assertRoundEvidenceAvailable(client as never,tenant,evidence,
      'operator-a',assignment,checkpoint)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['another operator',{...committed,actor_subject:'operator-b'},assignment,checkpoint],
    ['another assignment',committed,'10000000-0000-4000-8000-000000000004',checkpoint],
    ['another checkpoint',committed,assignment,'10000000-0000-4000-8000-000000000005'],
    ['an unbound legacy upload',{...committed,assignment_id:null,checkpoint_id:null},assignment,checkpoint],
    ['an uncommitted upload',{...committed,state:'STAGED'},assignment,checkpoint],
  ])('refuses %s',async (_name,media,assigned,point) => {
    const client=clientFor(media);
    await expect(assertRoundEvidenceAvailable(client as never,tenant,evidence,
      'operator-a',assigned,point)).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('refuses reuse after the photo is attached to another reading',async () => {
    const client=clientFor(committed,true);
    await expect(assertRoundEvidenceAvailable(client as never,tenant,evidence,
      'operator-a',assignment,checkpoint)).rejects.toBeInstanceOf(ConflictException);
  });
});
