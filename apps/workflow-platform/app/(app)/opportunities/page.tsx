import { CapabilityStatus } from '@/components/UnavailableCapability';

// WI-OI-120k (QF1): the SAM.gov opportunity and exclusion sync is a contained capability (its BFF route answers
// "unavailable"). The page used to call it as it opened and showed the refusal as an error; it now says so plainly.
export default function OpportunitiesPage() {
  return (
    <CapabilityStatus
      title="SAM.gov opportunities are not connected yet"
      summary="Opportunity and exclusion records come from a SAM.gov connection through the Connector Hub, which is not set up for this instance. No opportunity data is shown until a real connection exists."
      availableForTesting={['Connections and their sync journal, at /connections.']}
      blockedActions={['Showing sample opportunities or exclusions as SAM.gov facts.', 'Starting a SAM.gov sync from this screen.']}
    />
  );
}
