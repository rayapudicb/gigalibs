/**
 * WI-EAM-002 — Technical Asset Engineering Taxonomy, Specs & Cascading Unit Tests
 */
import {
  CreateCmmsClassificationV1Schema,
  CreateCmmsSpecDefinitionV1Schema,
  SetCmmsAssetSpecsV1Schema,
  UpdateCmmsClassificationV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../common/command.js';

describe('CMMS Classifications & Engineering Specifications Unit Tests', () => {
  it('validates classification creation input', () => {
    const valid = parseInput(CreateCmmsClassificationV1Schema, {
      code: 'ROTATING_TURBINE',
      name: 'Industrial Gas Turbine',
      description: 'Heavy frame rotating power generation turbines',
      parentClassId: null,
    });
    expect(valid).toMatchObject({
      code: 'ROTATING_TURBINE',
      name: 'Industrial Gas Turbine',
      description: 'Heavy frame rotating power generation turbines',
      parentClassId: null,
    });

    // Invalid: empty code
    expect(() =>
      parseInput(CreateCmmsClassificationV1Schema, {
        code: '',
        name: 'Invalid',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates classification update input with expectedVersion', () => {
    const valid = parseInput(UpdateCmmsClassificationV1Schema, {
      expectedVersion: 2,
      name: 'Aeroderivative Gas Turbine',
    });
    expect(valid.expectedVersion).toBe(2);
    expect(valid.name).toBe('Aeroderivative Gas Turbine');

    // Invalid: missing expectedVersion
    expect(() =>
      parseInput(UpdateCmmsClassificationV1Schema, {
        name: 'Aeroderivative Gas Turbine',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates spec definition data types and attribute key format', () => {
    const validNumSpec = parseInput(CreateCmmsSpecDefinitionV1Schema, {
      classificationId: '11111111-1111-4111-8111-111111111111',
      attributeKey: 'operating_power_mw',
      label: 'Rated Output Power',
      dataType: 'NUMBER',
      uom: 'MW',
      required: true,
      minValue: 0,
      maxValue: 1000,
    });
    expect(validNumSpec.attributeKey).toBe('operating_power_mw');
    expect(validNumSpec.dataType).toBe('NUMBER');
    expect(validNumSpec.minValue).toBe(0);
    expect(validNumSpec.maxValue).toBe(1000);

    // Invalid attribute key: starts with uppercase or number or special character
    expect(() =>
      parseInput(CreateCmmsSpecDefinitionV1Schema, {
        classificationId: '11111111-1111-4111-8111-111111111111',
        attributeKey: 'Operating-Power!',
        label: 'Rated Output Power',
        dataType: 'NUMBER',
      }),
    ).toThrow(BadRequestException);

    // Invalid dataType
    expect(() =>
      parseInput(CreateCmmsSpecDefinitionV1Schema, {
        classificationId: '11111111-1111-4111-8111-111111111111',
        attributeKey: 'power',
        label: 'Power',
        dataType: 'INVALID_TYPE',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates asset spec values input schema', () => {
    const validSpecs = parseInput(SetCmmsAssetSpecsV1Schema, {
      specs: [
        {
          specDefinitionId: '22222222-2222-4222-8222-222222222222',
          valueNumber: 45.5,
        },
        {
          specDefinitionId: '33333333-3333-4333-8333-333333333333',
          valueText: 'SYNTHETIC_ISO_VG_46',
        },
        {
          specDefinitionId: '44444444-4444-4444-8444-444444444444',
          valueBoolean: true,
        },
      ],
    });
    expect(validSpecs.specs).toHaveLength(3);
    expect(validSpecs.specs[0].valueNumber).toBe(45.5);
    expect(validSpecs.specs[1].valueText).toBe('SYNTHETIC_ISO_VG_46');
    expect(validSpecs.specs[2].valueBoolean).toBe(true);
  });

  it('correctly constructs nested classification trees', () => {
    const classifications = [
      { id: '1', code: 'EQUIP', name: 'Equipment', description: null, parentClassId: null, specCount: 0, assetCount: 0, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
      { id: '2', code: 'ROTATING', name: 'Rotating Equipment', description: null, parentClassId: '1', specCount: 1, assetCount: 2, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
      { id: '3', code: 'TURBINE', name: 'Gas Turbines', description: null, parentClassId: '2', specCount: 4, assetCount: 5, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
      { id: '4', code: 'STATIC', name: 'Static Vessels', description: null, parentClassId: '1', specCount: 2, assetCount: 1, version: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
    ];

    const map = new Map(classifications.map((c) => [c.id, { ...c, children: [] as any[] }]));
    const roots: any[] = [];
    for (const c of classifications) {
      const node = map.get(c.id)!;
      if (c.parentClassId && map.has(c.parentClassId)) {
        map.get(c.parentClassId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    expect(roots).toHaveLength(1);
    expect(roots[0].code).toBe('EQUIP');
    expect(roots[0].children).toHaveLength(2);
    expect(roots[0].children[0].code).toBe('ROTATING');
    expect(roots[0].children[0].children).toHaveLength(1);
    expect(roots[0].children[0].children[0].code).toBe('TURBINE');
    expect(roots[0].children[1].code).toBe('STATIC');
  });

  it('correctly constructs multi-level equipment hierarchy tree', () => {
    const nodes = [
      { id: 'sys1', assetTag: 'TURBINE-SYS-01', name: 'Gas Turbine Train A', category: 'TURBINE', status: 'OPERATIONAL' as const, criticality: 'CRITICAL' as const, classificationId: 'cls1', classificationName: 'Gas Turbine System', spaceId: 'spc1', parentAssetId: null },
      { id: 'sub1', assetTag: 'ROTOR-01', name: 'Turbine Rotor Core', category: 'ROTOR', status: 'OPERATIONAL' as const, criticality: 'HIGH' as const, classificationId: 'cls2', classificationName: 'Rotor Assembly', spaceId: 'spc1', parentAssetId: 'sys1' },
      { id: 'cmp1', assetTag: 'BEARING-FWD', name: 'Forward Thrust Bearing', category: 'BEARING', status: 'OPERATIONAL' as const, criticality: 'HIGH' as const, classificationId: 'cls3', classificationName: 'Journal Bearing', spaceId: 'spc1', parentAssetId: 'sub1' },
    ];

    const nodeMap = new Map(
      nodes.map((n) => [
        n.id,
        {
          id: n.id,
          assetTag: n.assetTag,
          name: n.name,
          category: n.category,
          status: n.status,
          criticality: n.criticality,
          classificationId: n.classificationId,
          classificationName: n.classificationName,
          spaceId: n.spaceId,
          children: [] as any[],
        },
      ]),
    );

    const root = nodeMap.get('sys1')!;
    for (const n of nodes) {
      if (n.parentAssetId && nodeMap.has(n.parentAssetId)) {
        nodeMap.get(n.parentAssetId)!.children.push(nodeMap.get(n.id)!);
      }
    }

    expect(root.assetTag).toBe('TURBINE-SYS-01');
    expect(root.children).toHaveLength(1);
    expect(root.children[0].assetTag).toBe('ROTOR-01');
    expect(root.children[0].children).toHaveLength(1);
    expect(root.children[0].children[0].assetTag).toBe('BEARING-FWD');
  });
});
