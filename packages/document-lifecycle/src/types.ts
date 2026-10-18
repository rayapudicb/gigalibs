export type DocumentStatus = string;

/** Minimal document shape the runner needs; modules attach richer types in guards and effects. */
export interface VersionedDocument {
  readonly status: DocumentStatus;
  readonly version: number;
}

export interface TransitionContext<TDoc extends VersionedDocument> {
  readonly tenantId: string;
  readonly actorId: string;
  readonly documentId: string;
  readonly action: string;
  readonly expectedVersion: number;
  readonly document: TDoc;
}

export type TransitionGuard<TDoc extends VersionedDocument> = (
  context: TransitionContext<TDoc>,
) => void | Promise<void>;

export interface TransitionDefinition<TDoc extends VersionedDocument, TResult = unknown> {
  readonly from: readonly DocumentStatus[];
  readonly to: DocumentStatus;
  readonly guards?: readonly TransitionGuard<TDoc>[];
  readonly effect: (context: TransitionContext<TDoc>) => Promise<TResult>;
}

export type DocumentTransitionGraph<TDoc extends VersionedDocument> = Readonly<
  Record<string, TransitionDefinition<TDoc>>
>;
