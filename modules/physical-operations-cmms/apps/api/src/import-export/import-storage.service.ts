import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignUploadResult } from './types.js';

const UPLOAD_URL_TTL_SECONDS = 15 * 60; // 15 min
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60; // 1 hr
const PART_SIZE = 5 * 1024 * 1024; // 5 MB minimum S3 multipart part size

@Injectable()
export class ImportStorageService {
  private readonly logger = new Logger(ImportStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor() {
    const region = process.env['AWS_REGION'] ?? 'us-east-1';
    const bucket = process.env['CMMS_S3_BUCKET'];
    if (!bucket) throw new Error('CMMS_S3_BUCKET env var is required');

    this.bucket = bucket;
    this.keyPrefix = process.env['CMMS_S3_KEY_PREFIX'] ?? 'cmms/import-export';
    this.s3 = new S3Client({ region });
  }

  // ─── Presigned upload URL ─────────────────────────────────────────────────

  async createPresignedUpload(
    tenantId: string,
    jobId: string,
    filename: string,
  ): Promise<PresignUploadResult> {
    const s3Key = this.buildImportKey(tenantId, jobId, filename);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ServerSideEncryption: 'AES256',
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString();

    return { jobId, uploadUrl, uploadMethod: 'PUT', expiresAt };
  }

  // ─── Presigned download URL ───────────────────────────────────────────────

  async createPresignedDownload(s3Key: string): Promise<{ downloadUrl: string; expiresAt: string }> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    const downloadUrl = await getSignedUrl(this.s3, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString();
    return { downloadUrl, expiresAt };
  }

  // ─── Download from S3 to Readable ────────────────────────────────────────

  async downloadAsStream(s3Key: string): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    const response = await this.s3.send(command);
    if (!response.Body) throw new Error(`S3 object ${s3Key} has no body`);
    // AWS SDK v3 returns Body as a Readable-compatible stream
    return response.Body as unknown as Readable;
  }

  // ─── Multipart upload for export ─────────────────────────────────────────

  async startMultipartUpload(s3Key: string): Promise<string> {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ServerSideEncryption: 'AES256',
    });
    const { UploadId } = await this.s3.send(cmd);
    if (!UploadId) throw new Error('S3 CreateMultipartUpload returned no UploadId');
    return UploadId;
  }

  async uploadPart(
    s3Key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<{ PartNumber: number; ETag: string }> {
    const cmd = new UploadPartCommand({
      Bucket: this.bucket,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
      ContentLength: body.byteLength,
    });
    const { ETag } = await this.s3.send(cmd);
    if (!ETag) throw new Error(`UploadPart ${partNumber} returned no ETag`);
    return { PartNumber: partNumber, ETag };
  }

  async completeMultipartUpload(
    s3Key: string,
    uploadId: string,
    parts: Array<{ PartNumber: number; ETag: string }>,
  ): Promise<void> {
    const cmd = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    await this.s3.send(cmd);
  }

  async abortMultipartUpload(s3Key: string, uploadId: string): Promise<void> {
    try {
      await this.s3.send(
        new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: s3Key, UploadId: uploadId }),
      );
    } catch (err) {
      this.logger.warn(`Failed to abort multipart upload ${uploadId}: ${String(err)}`);
    }
  }

  // ─── Key builders ─────────────────────────────────────────────────────────

  buildImportKey(tenantId: string, jobId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.keyPrefix}/${tenantId}/imports/${jobId}/${safe}`;
  }

  buildExportKey(tenantId: string, jobId: string, entityType: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${this.keyPrefix}/${tenantId}/exports/${jobId}/${entityType}_${ts}.xlsx`;
  }

  buildErrorReportKey(tenantId: string, jobId: string): string {
    return `${this.keyPrefix}/${tenantId}/imports/${jobId}/error_report.xlsx`;
  }

  get partSize(): number {
    return PART_SIZE;
  }
}
