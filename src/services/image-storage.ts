import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { AppError } from '../middlewares/error';

export interface ImageStorage {
  save(file: Express.Multer.File): Promise<{ key: string; url: string }>;
  remove(key: string): Promise<void>;
}

const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const contentTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function resolveExtension(mimetype: string): string {
  const extension = extensionByMime[mimetype];
  if (!extension) throw new AppError(400, 'Only JPEG, PNG, WebP and GIF images are allowed');
  return extension;
}

function assertSafeKey(key: string) {
  const safeKey = path.basename(key);
  if (safeKey !== key || !/^[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(key)) {
    throw new AppError(400, 'Invalid image key');
  }
}

export class LocalImageStorage implements ImageStorage {
  private readonly directory = path.resolve(process.cwd(), 'public', 'assets');

  async save(file: Express.Multer.File) {
    const extension = resolveExtension(file.mimetype);
    await mkdir(this.directory, { recursive: true });
    const key = randomUUID() + extension;
    await writeFile(path.join(this.directory, key), file.buffer);
    return { key, url: env.PUBLIC_BASE_URL.replace(/\/$/, '') + '/assets/' + key };
  }

  async remove(key: string) {
    assertSafeKey(key);
    try {
      await unlink(path.join(this.directory, path.basename(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function resolveR2Endpoint(): string {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT.replace(/\/$/, '');
  if (!env.R2_ACCOUNT_ID) {
    throw new AppError(500, 'R2 storage is not configured (missing R2_ENDPOINT or R2_ACCOUNT_ID)');
  }
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

export class R2ImageStorage implements ImageStorage {
  private readonly client: S3Client;
  private readonly bucket = env.R2_BUCKET;
  private readonly publicBaseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');

  constructor() {
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      throw new AppError(500, 'R2 storage is not configured (missing R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)');
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: resolveR2Endpoint(),
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
      },
      forcePathStyle: false
    });
  }

  async save(file: Express.Multer.File) {
    const extension = resolveExtension(file.mimetype);
    const key = randomUUID() + extension;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || contentTypeByExtension[extension],
        CacheControl: 'public, max-age=31536000, immutable'
      })
    );
    return { key, url: `${this.publicBaseUrl}/${key}` };
  }

  async remove(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function createImageStorage(): ImageStorage {
  if (env.STORAGE_DRIVER === 'r2') return new R2ImageStorage();
  return new LocalImageStorage();
}

export const imageStorage: ImageStorage = createImageStorage();
