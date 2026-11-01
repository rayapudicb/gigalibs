import { createHash, randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service.js';

const evidenceId = randomUUID();
const assignmentId = randomUUID();
const checkpointId = randomUUID();
const context = { principal: { tenantId: 'tenant-a', subject: 'operator-a' } } as never;
const input = { evidenceId, assignmentId, checkpointId,
  sha256: 'a'.repeat(64), mimeType: 'image/jpeg' as const, byteSize: 1024 };

vi.mock('../organization.js',() => ({ scopeEvaluator:vi.fn(async () => ({ allows:async () => true })) }));

function configure(publicEndpoint: string) {
  vi.stubEnv('OPERATOR_ROUNDS_MEDIA_ENDPOINT','http://minio:9000');
  vi.stubEnv('OPERATOR_ROUNDS_MEDIA_PUBLIC_ENDPOINT',publicEndpoint);
  vi.stubEnv('OPERATOR_ROUNDS_MEDIA_REGION','us-east-1');
  vi.stubEnv('OPERATOR_ROUNDS_MEDIA_BUCKET','rounds-evidence');
  vi.stubEnv('OPERATOR_ROUNDS_MEDIA_ACCESS_KEY','test-access');
  vi.stubEnv('OPERATOR_ROUNDS_MEDIA_SECRET_KEY','test-secret');
}

afterEach(() => { vi.unstubAllEnvs();vi.restoreAllMocks(); });

describe('Rounds evidence public upload origin', () => {
  it('refuses staging if a physical device has no configured upload origin',async () => {
    configure('');
    const service = new MediaService({} as never);
    await expect(service.stage(context,input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('signs the public origin while keeping the internal object-store address private',async () => {
    configure('https://uploads.example.test');
    const row = { id:evidenceId, actor_subject:'operator-a', storage_key:`operator-rounds/tenant-a/${evidenceId}`,
      sha256:input.sha256,mime_type:input.mimeType,byte_size:input.byteSize,state:'STAGED',
      assignment_id:assignmentId,checkpoint_id:checkpointId };
    const client = { query:vi.fn(async (sql:string) => ({ rows: sql.includes('FROM gigalibs_operator_rounds.assignments')
      ? [{ id:assignmentId,route_id:randomUUID(),operator_subject:'operator-a',owning_unit_id:null,
        site_ref:null,state:'ASSIGNED' }]
      : sql.includes('FROM gigalibs_operator_rounds.checkpoints') ? [{id:checkpointId}]
        : sql.includes('INSERT INTO') ? [] : [row] })) };
    const database = { withTenantTransaction:vi.fn(async (_tenant:string,run:(db:typeof client)=>Promise<unknown>) => run(client)) };
    const service = new MediaService(database as never);
    const stage = await service.stage(context,input);
    expect(new URL(stage.uploadUrl! ).origin).toBe('https://uploads.example.test');
    expect(stage.uploadUrl).not.toContain('minio');
    expect(stage.uploadHeaders['x-amz-checksum-sha256']).toBeDefined();
  });

  it('refuses evidence staging for an assignment owned by another operator',async () => {
    configure('https://uploads.example.test');
    const client = {query:vi.fn(async () => ({rows:[{
      id:assignmentId,route_id:randomUUID(),operator_subject:'other-operator',
      owning_unit_id:null,site_ref:null,state:'ASSIGNED',
    }]}))};
    const database = {withTenantTransaction:vi.fn(async (_tenant:string,
      run:(db:typeof client)=>Promise<unknown>) => run(client))};
    const service = new MediaService(database as never);
    await expect(service.stage(context,input)).rejects.toBeInstanceOf(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('refuses reuse of an evidence ID for another checkpoint',async () => {
    configure('https://uploads.example.test');
    const routeId = randomUUID();
    const client = {query:vi.fn(async (sql:string) => ({rows:
      sql.includes('FROM gigalibs_operator_rounds.assignments')
        ? [{id:assignmentId,route_id:routeId,operator_subject:'operator-a',
          owning_unit_id:null,site_ref:null,state:'ASSIGNED'}]
        : sql.includes('FROM gigalibs_operator_rounds.checkpoints') ? [{id:checkpointId}]
          : sql.includes('INSERT INTO') ? [] : [{id:evidenceId,actor_subject:'operator-a',
            sha256:input.sha256,mime_type:input.mimeType,byte_size:input.byteSize,
            assignment_id:assignmentId,checkpoint_id:randomUUID(),state:'STAGED'}],
    }))};
    const database = {withTenantTransaction:vi.fn(async (_tenant:string,
      run:(db:typeof client)=>Promise<unknown>) => run(client))};
    const service = new MediaService(database as never);
    await expect(service.stage(context,input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an exact committed retry after assignment closure but refuses a new photo',async () => {
    configure('https://uploads.example.test');
    const committed={id:evidenceId,actor_subject:'operator-a',sha256:input.sha256,
      mime_type:input.mimeType,byte_size:input.byteSize,assignment_id:assignmentId,
      checkpoint_id:checkpointId,state:'COMMITTED'};
    let existing=true;
    const client={query:vi.fn(async (sql:string) => ({rows:
      sql.includes('FROM gigalibs_operator_rounds.assignments')
        ? [{id:assignmentId,route_id:randomUUID(),operator_subject:'operator-a',
          owning_unit_id:null,site_ref:null,state:'COMPLETED'}]
        : sql.includes('FROM gigalibs_operator_rounds.checkpoints') ? [{id:checkpointId}]
          : existing ? [committed] : [],
    }))};
    const database={withTenantTransaction:vi.fn(async (_tenant:string,
      run:(db:typeof client)=>Promise<unknown>) => run(client))};
    const service=new MediaService(database as never);
    await expect(service.stage(context,input)).resolves.toMatchObject({state:'COMMITTED'});
    existing=false;
    await expect(service.stage(context,{...input,evidenceId:randomUUID()}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });

  it('never signs or commits a rejected upload as if it were ready',async () => {
    configure('https://uploads.example.test');
    const rejected={id:evidenceId,actor_subject:'operator-a',sha256:input.sha256,
      mime_type:input.mimeType,byte_size:input.byteSize,assignment_id:assignmentId,
      checkpoint_id:checkpointId,state:'REJECTED'};
    const client={query:vi.fn(async (sql:string) => ({rows:
      sql.includes('FROM gigalibs_operator_rounds.assignments')
        ? [{id:assignmentId,route_id:randomUUID(),operator_subject:'operator-a',
          owning_unit_id:null,site_ref:null,state:'ASSIGNED'}]
        : sql.includes('FROM gigalibs_operator_rounds.checkpoints') ? [{id:checkpointId}]
          : [rejected],
    }))};
    const database={withTenantTransaction:vi.fn(async (_tenant:string,
      run:(db:typeof client)=>Promise<unknown>) => run(client))};
    const service=new MediaService(database as never);
    await expect(service.stage(context,input)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.commit(context,evidenceId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a commit race when the staged row is rejected before the update',async () => {
    configure('https://uploads.example.test');
    const bytes=Buffer.alloc(1024,7);
    const row={id:evidenceId,actor_subject:'operator-a',storage_key:'evidence-proof/one',
      sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/jpeg',
      byte_size:bytes.byteLength,state:'STAGED',assignment_id:assignmentId,checkpoint_id:checkpointId};
    vi.spyOn(S3Client.prototype,'send').mockResolvedValue({
      ContentLength:bytes.byteLength,ContentType:'image/jpeg',
      Body:{transformToByteArray:async () => new Uint8Array(bytes)},
    } as never);
    const client={query:vi.fn(async (sql:string) => ({rows:
      sql.includes('UPDATE gigalibs_operator_rounds.media_evidence') ? []
        : sql.includes('SELECT state FROM gigalibs_operator_rounds.media_evidence')
          ? [{state:'REJECTED'}] : [row],
    }))};
    const database={withTenantTransaction:vi.fn(async (_tenant:string,
      run:(db:typeof client)=>Promise<unknown>) => run(client))};
    const service=new MediaService(database as never);
    await expect(service.commit(context,evidenceId)).rejects.toBeInstanceOf(ConflictException);
  });
});
