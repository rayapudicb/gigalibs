import type {
  AnalyticsQueryResultV1,
  AnalyticsQueryV1,
  ModuleAnalyticsCompiledSourceCatalogV1,
} from '@gigalibs/contracts';

export interface ModuleAnalyticsWorkbenchTheme {
  readonly palette: readonly string[];
  readonly text: { readonly color: string; readonly muted: string };
}

export interface ModuleAnalyticsWorkbenchProps {
  /** Registry source key (for example `cmms-downtime`); no tenant or SQL in props. */
  readonly sourceKey: string;
  /** Subset of contract default view keys; omit to allow all declared views. */
  readonly allowedViewKeys?: readonly string[];
  readonly loadCatalog: () => Promise<ModuleAnalyticsCompiledSourceCatalogV1>;
  readonly runQuery: (spec: AnalyticsQueryV1) => Promise<AnalyticsQueryResultV1>;
  readonly theme?: ModuleAnalyticsWorkbenchTheme;
  readonly className?: string;
}
