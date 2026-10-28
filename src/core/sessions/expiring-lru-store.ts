export type ExpiringLookup<T> =
  | { readonly status: 'found'; readonly value: T }
  | { readonly status: 'expired' }
  | { readonly status: 'missing' };

export interface ExpiringEntry<T> {
  readonly id: string;
  readonly value: T;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export class ExpiringLruStore<T> {
  private readonly entries = new Map<string, ExpiringEntry<T>>();
  private readonly expiredIds = new Map<string, number>();

  public constructor(
    private readonly ttlMs: number,
    private readonly maximumEntries: number,
    private readonly now: () => number,
    private readonly createId: () => string,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('TTL must be a positive integer.');
    }
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries <= 0) {
      throw new Error('Maximum entries must be a positive integer.');
    }
  }

  public create(
    createValue: (id: string, createdAtMs: number, expiresAtMs: number) => T,
  ): ExpiringEntry<T> {
    const createdAtMs = this.now();
    this.purgeExpired(createdAtMs);
    this.evictOverflow();
    const id = this.createUniqueId();
    const expiresAtMs = createdAtMs + this.ttlMs;
    const entry: ExpiringEntry<T> = {
      id,
      value: createValue(id, createdAtMs, expiresAtMs),
      createdAtMs,
      expiresAtMs,
    };
    this.entries.set(id, entry);
    return entry;
  }

  public get(id: string): ExpiringLookup<T> {
    const now = this.now();
    const entry = this.entries.get(id);
    if (!entry) {
      this.purgeTombstones(now);
      return this.expiredIds.has(id) ? { status: 'expired' } : { status: 'missing' };
    }
    if (entry.expiresAtMs <= now) {
      this.entries.delete(id);
      this.expiredIds.set(id, now + this.ttlMs);
      return { status: 'expired' };
    }
    this.entries.delete(id);
    this.entries.set(id, entry);
    return { status: 'found', value: entry.value };
  }

  public get size(): number {
    return this.entries.size;
  }

  private createUniqueId(): string {
    let id = this.createId();
    while (this.entries.has(id) || this.expiredIds.has(id)) {
      id = this.createId();
    }
    return id;
  }

  private evictOverflow(): void {
    while (this.entries.size >= this.maximumEntries) {
      const oldestId = this.entries.keys().next().value;
      if (!oldestId) return;
      this.entries.delete(oldestId);
    }
  }

  private purgeExpired(now: number): void {
    for (const [id, entry] of this.entries) {
      if (entry.expiresAtMs <= now) {
        this.entries.delete(id);
        this.expiredIds.set(id, now + this.ttlMs);
      }
    }
    this.purgeTombstones(now);
  }

  private purgeTombstones(now: number): void {
    for (const [id, expiresAtMs] of this.expiredIds) {
      if (expiresAtMs <= now) this.expiredIds.delete(id);
    }
  }
}
