import { Injectable } from '@nestjs/common';
import { generateId } from '@gigalibs/crypto';
import type { UploadResult, StorageUploadOptions } from '@gigalibs/storage-core';

@Injectable()
export class StorageService {
  private endpoint = process.env['STORAGE_ENDPOINT'] ?? 'http://localhost:9000';
  private bucket = process.env['STORAGE_BUCKET'] ?? 'gigalibs-dev';

  async upload(
    filename: string,
    buffer: Buffer,
    options?: StorageUploadOptions,
  ): Promise<UploadResult> {
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const key = `${generateId()}${ext ? `.${ext}` : ''}`;
    const contentType = options?.contentType ?? 'application/octet-stream';
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    return {
      key,
      url,
      size: buffer.length,
      contentType,
    };
  }

  async getPresignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }
}
