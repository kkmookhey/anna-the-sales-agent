import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { Deal } from './types.js';

export class DealRepo {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  static fromEnv(table: string, region: string): DealRepo {
    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    return new DealRepo(doc, table);
  }

  private withDefaults(item: Deal): Deal {
    if (!item.intake) item.intake = { source: 'direct', recipient_verified: true };
    if (item.parked_at === undefined) item.parked_at = null;
    return item;
  }

  async getDeal(dealId: string): Promise<Deal | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { deal_id: dealId } }),
    );
    return res.Item ? this.withDefaults(res.Item as Deal) : null;
  }

  async listDeals(): Promise<Deal[]> {
    const deals: Deal[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new ScanCommand({ TableName: this.table, ExclusiveStartKey: cursor }),
      );
      for (const item of (res.Items as Deal[] | undefined) ?? []) {
        if (!item.deal_id.startsWith('_meta#')) deals.push(this.withDefaults(item));
      }
      cursor = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (cursor);
    return deals;
  }

  async putDeal(deal: Deal): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: deal }));
  }

  async getMeta(key: string): Promise<string | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { deal_id: `_meta#${key}` } }),
    );
    return ((res.Item as { value?: string } | undefined)?.value) ?? null;
  }

  async putMeta(key: string, value: string): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { deal_id: `_meta#${key}`, value } }));
  }
}
