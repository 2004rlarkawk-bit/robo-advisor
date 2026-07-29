import ImportTradeFlow from './ImportTradeFlow';
import type { ImportTradeSnapshot } from '../../types/importTrade';

export default function ImportShipperFlow(props: {
  userId: string;
  importerCompanyName?: string;
  onGenerate: (snapshot: ImportTradeSnapshot) => Promise<string>;
  onComplete: (snapshot: ImportTradeSnapshot) => Promise<void>;
}) {
  return <ImportTradeFlow role="shipper" {...props} />;
}
