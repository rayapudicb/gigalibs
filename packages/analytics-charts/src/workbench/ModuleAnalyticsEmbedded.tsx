'use client';

import type { ModuleAnalyticsCompiledSourceCatalogV1 } from '@gigalibs/contracts';
import { ModuleAnalyticsWorkbench } from './ModuleAnalyticsWorkbench.js';
import { moduleAnalyticsBffApi } from './module-analytics-bff.js';
import type { ModuleAnalyticsWorkbenchProps } from './types.js';

interface ModuleSourceListItem {
  readonly sourceId: string;
  readonly sourceKey: string;
}

export function ModuleAnalyticsEmbedded(
  props: Pick<ModuleAnalyticsWorkbenchProps, 'sourceKey' | 'allowedViewKeys' | 'theme' | 'className'>,
) {
  return (
    <ModuleAnalyticsWorkbench
      sourceKey={props.sourceKey}
      allowedViewKeys={props.allowedViewKeys}
      theme={props.theme}
      className={props.className}
      loadCatalog={async () => {
        const sources = await moduleAnalyticsBffApi<ModuleSourceListItem[]>('v1/module-sources');
        const match = sources.find((entry) => entry.sourceKey === props.sourceKey);
        if (!match) throw new Error('This module analytics source is not available for your account.');
        return moduleAnalyticsBffApi<ModuleAnalyticsCompiledSourceCatalogV1>(`v1/module-sources/${match.sourceId}/catalog`);
      }}
      runQuery={(spec) => moduleAnalyticsBffApi('v1/query/spec', { method: 'POST', body: JSON.stringify(spec) })}
    />
  );
}
