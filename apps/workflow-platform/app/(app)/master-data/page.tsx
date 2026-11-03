import { MasterDataScreen } from '@/components/master-data/MasterDataScreen';

// WI-OI-152 (ADR-0037 §3): the Master data area — every master the person may read, all groups.
export default function MasterDataPage() {
  return <MasterDataScreen group="all" />;
}
