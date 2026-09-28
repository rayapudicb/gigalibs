import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  presignSeconds: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null = null;
  private readonly bucket: string;
  private readonly presignSeconds: number;

  constructor() {
    const endpoint = process.env['AR_S3_ENDPOINT'] ?? process.env['STORAGE_ENDPOINT'];
    const region = process.env['AR_S3_REGION'] ?? process.env['STORAGE_REGION'] ?? 'us-east-1';
    this.bucket = process.env['AR_S3_BUCKET'] ?? process.env['STORAGE_BUCKET'] ?? 'gigalibs-invoices';
    const accessKeyId = process.env['AR_S3_ACCESS_KEY'] ?? process.env['STORAGE_ACCESS_KEY'];
    const secretAccessKey = process.env['AR_S3_SECRET_KEY'] ?? process.env['STORAGE_SECRET_KEY'];
    const forcePathStyle = (process.env['AR_S3_FORCE_PATH_STYLE'] ?? 'true') === 'true';
    this.presignSeconds = Number(process.env['AR_S3_PRESIGN_SECONDS'] ?? '900');

    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint,
        region,
        forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log(`Initialized S3 storage client for bucket ${this.bucket} at ${endpoint}`);
    } else {
      this.logger.log('S3 storage client not fully configured; operating in database-only storage mode');
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async putPdfObject(input: {
    tenantId: string;
    invoiceId: string;
    renderId: string;
    bytes: Buffer;
    checksumSha256: string;
  }): Promise<string | null> {
    if (!this.client) return null;

    const storageKey = `tenants/${input.tenantId}/invoices/${input.invoiceId}/${input.renderId}.pdf`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: input.bytes,
        ContentType: 'application/pdf',
        ContentLength: input.bytes.byteLength,
        Metadata: {
          'checksum-sha256': input.checksumSha256,
          'tenant-id': input.tenantId,
          'invoice-id': input.invoiceId,
        },
      }),
    );
    return storageKey;
  }

  async getPdfBytes(storageKey: string): Promise<Buffer | null> {
    if (!this.client) return null;

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    if (!response.Body) return null;
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async createDownloadUrl(input: {
    storageKey: string;
    filename: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string } | null> {
    if (!this.client) return null;

    const expiresIn = input.expiresInSeconds ?? this.presignSeconds;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ResponseContentType: 'application/pdf',
      ResponseContentDisposition: `attachment; filename="${input.filename}"`,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { url, expiresAt };
  }
}
