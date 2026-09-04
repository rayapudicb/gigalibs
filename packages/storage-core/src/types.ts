export interface StorageUploadOptions {
  bucket?: string;
  contentType?: string;
  isPublic?: boolean;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  upload(key: string, data: Buffer | Uint8Array, options?: StorageUploadOptions): Promise<UploadResult>;
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
