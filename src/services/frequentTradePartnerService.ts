import { supabase } from '../lib/supabase';
import type { TradeFormDataV3, TradeFormParty } from '../types/tradeFormData';

interface SubmittedShipperTradeRow {
  form_data: TradeFormDataV3;
  submitted_at: string;
}

export interface FrequentTradePartner {
  key: string;
  transactionCount: number;
  lastTransactionDate: string;
  buyer: TradeFormParty;
  consignee: TradeFormParty;
  notifyParty: TradeFormParty;
}

function normalizeIdentityPart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function buyerIdentity(party: TradeFormParty): string {
  return [party.name, party.country, party.address]
    .map(normalizeIdentityPart)
    .join('\u001f');
}

function isParty(value: unknown): value is TradeFormParty {
  if (!value || typeof value !== 'object') return false;
  const party = value as Partial<TradeFormParty>;
  return ['name', 'address', 'country'].every((field) =>
    typeof party[field as keyof TradeFormParty] === 'string');
}

export function calculateFrequentTradePartners(
  rows: SubmittedShipperTradeRow[],
  limit = 3,
): FrequentTradePartner[] {
  const grouped = new Map<string, FrequentTradePartner>();

  for (const row of rows) {
    const parties = row.form_data?.parties;
    if (!parties || !isParty(parties.buyer) || !isParty(parties.partner) || !isParty(parties.notifyParty)) continue;
    if (!parties.buyer.name.trim() || !row.submitted_at) continue;

    const key = buyerIdentity(parties.buyer);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        key,
        transactionCount: 1,
        lastTransactionDate: row.submitted_at,
        buyer: parties.buyer,
        consignee: parties.partner,
        notifyParty: parties.notifyParty,
      });
      continue;
    }

    current.transactionCount += 1;
    if (Date.parse(row.submitted_at) > Date.parse(current.lastTransactionDate)) {
      current.lastTransactionDate = row.submitted_at;
      current.buyer = parties.buyer;
      current.consignee = parties.partner;
      current.notifyParty = parties.notifyParty;
    }
  }

  return [...grouped.values()]
    .sort((a, b) =>
      b.transactionCount - a.transactionCount ||
      Date.parse(b.lastTransactionDate) - Date.parse(a.lastTransactionDate))
    .slice(0, limit);
}

/** 완료된 수출 화주 거래만 한 번 조회해 Buyer 기준 TOP 3를 계산합니다. */
export async function fetchFrequentTradePartners(userId: string): Promise<FrequentTradePartner[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('form_data, submitted_at')
    .eq('user_id', userId)
    .eq('direction', 'export')
    .eq('role', 'shipper')
    .eq('status', 'submitted')
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return calculateFrequentTradePartners((data ?? []) as SubmittedShipperTradeRow[]);
}
