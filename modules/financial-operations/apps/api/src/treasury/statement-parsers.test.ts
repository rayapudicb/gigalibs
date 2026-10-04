import { describe, expect, it } from 'vitest';
import {
  normalizeDate,
  parseBankStatement,
  parseCamt053Statement,
  parseCsvStatement,
  parseMt940Statement,
  parseOfxStatement,
  toMinorUnits,
} from './statement-parsers.js';

describe('Statement Parsers', () => {
  describe('toMinorUnits', () => {
    it('converts positive decimals to minor units and CREDIT', () => {
      const res = toMinorUnits('150.25');
      expect(res.amountMinor).toBe('15025');
      expect(res.type).toBe('CREDIT');
    });

    it('converts negative decimals to negative minor units and DEBIT', () => {
      const res = toMinorUnits('-45.50');
      expect(res.amountMinor).toBe('-4550');
      expect(res.type).toBe('DEBIT');
    });

    it('handles trailing negative and currency symbols', () => {
      const res = toMinorUnits('$1,200.00-');
      expect(res.amountMinor).toBe('-120000');
      expect(res.type).toBe('DEBIT');
    });

    it('handles integer amounts', () => {
      const res = toMinorUnits('500');
      expect(res.amountMinor).toBe('50000');
      expect(res.type).toBe('CREDIT');
    });
  });

  describe('normalizeDate', () => {
    it('normalizes YYYYMMDD', () => {
      expect(normalizeDate('20261004')).toBe('2026-10-04');
    });

    it('normalizes DD/MM/YYYY', () => {
      expect(normalizeDate('04/10/2026')).toBe('2026-10-04');
    });

    it('preserves YYYY-MM-DD', () => {
      expect(normalizeDate('2026-10-04')).toBe('2026-10-04');
    });
  });

  describe('CSV Parser', () => {
    it('parses standardized CSV bank statements', () => {
      const csv = `Date,Amount,Reference,Description
2026-10-01,1500.00,DEP-1001,Customer Deposit
2026-10-02,-250.50,CHK-5002,Supplier Payment
2026-10-03,-15.00,FEE-001,Monthly Service Fee`;

      const lines = parseCsvStatement(csv);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({
        lineNumber: 1,
        transactionDate: '2026-10-01',
        amountMinor: '150000',
        transactionType: 'CREDIT',
        reference: 'DEP-1001',
        description: 'Customer Deposit',
      });
      expect(lines[1]).toMatchObject({
        lineNumber: 2,
        transactionDate: '2026-10-02',
        amountMinor: '-25050',
        transactionType: 'DEBIT',
        reference: 'CHK-5002',
        description: 'Supplier Payment',
      });
      expect(lines[2]).toMatchObject({
        lineNumber: 3,
        transactionDate: '2026-10-03',
        amountMinor: '-1500',
        transactionType: 'DEBIT',
        reference: 'FEE-001',
        description: 'Monthly Service Fee',
      });
    });
  });

  describe('OFX Parser', () => {
    it('parses OFX statement transactions', () => {
      const ofx = `<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261001120000
<TRNAMT>2500.00
<FITID>FIT-9901
<NAME>Direct Deposit Acme
<MEMO>Invoice Settlement
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261002120000
<TRNAMT>-125.00
<FITID>FIT-9902
<NAME>Office Supplies
<MEMO>Stationery
</STMTTRN>
</BANKTRANLIST>
</OFX>`;

      const lines = parseOfxStatement(ofx);
      expect(lines).toHaveLength(2);
      expect(lines[0]!.amountMinor).toBe('250000');
      expect(lines[0]!.transactionType).toBe('CREDIT');
      expect(lines[0]!.reference).toBe('FIT-9901');
      expect(lines[0]!.counterpartyName).toBe('Direct Deposit Acme');
      expect(lines[1]!.amountMinor).toBe('-12500');
      expect(lines[1]!.transactionType).toBe('DEBIT');
      expect(lines[1]!.reference).toBe('FIT-9902');
    });
  });

  describe('SWIFT MT940 Parser', () => {
    it('parses MT940 statement messages', () => {
      const mt940 = `:20:START940
:25:ACC123456
:28C:001/1
:60F:C261001EUR10000,00
:61:2610011001CR1500,00NTRF//TXN-REF-771
:86:Payment from Client Alpha
:61:2610021002DR50,00NCHG//FEE-REF-882
:86:Wire Transfer Fee
:62F:C261002EUR11450,00
-}`;

      const lines = parseMt940Statement(mt940);
      expect(lines).toHaveLength(2);
      expect(lines[0]!.transactionDate).toBe('2026-10-01');
      expect(lines[0]!.amountMinor).toBe('150000');
      expect(lines[0]!.transactionType).toBe('CREDIT');
      expect(lines[0]!.reference).toBe('TXN-REF-771');
      expect(lines[0]!.description).toBe('Payment from Client Alpha');

      expect(lines[1]!.transactionDate).toBe('2026-10-02');
      expect(lines[1]!.amountMinor).toBe('-5000');
      expect(lines[1]!.transactionType).toBe('DEBIT');
      expect(lines[1]!.reference).toBe('FEE-REF-882');
      expect(lines[1]!.description).toBe('Wire Transfer Fee');
    });
  });

  describe('CAMT.053 XML Parser', () => {
    it('parses ISO 20022 CAMT.053 statements', () => {
      const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Ntry>
        <Amt Ccy="EUR">4200.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-10-03</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-CAMT-001</EndToEndId></Refs>
            <RltdPties><Dbtr><Nm>Globex Corp</Nm></Dbtr></RltdPties>
            <RmtInf><Ustrd>Subscription Renewal</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">75.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-10-04</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-CAMT-002</EndToEndId></Refs>
            <RmtInf><Ustrd>Maintenance Surcharge</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

      const lines = parseCamt053Statement(camt);
      expect(lines).toHaveLength(2);
      expect(lines[0]!.transactionDate).toBe('2026-10-03');
      expect(lines[0]!.amountMinor).toBe('420050');
      expect(lines[0]!.transactionType).toBe('CREDIT');
      expect(lines[0]!.reference).toBe('E2E-CAMT-001');
      expect(lines[0]!.counterpartyName).toBe('Globex Corp');

      expect(lines[1]!.transactionDate).toBe('2026-10-04');
      expect(lines[1]!.amountMinor).toBe('-7500');
      expect(lines[1]!.transactionType).toBe('DEBIT');
      expect(lines[1]!.reference).toBe('E2E-CAMT-002');
    });
  });

  describe('parseBankStatement Dispatcher', () => {
    it('dispatches to correct parser by format', () => {
      const csv = `Date,Amount\n2026-10-01,100.00`;
      const res = parseBankStatement('CSV', csv);
      expect(res).toHaveLength(1);
    });

    it('throws error for unsupported format', () => {
      expect(() => parseBankStatement('UNSUPPORTED' as any, '')).toThrow(
        'UNSUPPORTED_STATEMENT_FORMAT',
      );
    });
  });
});
