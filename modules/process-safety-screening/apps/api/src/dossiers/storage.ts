import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ServiceUnavailableException } from '@nestjs/common';

// WI-OI-120ca (SPEED S7; plan v1.4 §2.1, the pattern of AR's storage service): SPEED's dossier files in the instance's
// S3-compatible object store. There is no fallback: without the store configured, no dossier is generated (503).

export interface SpeedStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
}

/** The store's settings from `SPEED_STORAGE_*`, or null when any is missing (the store is then off). */
export function storageConfigFromEnv(env: NodeJS.ProcessEnv): SpeedStorageConfig | null {
  const value = (name: string) => env[`SPEED_STORAGE_${name}`]?.trim() || null;
  const endpoint = value('ENDPOINT');
  const region = value('REGION');
  const bucket = value('BUCKET');
  const accessKeyId = value('ACCESS_KEY');
  const secretAccessKey = value('SECRET_KEY');
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: value('FORCE_PATH_STYLE') !== 'false',
  };
}

/** The object store, or "not configured": then generation answers 503 and the worker stays idle. */
export class SpeedStorage {
  private readonly store: { readonly client: S3Client; readonly bucket: string } | null;

  constructor(config: SpeedStorageConfig | null) {
    this.store = config
      ? {
          bucket: config.bucket,
          client: new S3Client({
            endpoint: config.endpoint,
            region: config.region,
            forcePathStyle: config.forcePathStyle,
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }),
        }
      : null;
  }

  get available(): boolean {
    return this.store !== null;
  }

  async put(key: string, bytes: Buffer, contentType: string, sha256: string): Promise<void> {
    const { client, bucket } = this.configured();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.byteLength,
        Metadata: { 'checksum-sha256': sha256 },
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const { client, bucket } = this.configured();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new Error('The stored object has no body.');
    return Buffer.from(await object.Body.transformToByteArray());
  }

  private configured(): { readonly client: S3Client; readonly bucket: string } {
    if (this.store) return this.store;
    throw new ServiceUnavailableException({
      code: 'SPEED_STORAGE_UNAVAILABLE',
      message:
        'The object store is not configured on this instance, so dossiers cannot be generated.',
    });
  }
}
