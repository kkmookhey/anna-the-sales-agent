import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const PDF_CT = 'application/pdf';

export class DeckStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  static fromEnv(bucket: string, region: string): DeckStore {
    return new DeckStore(new S3Client({ region }), bucket);
  }

  async put(key: string, body: Buffer): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: PDF_CT }),
    );
    return `s3://${this.bucket}/${key}`;
  }
}
