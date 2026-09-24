import { describe, expect, it } from 'vitest';
import {
  assembleAccountingDocuments,
  assemblePeppolInbound,
  documentSourceLabel,
  extractPeppolMailRef,
  invoiceHasDocument,
  isPeppolInboundFileName,
  isPeppolInboundInvoice,
  isVendorBillType,
  matchesQuery,
  missingSupportKindLabel,
  missingSupportRowTypeLabel,
  odooFormHref,
  peppolLinkStatusLabel,
  peppolNeedsAttention,
  peppolOriginLabel,
  peppolStatusForMatchedInvoice,
  ublFilenameMatchesRef,
  type OdooAttachmentRecord,
  type OdooBankLineRecord,
  type OdooDocumentRecord,
  type OdooInvoiceRecord,
} from '@/lib/accounting/documents';

function invoice(overrides: Partial<OdooInvoiceRecord> & Pick<OdooInvoiceRecord, 'id'>): OdooInvoiceRecord {
  return {
    name: `BILL/${overrides.id}`,
    date: '2026-03-10',
    state: 'posted',
    amount_total_signed: -121,
    ref: 'F-100',
    partner_id: [9, 'Play UP'],
    journal_id: [3, 'Vendor Bills'],
    move_type: 'in_invoice',
    ...overrides,
  };
}

describe('document labels', () => {
  it('labels sources, missing kinds and row types exhaustively', () => {
    expect(documentSourceLabel('documents.document')).toBe('Odoo Documenten');
    expect(documentSourceLabel('ir.attachment')).toBe('Bijlage');
    expect(missingSupportKindLabel('missing_invoice')).toBe('Geen factuur afgeletterd');
    expect(missingSupportKindLabel('missing_document')).toBe('Geen document/PDF');
    expect(missingSupportRowTypeLabel('bank_line')).toBe('Bankregel');
    expect(missingSupportRowTypeLabel('vendor_bill')).toBe('Aankoopfactuur');
    expect(odooFormHref('account.move', 44)).toContain('id=44');
  });

  it('recognizes vendor bills and query matches', () => {
    expect(isVendorBillType('in_invoice')).toBe(true);
    expect(isVendorBillType('in_refund')).toBe(true);
    expect(isVendorBillType('out_invoice')).toBe(false);
    expect(matchesQuery(['Play UP', 'BILL/1'], 'play')).toBe(true);
    expect(matchesQuery(['Play UP'], 'mollie')).toBe(false);
    expect(matchesQuery(['Play UP'], '  ')).toBe(true);
  });
});

describe('invoiceHasDocument', () => {
  it('detects a main attachment, attachment_ids, or linked rows', () => {
    expect(
      invoiceHasDocument(invoice({ id: 1, message_main_attachment_id: [88, 'scan.pdf'] }), new Map(), new Map())
    ).toBe(true);
    expect(
      invoiceHasDocument(invoice({ id: 2, attachment_ids: [3, 4] }), new Map(), new Map())
    ).toBe(true);
    expect(
      invoiceHasDocument(invoice({ id: 3 }), new Map([[3, [9]]]), new Map())
    ).toBe(true);
    expect(
      invoiceHasDocument(invoice({ id: 4 }), new Map(), new Map([[4, [1]]]))
    ).toBe(true);
    expect(invoiceHasDocument(invoice({ id: 5 }), new Map(), new Map())).toBe(false);
  });
});

describe('assembleAccountingDocuments', () => {
  const attachment: OdooAttachmentRecord = {
    id: 88,
    name: 'playup-maart.pdf',
    mimetype: 'application/pdf',
    res_model: 'account.move',
    res_id: 1,
    create_date: '2026-03-11 09:00:00',
    file_size: 1200,
  };

  const odooDocument: OdooDocumentRecord = {
    id: 501,
    name: 'playup-maart.pdf',
    mimetype: 'application/pdf',
    res_model: 'account.move',
    res_id: 1,
    partner_id: [9, 'Play UP'],
    folder_id: [2, 'Facturen'],
    create_date: '2026-03-11 09:00:00',
    attachment_id: [88, 'playup-maart.pdf'],
    file_size: 1200,
    type: 'binary',
  };

  it('builds the three lists: uploads, linked invoices, missing support', () => {
    const result = assembleAccountingDocuments({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      invoices: [
        invoice({ id: 1, message_main_attachment_id: [88, 'playup-maart.pdf'] }),
        invoice({ id: 2, name: 'BILL/2', ref: 'zonder-pdf', attachment_ids: [] }),
        invoice({
          id: 3,
          name: 'INV/3',
          move_type: 'out_invoice',
          amount_total_signed: 50,
          partner_id: [4, 'Klant'],
          journal_id: [1, 'Sales'],
        }),
      ],
      attachments: [attachment],
      documents: [odooDocument],
      bankLines: [
        {
          id: 70,
          date: '2026-03-12',
          amount: -121,
          payment_ref: 'Play UP maart',
          partner_id: [9, 'Play UP'],
          journal_id: [8, 'Mollie'],
          is_reconciled: false,
          ref: false,
          state: 'posted',
        } satisfies OdooBankLineRecord,
        {
          id: 71,
          date: '2026-03-13',
          amount: 10,
          payment_ref: 'al ok',
          is_reconciled: true,
          state: 'posted',
        },
      ],
    });

    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0].source).toBe('documents.document');
    expect(result.uploaded[0].linked).toBe(true);
    expect(result.uploaded[0].invoiceId).toBe(1);
    expect(result.uploaded[0].folderName).toBe('Facturen');

    expect(result.invoicesWithDocument).toHaveLength(1);
    expect(result.invoicesWithDocument[0].id).toBe(1);
    expect(result.invoicesWithDocument[0].documentName).toBe('playup-maart.pdf');
    expect(result.invoicesWithDocument[0].documentCount).toBeGreaterThanOrEqual(1);

    const missingKinds = result.missingSupport.map((row) => `${row.rowType}:${row.kind}:${row.id}`);
    expect(missingKinds).toContain('vendor_bill:missing_document:2');
    expect(missingKinds).toContain('bank_line:missing_invoice:70');
    expect(missingKinds).not.toContain('bank_line:missing_invoice:71');
    expect(result.missingSupport.find((row) => row.id === 3)).toBeUndefined();
  });

  it('keeps unlinked Odoo documents in the uploaded list', () => {
    const result = assembleAccountingDocuments({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      invoices: [],
      attachments: [],
      documents: [
        {
          id: 9,
          name: 'wacht-op-boeking.pdf',
          res_model: false,
          res_id: false,
          create_date: '2026-03-02 12:00:00',
        },
      ],
      bankLines: [],
    });
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0].linked).toBe(false);
    expect(result.uploaded[0].invoiceId).toBeNull();
  });

  it('skips cancelled vendor bills and cancelled bank lines', () => {
    const result = assembleAccountingDocuments({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      invoices: [invoice({ id: 8, state: 'cancel' })],
      attachments: [],
      documents: [],
      bankLines: [
        {
          id: 1,
          date: '2026-03-01',
          amount: 1,
          is_reconciled: false,
          state: 'cancel',
        },
      ],
    });
    expect(result.missingSupport).toHaveLength(0);
    expect(result.invoicesWithDocument).toHaveLength(0);
    expect(result.peppolInbound).toHaveLength(0);
  });
});

describe('Peppol inbound linking', () => {
  it('extracts MAIL xml refs and labels statuses', () => {
    expect(extractPeppolMailRef('MAIL_I2602984297.xml')).toBe('I2602984297');
    expect(extractPeppolMailRef('MAIL_F/2026/09/00643.xml')).toBe('F/2026/09/00643');
    expect(extractPeppolMailRef('invoice.pdf')).toBeNull();
    expect(isPeppolInboundFileName('MAIL_x.xml', 'application/xml')).toBe(true);
    expect(isPeppolInboundFileName('scan.pdf', 'application/pdf')).toBe(false);
    expect(ublFilenameMatchesRef('I2602984297.xml', 'I2602984297')).toBe(true);
    expect(peppolLinkStatusLabel('linked')).toBe('Juist gekoppeld');
    expect(peppolLinkStatusLabel('unlinked')).toBe('Bestand zonder factuur');
    expect(peppolLinkStatusLabel('invoice_without_file')).toBe('Factuur zonder XML');
    expect(peppolLinkStatusLabel('mismatch')).toBe('Koppeling klopt niet');
    expect(peppolOriginLabel('mail_xml')).toBe('Peppol-bestand (MAIL)');
    expect(peppolOriginLabel('ubl_xml')).toBe('UBL op factuur');
    expect(peppolOriginLabel('invoice')).toBe('Peppol-factuur');
    expect(peppolNeedsAttention('linked')).toBe(false);
    expect(peppolNeedsAttention('unlinked')).toBe(true);
    expect(peppolNeedsAttention('invoice_without_file')).toBe(true);
    expect(peppolNeedsAttention('mismatch')).toBe(true);
  });

  it('treats vendor bills with peppol_move_state as inbound Peppol', () => {
    expect(
      isPeppolInboundInvoice(
        invoice({ id: 1, peppol_move_state: 'done', peppol_message_uuid: 'abc' })
      )
    ).toBe(true);
    expect(isPeppolInboundInvoice(invoice({ id: 2 }))).toBe(false);
    expect(
      isPeppolInboundInvoice(
        invoice({
          id: 3,
          move_type: 'out_invoice',
          peppol_move_state: 'to_send',
          journal_id: [1, 'Sales'],
        })
      )
    ).toBe(false);
  });

  it('marks MAIL xml as linked when the matching Peppol bill has the same UBL', () => {
    const result = assembleAccountingDocuments({
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      invoices: [
        invoice({
          id: 10,
          ref: 'I2602984297',
          peppol_move_state: 'done',
          peppol_message_uuid: 'uuid-1',
          ubl_cii_xml_id: [20, 'I2602984297.xml'],
          ubl_cii_xml_filename: 'I2602984297.xml',
          message_main_attachment_id: [21, 'I2602984297.pdf'],
        }),
      ],
      attachments: [
        {
          id: 99,
          name: 'MAIL_I2602984297.xml',
          mimetype: 'application/xml',
          res_model: false,
          res_id: 0,
          create_date: '2026-09-15 07:33:16',
        },
        {
          id: 20,
          name: 'I2602984297.xml',
          mimetype: 'application/xml',
          res_model: 'account.move',
          res_id: 10,
          create_date: '2026-09-15 07:33:20',
        },
      ],
      documents: [],
      bankLines: [],
    });

    expect(result.peppolInbound).toHaveLength(1);
    expect(result.peppolInbound[0].origin).toBe('mail_xml');
    expect(result.peppolInbound[0].linkStatus).toBe('linked');
    expect(result.peppolInbound[0].invoiceId).toBe(10);
    const mailUpload = result.uploaded.find((row) => row.name === 'MAIL_I2602984297.xml');
    expect(mailUpload?.isPeppol).toBe(true);
    expect(mailUpload?.peppolLinkStatus).toBe('linked');
    expect(mailUpload?.linked).toBe(true);
    expect(result.invoicesWithDocument[0].isPeppolInbound).toBe(true);
    expect(result.invoicesWithDocument[0].peppolLinkStatus).toBe('linked');
  });

  it('marks MAIL xml without a matching invoice as unlinked', () => {
    const rows = assemblePeppolInbound({
      invoices: [],
      attachments: [
        {
          id: 1,
          name: 'MAIL_UNKNOWN-REF.xml',
          mimetype: 'application/xml',
          res_model: false,
          res_id: 0,
          create_date: '2026-09-01 10:00:00',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].linkStatus).toBe('unlinked');
    expect(rows[0].invoiceId).toBeNull();
  });

  it('flags Peppol bills without UBL xml and MAIL xml with a bill but no UBL', () => {
    const billNoXml = invoice({
      id: 4,
      ref: 'NO-XML',
      peppol_move_state: 'done',
      peppol_message_uuid: 'u',
    });
    expect(peppolStatusForMatchedInvoice(billNoXml, 'NO-XML')).toBe('mismatch');

    const result = assembleAccountingDocuments({
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      invoices: [
        billNoXml,
        invoice({
          id: 5,
          ref: 'MAIL-NO-UBL',
          peppol_move_state: 'done',
          peppol_message_uuid: 'u2',
          message_main_attachment_id: [8, 'scan.pdf'],
        }),
      ],
      attachments: [
        {
          id: 8,
          name: 'scan.pdf',
          mimetype: 'application/pdf',
          res_model: 'account.move',
          res_id: 5,
        },
        {
          id: 9,
          name: 'MAIL_MAIL-NO-UBL.xml',
          mimetype: 'application/xml',
          res_model: false,
          res_id: 0,
        },
      ],
      documents: [],
      bankLines: [],
    });

    const byId = Object.fromEntries(result.peppolInbound.map((row) => [row.id, row]));
    expect(byId['invoice-4']?.linkStatus).toBe('invoice_without_file');
    expect(byId['mail-xml-9']?.linkStatus).toBe('mismatch');
  });

  it('does not treat a customer invoice with the same ref as a Peppol match', () => {
    const rows = assemblePeppolInbound({
      invoices: [
        invoice({
          id: 30,
          move_type: 'out_invoice',
          ref: 'SHARED-REF',
          peppol_move_state: 'done',
          ubl_cii_xml_filename: 'SHARED-REF.xml',
          journal_id: [1, 'Sales'],
        }),
      ],
      attachments: [
        {
          id: 40,
          name: 'MAIL_SHARED-REF.xml',
          mimetype: 'application/xml',
          res_model: false,
          res_id: 0,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].linkStatus).toBe('unlinked');
    expect(rows[0].invoiceId).toBeNull();
  });

  it('lists a Peppol bill with UBL but no MAIL xml as linked ubl origin', () => {
    const rows = assemblePeppolInbound({
      invoices: [
        invoice({
          id: 7,
          ref: 'ONLY-UBL',
          peppol_move_state: 'done',
          peppol_message_uuid: 'u3',
          ubl_cii_xml_id: [70, 'ONLY-UBL.xml'],
          ubl_cii_xml_filename: 'ONLY-UBL.xml',
        }),
      ],
      attachments: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('ubl_xml');
    expect(rows[0].linkStatus).toBe('linked');
    expect(peppolNeedsAttention(rows[0].linkStatus)).toBe(false);
  });
});
