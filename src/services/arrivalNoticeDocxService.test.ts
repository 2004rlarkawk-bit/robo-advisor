import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import type { ForwarderImportCase } from '../types/forwarderCase';
import { buildArrivalNoticeDocx, mapArrivalNotice } from './arrivalNoticeDocxService';

const fixture = (extracted: Record<string, unknown> = {}) => ({
  blNo: 'BL-001', tradeId: 'trade-1', importer: 'IMPORTER', shipperName: 'SHIPPER', vesselName: 'VESSEL', eta: '2026-09-20',
  snapshot: { analysis: { extracted } },
}) as unknown as ForwarderImportCase;

describe('arrival notice', () => {
  it('supports legacy fields without arrays or structured totals', () => {
    const data = mapArrivalNotice(fixture({ containerNo: 'CONT-1', grossWeight: '1,250', grossWeightUnit: 'KG', totalPackageCount: '50', packageUnit: 'CTNS' }));
    expect(data.containers).toBe('CONT-1');
    expect(data.gross).toBe('1,250 KG');
    expect(data.packages).toBe('50 CTNS');
    expect(data.notify).toEqual([]);
    expect(mapArrivalNotice(fixture({ grossWeightUnit: 'KG' })).gross).toBe('');
  });

  it('does not associate a different exporter address with the shipper', () => {
    const data = mapArrivalNotice(fixture({ shipper: 'ACTUAL SHIPPER', exporterDetails: { name: 'OTHER SELLER', address: 'WRONG ADDRESS' } }));
    expect(data.shipper).toEqual(['ACTUAL SHIPPER']);
  });

  it('retains multiple containers and supplied unit text without duplication', () => {
    const data = mapArrivalNotice(fixture({ containerNumbers: ['A', 'B'], sealNumbers: ['S1', 'S2'], grossWeight: '250 KG', grossWeightUnit: 'KG' }));
    expect(data.containers).toBe('A\nB');
    expect(data.seals).toBe('S1\nS2');
    expect(data.gross).toBe('250 KG');
  });

  it('generates bilingual notice without invented charges, freight terms, or MBL classification', async () => {
    const blob = await buildArrivalNoticeDocx(fixture({ incoterms: 'CIF' }), '포트에이아이', '김담당');
    const zip = new PizZip(await blob.arrayBuffer());
    const xml = zip.file('word/document.xml')!.asText();
    for (const value of ['ARRIVAL NOTICE', '화물 도착통지서', 'Consignee 수하인', 'ETA 도착예정일', 'Cargo Details 화물 명세', '김담당', '미확인', 'DRAFT']) expect(xml).toContain(value);
    for (const value of ['겸 청구서', 'FREIGHT PREPAID', 'FREIGHT COLLECT', 'SAME AS CONSIGNEE', 'MBL NO.', 'TERMINAL HANDLING']) expect(xml).not.toContain(value);
    expect(xml).toContain('w:tblHeader');
    expect(xml).toContain('비용 청구서 또는 화물인도지시서');
  });
});
