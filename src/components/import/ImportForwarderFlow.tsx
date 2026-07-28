import ImportTradeFlow from './ImportTradeFlow';
import type { ImportTradeSnapshot } from '../../types/importTrade';

export default function ImportForwarderFlow(props: { userId: string; onComplete: (snapshot: ImportTradeSnapshot) => Promise<void> }) {
  return <ImportTradeFlow role="forwarder" {...props} />;
}
