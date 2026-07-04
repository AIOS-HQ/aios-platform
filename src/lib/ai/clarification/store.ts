import type { ClarificationRequest } from "./types";

/**
 * Pluggable store for clarification requests. The default is in-memory so the
 * framework ships with ZERO schema migration. A persistent, RLS-scoped
 * `clarification_requests` table is a separately-approved migration; wire it via
 * `setClarificationStore` when it lands.
 */
export interface ClarificationStore {
  create(req: ClarificationRequest): Promise<void> | void;
  get(id: string): Promise<ClarificationRequest | undefined> | ClarificationRequest | undefined;
  update(req: ClarificationRequest): Promise<void> | void;
  listPending(userId: string): Promise<ClarificationRequest[]> | ClarificationRequest[];
}

class InMemoryClarificationStore implements ClarificationStore {
  private items = new Map<string, ClarificationRequest>();

  create(req: ClarificationRequest): void {
    this.items.set(req.id, req);
  }
  get(id: string): ClarificationRequest | undefined {
    return this.items.get(id);
  }
  update(req: ClarificationRequest): void {
    this.items.set(req.id, req);
  }
  listPending(userId: string): ClarificationRequest[] {
    return [...this.items.values()].filter((r) => r.userId === userId && r.status === "pending");
  }
}

let activeStore: ClarificationStore = new InMemoryClarificationStore();

export function setClarificationStore(store: ClarificationStore): void {
  activeStore = store;
}

export function getClarificationStore(): ClarificationStore {
  return activeStore;
}
