/**
 * @gigalibs/integration-minio
 *
 * MinIO self-hosted high performance S3-compatible storage adapter.
 *
 * @module
 */

export interface MinioConfig {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export class MinioAdapter {
  constructor(private readonly config: MinioConfig) {}

  async getPresignedUrl(key: string): Promise<string> {
    const protocol = this.config.useSSL ? 'https' : 'http';
    const port = this.config.port ? `:${this.config.port}` : '';
    return `${protocol}://${this.config.endPoint}${port}/${this.config.bucket}/${key}`;
  }
}
