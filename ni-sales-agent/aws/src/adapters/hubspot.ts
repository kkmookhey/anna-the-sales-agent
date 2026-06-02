export interface DealProperties {
  dealname: string;
  pipeline: string;
  dealstage: string;
  hubspot_owner_id: string;
  amount?: string;
}

export class HubSpotClient {
  constructor(private readonly token: string) {}

  async createDeal(props: DealProperties): Promise<string> {
    const properties: Record<string, string> = {
      dealname: props.dealname,
      pipeline: props.pipeline,
      dealstage: props.dealstage,
      hubspot_owner_id: props.hubspot_owner_id,
    };
    if (props.amount) properties.amount = props.amount;

    const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) throw new Error(`HubSpot createDeal ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { id: string };
    return json.id;
  }
}
