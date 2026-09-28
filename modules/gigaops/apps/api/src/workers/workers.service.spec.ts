import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { WorkersService, MAX_WORKER_SKILL_TAGS } from './workers.service.js';

describe('GigaOps WorkersService', () => {
  let mockDb: any;
  let service: WorkersService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new WorkersService(mockDb);
  });

  it('1. Create returns worker with generated worker_id_ext (GW-XXXXX)', async () => {
    const mockWorker = {
      id: '00000000-0000-0000-0000-000000000001',
      tenant_id: 'tenant-1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      classification_code: 'W2',
      worker_id_ext: 'GW-5A8D39F1',
    };
    mockDb.query.mockResolvedValueOnce({ rows: [mockWorker] });

    const result = await service.create('tenant-1', {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      classificationCode: 'W2',
    });

    expect(result.worker_id_ext).toMatch(/^GW-[0-9A-F]{8}$/);
    expect(result.email).toBe('john.doe@example.com');
  });

  it('2. Add skill tag works', async () => {
    // getById
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'w-1', tenant_id: 'tenant-1' }] });
    // count check
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    // insert
    mockDb.query.mockResolvedValueOnce({
      rows: [{ worker_id: 'w-1', tag_slug: 'forklift' }],
    });

    const skill = await service.addSkill('tenant-1', 'w-1', 'forklift');
    expect(skill.tag_slug).toBe('forklift');
  });

  it('3. Exceeding max skills fails', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'w-1', tenant_id: 'tenant-1' }] });
    // count check exceeds max
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: String(MAX_WORKER_SKILL_TAGS) }] });

    await expect(service.addSkill('tenant-1', 'w-1', 'extra-skill')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('4. Search by email finds worker', async () => {
    const mockWorker = {
      id: 'w-1',
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      worker_id_ext: 'GW-11223344',
    };
    mockDb.query.mockResolvedValueOnce({ rows: [mockWorker] });

    const results = await service.search('tenant-1', 'alice@example.com');
    expect(results.length).toBe(1);
    expect(results[0].email).toBe('alice@example.com');
  });
});
