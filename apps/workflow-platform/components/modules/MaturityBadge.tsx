import { Badge } from '@medusajs/ui';
import type { PlatformModuleMaturity } from '@gigalibs/contracts';
import { moduleMaturityColor, moduleMaturityLabel } from '@/lib/module-maturity';

/** Shows how much evidence stands behind a catalogue entry (vision §5, WI-OI-102e). */
export function MaturityBadge({ maturity }: { maturity: PlatformModuleMaturity }) {
  return (
    <Badge size="2xsmall" color={moduleMaturityColor[maturity]} title="Maturity: how much evidence stands behind it">
      {moduleMaturityLabel[maturity]}
    </Badge>
  );
}
