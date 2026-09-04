import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConnectorFailure } from './connector-errors.js';
import { runtimeConfig } from './config/runtime-config.js';

@Injectable()
export class ObjectStorageService {
  private readonly client = new S3Client({
    endpoint: runtimeConfig.storageEndpoint,
    region: runtimeConfig.storageRegion,
    forcePathStyle: runtimeConfig.storageForcePathStyle,
    credentials: {
      accessKeyId: runtimeConfig.storageAccessKey,
      secretAccessKey: runtimeConfig.storageSecretKey,
    },
  });

  async testBucket(): Promise<{ latencyMs: number }> {
    const startedAt = performance.now();
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: runtimeConfig.storageBucket }));
      return { latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    } catch {
      throw new ConnectorFailure(
        'OBJECT_STORAGE_UNAVAILABLE',
        'The configured object-storage bucket is unavailable.',
      );
    }
  }

  async createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    byteSize: number;
    checksumSha256: string;
  }): Promise<{ uploadUrl: string; expiresAt: Date; requiredHeaders: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: runtimeConfig.storageBucket,
      Key: input.storageKey,
      ContentType: input.contentType,
      ContentLength: input.byteSize,
      Metadata: { 'declared-sha256': input.checksumSha256 },
    });
    try {
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: runtimeConfig.storagePresignSeconds,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-meta-declared-sha256']),
      });
      return {
        uploadUrl,
        expiresAt: new Date(Date.now() + runtimeConfig.storagePresignSeconds * 1_000),
        requiredHeaders: {
          'content-type': input.contentType,
          'x-amz-meta-declared-sha256': input.checksumSha256,
        },
      };
    } catch {
      throw new ConnectorFailure(
        'OBJECT_STORAGE_SIGNING_FAILED',
        'The upload URL could not be created.',
      );
    }
  }

  async readVerifiedObject(input: {
    storageKey: string;
    contentType: string;
    byteSize: number;
    checksumSha256: string;
  }): Promise<Buffer> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: runtimeConfig.storageBucket, Key: input.storageKey }),
      );
      if (head.ContentLength !== input.byteSize) {
        throw new ConnectorFailure(
          'FILE_SIZE_MISMATCH',
          'The uploaded object size does not match the declared size.',
        );
      }
      const actualContentType = head.ContentType?.split(';', 1)[0]?.trim().toLowerCase();
      if (actualContentType !== input.contentType) {
        throw new ConnectorFailure(
          'FILE_CONTENT_TYPE_MISMATCH',
          'The uploaded object content type does not match the declared type.',
        );
      }
      if (head.Metadata?.['declared-sha256'] !== input.checksumSha256) {
        throw new ConnectorFailure(
          'FILE_UPLOAD_METADATA_MISMATCH',
          'The uploaded object does not contain the signed checksum metadata.',
        );
      }
      if (!head.ContentLength || head.ContentLength > runtimeConfig.storageMaxFileBytes) {
        throw new ConnectorFailure(
          'FILE_SIZE_LIMIT_EXCEEDED',
          'The uploaded object exceeds the deployment file-size policy.',
        );
      }
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: runtimeConfig.storageBucket, Key: input.storageKey }),
      );
      if (!response.Body) {
        throw new ConnectorFailure('FILE_OBJECT_EMPTY', 'The uploaded object has no readable body.');
      }
      const bytes = Buffer.from(await response.Body.transformToByteArray());
      if (bytes.length !== input.byteSize) {
        throw new ConnectorFailure(
          'FILE_SIZE_MISMATCH',
          'The downloaded object size does not match the declared size.',
        );
      }
      return bytes;
    } catch (error) {
      if (error instanceof ConnectorFailure) throw error;
      throw new ConnectorFailure(
        'FILE_OBJECT_UNAVAILABLE',
        'The uploaded object is unavailable or could not be read.',
      );
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: runtimeConfig.storageBucket, Key: storageKey }),
      );
    } catch {
      throw new ConnectorFailure(
        'FILE_OBJECT_DELETE_FAILED',
        'The temporary source object could not be removed.',
      );
    }
  }
}
