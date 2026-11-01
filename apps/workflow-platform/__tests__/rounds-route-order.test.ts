import type { RoundCheckpointDraftV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { reorderRoundCheckpoints } from '../../../modules/operator-rounds/web/src/route-order';

const point = (position:number,label:string,branchTo?:number):RoundCheckpointDraftV1 => ({
  position,label,assetRef:'10000000-0000-4000-8000-000000000001',meterRef:null,
  tagCode:label,proofMode:'BARCODE',readingKind:'BOOLEAN',unitCode:null,nominal:null,
  amberLow:null,amberHigh:null,redLow:null,redHigh:null,choices:[],instructions:null,
  photoOnException:false,
  branchRules:branchTo ? [{condition:'ALWAYS',nextPosition:branchTo}] : [],
});

describe('Operator Rounds route reorder', () => {
  it('keeps a conditional path aimed at the same checkpoint after moving an intermediate point', () => {
    const initial=[point(10,'Inspection',30),point(20,'Optional oil'),point(30,'Pressure')];
    const reordered=reorderRoundCheckpoints(initial,1,2);
    expect(reordered.map((item) => item.label)).toEqual(['Inspection','Pressure','Optional oil']);
    expect(reordered[0]?.branchRules[0]?.nextPosition).toBe(2);
    expect(initial[0]?.branchRules[0]?.nextPosition).toBe(30);
  });

  it('refuses a drag that would make a published forward branch point backward', () => {
    const initial=[point(1,'Inspection',3),point(2,'Oil'),point(3,'Pressure')];
    expect(() => reorderRoundCheckpoints(initial,2,0)).toThrow('branch go backward');
    expect(initial.map((item) => item.position)).toEqual([1,2,3]);
  });
});
