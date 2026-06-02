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

  async getDeal(dealId: string): Promise<Deal | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { deal_id: dealId } }),
    );
    return (res.Item as Deal | undefined) ?? null;
  }

  async listDeals(): Promise<Deal[]> {
    const deals: Deal[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new ScanCommand({ TableName: this.table, ExclusiveStartKey: cursor }),
      );
      deals.push(...((res.Items as Deal[] | undefined) ?? []));
      cursor = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (cursor);
    return deals;
  }

  async putDeal(deal: Deal): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: deal }));
  }
}
