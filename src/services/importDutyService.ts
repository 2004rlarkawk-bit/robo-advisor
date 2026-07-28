import { getTariffRates, pickBasicRate } from './unipassService';
import type { ImportDutyEstimate } from '../types/importTrade';

export async function calculateEstimatedImportDuty(input: {
  hsCode: string;
  customsValue: number;
  originCountry: string;
  destinationCountry: string;
}): Promise<ImportDutyEstimate> {
  const rates = await getTariffRates(input.hsCode);
  const basic = pickBasicRate(rates);
  if (!basic) {
    throw new Error('조회된 기본 관세율이 없습니다.');
  }
  const basicRate = basic.rate;
  const basicDuty = Math.round(input.customsValue * basicRate / 100);
  const hasCandidateFta = Boolean(input.originCountry);
  const ftaRate = hasCandidateFta ? 0 : basicRate;
  const ftaDuty = Math.round(input.customsValue * ftaRate / 100);
  const vat = Math.round((input.customsValue + ftaDuty) * 0.1);
  return {
    customsValue: input.customsValue,
    basicRate,
    basicDuty,
    ftaAgreement: hasCandidateFta ? '적용 가능 협정 확인 필요' : '해당 없음',
    ftaRate,
    ftaDuty,
    estimatedSavings: Math.max(0, basicDuty - ftaDuty),
    vat,
    totalTax: ftaDuty + vat,
    source: basic.source,
  };
}
