import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export interface PresignedUploadRequest {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}

export interface PresignedUpload {
  url: string;
  key: string;
  requiredHeaders: Record<string, string>;
  expiresAt: Date;
}

export class S3Adapter {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    if (!config.region.trim()) throw new Error('S3 region is required.');
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) {
      throw new Error('S3 bucket name is invalid.');
    }
    if ((config.accessKeyId && !config.secretAccessKey) || (!config.accessKeyId && config.secretAccessKey)) {
      throw new Error('S3 access key ID and secret access key must be configured together.');
    }
    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
          }
        : undefined;
    const clientConfig: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? false,
      ...(config.endpoint ? { endpoint: this.validateEndpoint(config.endpoint) } : {}),
      ...(credentials ? { credentials } : {}),
    };
    this.client = new S3Client(clientConfig);
  }

  async assertBucketAccess(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  async getPresignedUploadUrl(request: PresignedUploadRequest): Promise<PresignedUpload> {
    const key = this.validateKey(request.key);
    const contentType = this.validateContentType(request.contentType);
    if (!Number.isSafeInteger(request.contentLength) || request.contentLength < 1) {
      throw new Error('S3 upload content length must be a positive integer.');
    }
    const expiresInSeconds = this.validateExpiry(request.expiresInSeconds ?? 900);
    const metadata = this.validateMetadata(request.metadata ?? {});
    const metadataHeaders = Object.fromEntries(
      Object.entries(metadata).map(([name, value]) => [`x-amz-meta-${name}`, value]),
    );
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: request.contentLength,
      Metadata: metadata,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type']),
      unhoistableHeaders: new Set(Object.keys(metadataHeaders)),
    });
    return {
      url,
      key,
      requiredHeaders: { 'content-type': contentType, ...metadataHeaders },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: this.validateKey(key) }),
      { expiresIn: this.validateExpiry(expiresInSeconds) },
    );
  }

  async headObject(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.validateKey(key) }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.validateKey(key) }),
    );
  }

  private validateKey(value: string): string {
    const key = value.trim();
    if (
      !key ||
      key.length > 1_024 ||
      key.startsWith('/') ||
      key.includes('\\') ||
      key.split('/').some((part) => !part || part === '.' || part === '..') ||
      /[\u0000-\u001f\u007f]/.test(key)
    ) {
      throw new Error('S3 object key is invalid.');
    }
    return key;
  }

  private validateContentType(value: string): string {
    const contentType = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(contentType)) {
      throw new Error('S3 content type is invalid.');
    }
    return contentType;
  }

  private validateMetadata(metadata: Record<string, string>): Record<string, string> {
    if (Object.keys(metadata).length > 32) throw new Error('S3 metadata has too many fields.');
    return Object.fromEntries(
      Object.entries(metadata).map(([rawName, rawValue]) => {
        const name = rawName.trim().toLowerCase();
        const value = rawValue.trim();
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name) || !value || value.length > 1_024) {
          throw new Error('S3 metadata is invalid.');
        }
        return [name, value];
      }),
    );
  }

  private validateExpiry(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 3_600) {
      throw new Error('S3 signed URL expiry must be between 1 and 3600 seconds.');
    }
    return value;
  }

  private validateEndpoint(value: string): string {
    const endpoint = new URL(value);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('S3 endpoint must be an HTTP(S) URL without embedded credentials.');
    }
    return endpoint.toString().replace(/\/$/, '');
  }
}
