import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const PDF_CT = 'application/pdf';
export const DOCX_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class DeckStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  static fromEnv(bucket: string, region: string): DeckStore {
    return new DeckStore(new S3Client({ region }), bucket);
  }

  async put(key: string, body: Buffer, contentType: string = PDF_CT): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return `s3://${this.bucket}/${key}`;
  }
}
