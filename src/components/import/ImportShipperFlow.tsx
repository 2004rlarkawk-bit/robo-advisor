import ImportTradeFlow from './ImportTradeFlow';
import type { ImportTradeSnapshot } from '../../types/importTrade';
import type { SavedTrade } from '../../types';

export default function ImportShipperFlow(props: {
  userId: string;
  importerCompanyName?: string;
  onGenerate: (snapshot: ImportTradeSnapshot) => Promise<string>;
  onComplete: (snapshot: ImportTradeSnapshot) => Promise<SavedTrade>;
  onSaved?: (trade: SavedTrade) => void;
  onWorkspaceStateChange?: (state: { currentStep: number; tradeId: string | null }) => void;
  readOnly?: boolean;
  onClose?: () => void;
}) {
  return <ImportTradeFlow role="shipper" {...props} />;
}
