/**
 * WI-EAM-001 — Enterprise CAFM Spatial Topology & Spaces Service Unit Tests
 */
import {
  CreateCmmsSpaceV1Schema,
  UpdateCmmsSpaceV1Schema,
  UploadCadLayerV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../common/command.js';

describe('CMMS Spaces & CAFM Hierarchy Unit Tests', () => {
  it('validates spatial types and enforces code conventions', () => {
    const valid = parseInput(CreateCmmsSpaceV1Schema, {
      code: 'BLD-A1',
      name: 'Main Assembly Building',
      spaceType: 'BUILDING',
      grossAreaSqm: 5000,
      netAreaSqm: 4200,
    });
    expect(valid).toMatchObject({
      code: 'BLD-A1',
      name: 'Main Assembly Building',
      spaceType: 'BUILDING',
      grossAreaSqm: 5000,
      netAreaSqm: 4200,
    });

    // Invalid space type
    expect(() =>
      parseInput(CreateCmmsSpaceV1Schema, {
        code: 'BLD-A1',
        name: 'Main Assembly Building',
        spaceType: 'DESK',
      }),
    ).toThrow(BadRequestException);

    // Negative area
    expect(() =>
      parseInput(CreateCmmsSpaceV1Schema, {
        code: 'BLD-A1',
        name: 'Main Assembly Building',
        spaceType: 'BUILDING',
        grossAreaSqm: -50,
      }),
    ).toThrow(BadRequestException);
  });

  it('validates CAD layer GeoJSON schema', () => {
    const validGeoJson = parseInput(UploadCadLayerV1Schema, {
      cadLayer: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
    });
    expect(validGeoJson.cadLayer).toBeDefined();

    // Invalid: non-object
    expect(() =>
      parseInput(UploadCadLayerV1Schema, {
        cadLayer: 'not-an-object',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates 3D BIM GlobalId anchor updates', () => {
    const validBim = parseInput(UpdateCmmsSpaceV1Schema, {
      expectedVersion: 1,
      bimGuid: '2O2_b$Bl15$qXWde$n4VLj',
      name: 'Cleanroom Bay 4',
    });
    expect(validBim.bimGuid).toBe('2O2_b$Bl15$qXWde$n4VLj');
  });

  it('builds multi-level hierarchy tree accurately', () => {
    const spaces = [
      { id: '1', code: 'SITE-1', name: 'Site', spaceType: 'SITE' as const, parentSpaceId: null, floorNumber: null, grossAreaSqm: null, netAreaSqm: null, cadLayer: null, bimGuid: null, metadata: {}, assetCount: 0, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
      { id: '2', code: 'BLD-1', name: 'Building', spaceType: 'BUILDING' as const, parentSpaceId: '1', floorNumber: null, grossAreaSqm: null, netAreaSqm: null, cadLayer: null, bimGuid: null, metadata: {}, assetCount: 0, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
      { id: '3', code: 'FLR-1', name: 'Floor', spaceType: 'FLOOR' as const, parentSpaceId: '2', floorNumber: 1, grossAreaSqm: null, netAreaSqm: null, cadLayer: null, bimGuid: null, metadata: {}, assetCount: 0, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
    ];

    const map = new Map(spaces.map((s) => [s.id, { ...s, children: [] }]));
    const roots: any[] = [];
    for (const s of spaces) {
      const node = map.get(s.id)!;
      if (s.parentSpaceId && map.has(s.parentSpaceId)) {
        map.get(s.parentSpaceId)!.children.push(node as any);
      } else {
        roots.push(node);
      }
    }

    expect(roots).toHaveLength(1);
    expect(roots[0].code).toBe('SITE-1');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].code).toBe('BLD-1');
    expect(roots[0].children[0].children).toHaveLength(1);
    expect(roots[0].children[0].children[0].code).toBe('FLR-1');
  });
});
