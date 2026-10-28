export type DiagnosticEvent =
  | 'server_started'
  | 'server_stopped'
  | 'catalog_synced'
  | 'search_completed'
  | 'resolution_completed'
  | 'inspection_completed'
  | 'request_rejected';

export interface DiagnosticFields {
  readonly catalogSize?: number;
  readonly candidateCount?: number;
  readonly attemptCount?: number;
  readonly degraded?: boolean;
  readonly matched?: boolean;
  readonly mode?: 'hybrid' | 'bm25' | 'pattern';
  readonly selectionMode?: 'automatic' | 'model_choice' | 'none';
  readonly errorCode?: string;
}

export class SafeDiagnosticLogger {
  public constructor(
    private readonly sink: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  ) {}

  public log(event: DiagnosticEvent, fields: DiagnosticFields = {}): void {
    const bounded = {
      event,
      ...(typeof fields.catalogSize === 'number' ? { catalogSize: fields.catalogSize } : {}),
      ...(typeof fields.candidateCount === 'number'
        ? { candidateCount: fields.candidateCount }
        : {}),
      ...(typeof fields.attemptCount === 'number'
        ? { attemptCount: Math.min(Math.max(fields.attemptCount, 0), 2) }
        : {}),
      ...(typeof fields.degraded === 'boolean' ? { degraded: fields.degraded } : {}),
      ...(typeof fields.matched === 'boolean' ? { matched: fields.matched } : {}),
      ...(fields.mode ? { mode: fields.mode } : {}),
      ...(fields.selectionMode ? { selectionMode: fields.selectionMode } : {}),
      ...(fields.errorCode ? { errorCode: fields.errorCode.slice(0, 64) } : {}),
    };
    this.sink(JSON.stringify(bounded));
  }
}
