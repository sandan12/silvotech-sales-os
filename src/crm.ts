import raw from "./data/crm-snapshot.json";

export type CrmClient = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  next_action_at: string | null;
  updated_at: string;
  deleted_at: string | null;
  stage_id: string | null;
  owner_id: string;
};

type CrmBackup = {
  exported_at: string;
  counts: {
    clients: number;
    activities: number;
    products: number;
  };
  clients: CrmClient[];
};

const backup = raw as CrmBackup;
const clients = backup.clients.filter((client) => !client.deleted_at);

export const crmSnapshot = {
  exportedAt: backup.exported_at,
  clientCount: backup.counts.clients,
  activityCount: backup.counts.activities,
  productCount: backup.counts.products,
  clients,
};

export function findClient(term: string) {
  const needle = term.toLocaleLowerCase("ru");
  return clients.find((client) =>
    [client.name, client.website, client.notes]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase("ru").includes(needle)),
  );
}