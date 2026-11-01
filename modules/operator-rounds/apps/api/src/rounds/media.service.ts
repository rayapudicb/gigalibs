import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StageRoundEvidenceV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';

interface MediaRow {
  id:string; actor_subject:string; storage_key:string; sha256:string;
  mime_type:string; byte_size:number; state:string;
  assignment_id:string|null; checkpoint_id:string|null;
}

/** Image bytes live in the configured object store; SQL keeps only verifiable metadata and tenant ownership. */
@Injectable()
export class MediaService {
  private readonly bucket: string | null;
  private readonly s3: S3Client | null;
  private readonly uploadS3: S3Client | null;

  constructor(private readonly database: DatabaseService) {
    const endpoint = process.env['OPERATOR_ROUNDS_MEDIA_ENDPOINT']?.trim();
    const publicEndpoint = process.env['OPERATOR_ROUNDS_MEDIA_PUBLIC_ENDPOINT']?.trim();
    const region = process.env['OPERATOR_ROUNDS_MEDIA_REGION']?.trim();
    const bucket = process.env['OPERATOR_ROUNDS_MEDIA_BUCKET']?.trim();
    const accessKeyId = process.env['OPERATOR_ROUNDS_MEDIA_ACCESS_KEY']?.trim();
    const secretAccessKey = process.env['OPERATOR_ROUNDS_MEDIA_SECRET_KEY']?.trim();
    this.bucket = endpoint && region && bucket && accessKeyId && secretAccessKey ? bucket : null;
    this.s3 = this.bucket ? new S3Client({
      endpoint: endpoint!, region: region!, forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    }) : null;
    let uploadOrigin: string | null = null;
    if (publicEndpoint) {
      try {
        const url = new URL(publicEndpoint);
        if ((url.protocol !== 'https:' &&
             !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) ||
            url.username || url.password || url.pathname !== '/' || url.search || url.hash)
          throw new Error('Invalid public object-store origin.');
        uploadOrigin = url.origin;
      } catch { throw new Error('OPERATOR_ROUNDS_MEDIA_PUBLIC_ENDPOINT must be an HTTPS origin or a loopback HTTP origin.'); }
    }
    this.uploadS3 = this.bucket && uploadOrigin ? new S3Client({
      endpoint: uploadOrigin, region: region!, forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    }) : null;
  }

  private store(): { client:S3Client; bucket:string } {
    if (!this.s3 || !this.bucket)
      throw new ServiceUnavailableException('Rounds media storage is not configured.');
    return { client:this.s3,bucket:this.bucket };
  }

  async stage(context: ModuleCommandContext, input: StageRoundEvidenceV1) {
    const { bucket } = this.store();
    if (!this.uploadS3)
      throw new ServiceUnavailableException('Rounds public media upload origin is not configured.');
    const { tenantId, subject } = context.principal;
    const key = `operator-rounds/${tenantId}/${input.evidenceId}`;
    const row = await this.database.withTenantTransaction(tenantId, async (db) => {
      const scope = await scopeEvaluator(db,context.principal);
      const assignment = (await db.query<{
        id:string; route_id:string; operator_subject:string; owning_unit_id:string|null;
        site_ref:string|null; state:string;
      }>(
        `SELECT id,route_id,operator_subject,owning_unit_id,site_ref,state
         FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND id=$2`,
        [tenantId,input.assignmentId],
      )).rows[0];
      if (!assignment || assignment.operator_subject !== subject ||
          !(await scope.allows('operator-rounds.runs.execute',assignment,true)))
        throw new NotFoundException('Assignment not found.');
      const checkpoint = (await db.query<{id:string}>(
        `SELECT id FROM ${SCHEMA}.checkpoints
         WHERE tenant_id=$1 AND route_id=$2 AND id=$3`,
        [tenantId,assignment.route_id,input.checkpointId],
      )).rows[0];
      if (!checkpoint) throw new NotFoundException('Checkpoint not found in this assignment.');
      const matches = (result: MediaRow) => {
        if (result.actor_subject !== subject || result.sha256 !== input.sha256 ||
            result.mime_type !== input.mimeType || result.byte_size !== input.byteSize ||
            result.assignment_id !== input.assignmentId || result.checkpoint_id !== input.checkpointId)
          throw new ConflictException('Evidence ID was reused with different content or checkpoint.');
      };
      const previous = (await db.query<MediaRow>(
        `SELECT * FROM ${SCHEMA}.media_evidence WHERE tenant_id=$1 AND id=$2`,
        [tenantId,input.evidenceId],
      )).rows[0];
      if (previous) { matches(previous); return previous; }
      if (!['ASSIGNED','STARTED'].includes(assignment.state))
        throw new ConflictException('Assignment is no longer active.');
      const inserted = await db.query<MediaRow>(
        `INSERT INTO ${SCHEMA}.media_evidence
          (id,tenant_id,actor_subject,storage_key,sha256,mime_type,byte_size,state,assignment_id,checkpoint_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'STAGED',$8,$9)
         ON CONFLICT (tenant_id,id) DO NOTHING RETURNING *`,
        [input.evidenceId,tenantId,subject,key,input.sha256,input.mimeType,input.byteSize,
         input.assignmentId,input.checkpointId],
      );
      const result = inserted.rows[0] ?? (await db.query<MediaRow>(
        `SELECT * FROM ${SCHEMA}.media_evidence WHERE tenant_id=$1 AND id=$2`,
        [tenantId,input.evidenceId],
      )).rows[0];
      if (!result) throw new ConflictException('Evidence stage was not persisted.');
      matches(result);
      if (inserted.rows[0]) await recordMutation(db,{schema:SCHEMA,topic:TOPIC},context,{
        action:'EVIDENCE_STAGED',aggregateType:'evidence',aggregateId:input.evidenceId,aggregateVersion:1,
        payload:{assignmentId:input.assignmentId,checkpointId:input.checkpointId,
          mimeType:input.mimeType,byteSize:input.byteSize,sha256:input.sha256},
      });
      return result;
    });
    if (row.state === 'COMMITTED') return { evidenceId:row.id,state:'COMMITTED',uploadUrl:null,expiresAt:null };
    if (row.state !== 'STAGED') throw new ConflictException('Evidence is rejected; stage a new photo.');
    const checksum = Buffer.from(input.sha256,'hex').toString('base64');
    const uploadUrl = await getSignedUrl(this.uploadS3,new PutObjectCommand({
      Bucket:bucket,Key:key,ContentType:input.mimeType,ContentLength:input.byteSize,
      ChecksumSHA256:checksum,ServerSideEncryption:'AES256',
    }),{expiresIn:600});
    return { evidenceId:row.id,state:'STAGED',uploadUrl,uploadMethod:'PUT',
      uploadHeaders:{ 'Content-Type':input.mimeType,'x-amz-checksum-sha256':checksum,
        'x-amz-server-side-encryption':'AES256' },
      expiresAt:new Date(Date.now()+600_000).toISOString() };
  }

  async commit(context: ModuleCommandContext, id: string) {
    const { client, bucket } = this.store();
    const { tenantId, subject } = context.principal;
    const row = await this.database.withTenantTransaction(tenantId, async (db) =>
      (await db.query<MediaRow>(`SELECT * FROM ${SCHEMA}.media_evidence WHERE tenant_id=$1 AND id=$2`,
        [tenantId,id])).rows[0]);
    if (!row || row.actor_subject !== subject) throw new NotFoundException('Evidence not found.');
    if (row.state === 'COMMITTED') return { evidenceId:id,state:'COMMITTED',replayed:true };
    if (row.state !== 'STAGED') throw new ConflictException('Evidence is rejected; stage a new photo.');
    let bytes: Buffer;
    try {
      const result = await client.send(new GetObjectCommand({Bucket:bucket,Key:row.storage_key}));
      if (!result.Body || Number(result.ContentLength) !== Number(row.byte_size) ||
          result.ContentType !== row.mime_type)
        throw new ConflictException('Uploaded evidence metadata does not match the staged file.');
      bytes = Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Uploaded evidence is not yet available; retry commit.');
    }
    if (bytes.byteLength !== Number(row.byte_size) ||
        createHash('sha256').update(bytes).digest('hex') !== row.sha256)
      throw new ConflictException('Uploaded evidence checksum does not match; upload again.');
    return this.database.withTenantTransaction(tenantId, async (db) => {
      const updated = await db.query<MediaRow>(
        `UPDATE ${SCHEMA}.media_evidence SET state='COMMITTED',committed_at=now()
         WHERE tenant_id=$1 AND id=$2 AND state='STAGED' RETURNING *`,[tenantId,id],
      );
      if (!updated.rows[0]) {
        const current=(await db.query<Pick<MediaRow,'state'>>(
          `SELECT state FROM ${SCHEMA}.media_evidence WHERE tenant_id=$1 AND id=$2`,
          [tenantId,id],
        )).rows[0];
        if (current?.state !== 'COMMITTED')
          throw new ConflictException('Evidence was rejected or removed during commit.');
        return { evidenceId:id,state:'COMMITTED',replayed:true };
      }
      await recordMutation(db,{schema:SCHEMA,topic:TOPIC},context,{
        action:'EVIDENCE_COMMITTED',aggregateType:'evidence',aggregateId:id,aggregateVersion:2,
        payload:{mimeType:row.mime_type,byteSize:row.byte_size,sha256:row.sha256},
      });
      return { evidenceId:id,state:'COMMITTED',replayed:false };
    });
  }
}
