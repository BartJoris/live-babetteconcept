import { odooClient } from '@/lib/odooClient';
import {
  assembleAccountingDocuments,
  extractPeppolMailRef,
  INVOICE_MOVE_TYPES,
  type AccountingDocuments,
  type OdooAttachmentRecord,
  type OdooBankLineRecord,
  type OdooDocumentRecord,
  type OdooInvoiceRecord,
} from '@/lib/accounting/documents';

const PAGE_SIZE = 1000;
const ID_CHUNK = 300;
const INVOICE_FIELDS = [
  'id',
  'name',
  'date',
  'state',
  'amount_total_signed',
  'amount_total',
  'ref',
  'partner_id',
  'journal_id',
  'move_type',
] as const;
const INVOICE_EXTRA_FIELDS = [
  'message_main_attachment_id',
  'attachment_ids',
  'peppol_move_state',
  'peppol_message_uuid',
  'ubl_cii_xml_id',
  'ubl_cii_xml_filename',
] as const;
const ATTACHMENT_FIELDS = [
  'id',
  'name',
  'mimetype',
  'res_model',
  'res_id',
  'create_date',
  'file_size',
] as const;
const DOCUMENT_FIELDS = [
  'id',
  'name',
  'mimetype',
  'res_model',
  'res_id',
  'partner_id',
  'folder_id',
  'create_date',
  'attachment_id',
  'file_size',
  'type',
] as const;
const BANK_FIELDS = [
  'id',
  'date',
  'amount',
  'payment_ref',
  'partner_id',
  'journal_id',
  'is_reconciled',
  'move_id',
  'ref',
  'state',
] as const;

async function searchReadPaged<T>(
  uid: number,
  password: string,
  model: string,
  domain: unknown[],
  fields: string[],
  order: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const batch = await odooClient.searchRead<T>(
      uid,
      password,
      model,
      domain,
      fields,
      PAGE_SIZE,
      offset,
      order
    );
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

function chunkIds(ids: number[]): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    chunks.push(ids.slice(i, i + ID_CHUNK));
  }
  return chunks;
}

function uniqueIds(ids: Array<number | false | null | undefined>): number[] {
  return [...new Set(ids.filter((id): id is number => typeof id === 'number' && id > 0))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'onbekende fout';
}

async function fetchInvoices(
  uid: number,
  password: string,
  dateFrom: string,
  dateTo: string,
  warnings: string[]
): Promise<OdooInvoiceRecord[]> {
  const domain: unknown[] = [
    ['date', '>=', dateFrom],
    ['date', '<=', dateTo],
    ['move_type', 'in', [...INVOICE_MOVE_TYPES]],
  ];
  try {
    return await searchReadPaged<OdooInvoiceRecord>(
      uid,
      password,
      'account.move',
      domain,
      [...INVOICE_FIELDS, ...INVOICE_EXTRA_FIELDS],
      'date desc, id desc'
    );
  } catch (error) {
    warnings.push(
      `Extra factuurvelden (bijlage) niet beschikbaar (${errorMessage(error)}). We zoeken bijlagen via ir.attachment.`
    );
    return searchReadPaged<OdooInvoiceRecord>(
      uid,
      password,
      'account.move',
      domain,
      [...INVOICE_FIELDS],
      'date desc, id desc'
    );
  }
}

async function fetchBankLines(
  uid: number,
  password: string,
  dateFrom: string,
  dateTo: string
): Promise<OdooBankLineRecord[]> {
  return searchReadPaged<OdooBankLineRecord>(
    uid,
    password,
    'account.bank.statement.line',
    [
      ['date', '>=', dateFrom],
      ['date', '<=', dateTo],
    ],
    [...BANK_FIELDS],
    'date desc, id desc'
  );
}

async function fetchDocumentsApp(
  uid: number,
  password: string,
  dateFrom: string,
  dateTo: string,
  warnings: string[]
): Promise<OdooDocumentRecord[]> {
  try {
    return await searchReadPaged<OdooDocumentRecord>(
      uid,
      password,
      'documents.document',
      [
        ['create_date', '>=', `${dateFrom} 00:00:00`],
        ['create_date', '<=', `${dateTo} 23:59:59`],
      ],
      [...DOCUMENT_FIELDS],
      'create_date desc, id desc'
    );
  } catch (error) {
    warnings.push(
      `Odoo Documenten-app niet beschikbaar (${errorMessage(error)}). Geüploade stukken komen uit factuurbijlagen.`
    );
    return [];
  }
}

async function readAttachmentsByIds(
  uid: number,
  password: string,
  ids: number[]
): Promise<OdooAttachmentRecord[]> {
  const rows: OdooAttachmentRecord[] = [];
  for (const group of chunkIds(ids)) {
    const batch = await odooClient.read<OdooAttachmentRecord>(
      uid,
      password,
      'ir.attachment',
      group,
      [...ATTACHMENT_FIELDS]
    );
    rows.push(...batch);
  }
  return rows;
}

async function searchAttachmentsByDomain(
  uid: number,
  password: string,
  domain: unknown[]
): Promise<OdooAttachmentRecord[]> {
  return searchReadPaged<OdooAttachmentRecord>(
    uid,
    password,
    'ir.attachment',
    domain,
    [...ATTACHMENT_FIELDS],
    'create_date desc, id desc'
  );
}

async function fetchAttachments(
  uid: number,
  password: string,
  dateFrom: string,
  dateTo: string,
  invoices: OdooInvoiceRecord[],
  warnings: string[]
): Promise<OdooAttachmentRecord[]> {
  const byId = new Map<number, OdooAttachmentRecord>();
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const idsFromMoves = uniqueIds(
    invoices.flatMap((invoice) => [
      ...(Array.isArray(invoice.attachment_ids) ? invoice.attachment_ids : []),
      Array.isArray(invoice.message_main_attachment_id)
        ? invoice.message_main_attachment_id[0]
        : undefined,
      Array.isArray(invoice.ubl_cii_xml_id) ? invoice.ubl_cii_xml_id[0] : undefined,
    ])
  );

  if (idsFromMoves.length > 0) {
    try {
      for (const row of await readAttachmentsByIds(uid, password, idsFromMoves)) {
        byId.set(row.id, row);
      }
    } catch (error) {
      warnings.push(`Bijlagen lezen via id mislukt (${errorMessage(error)}).`);
    }
  }

  try {
    for (const group of chunkIds(invoiceIds)) {
      if (group.length === 0) continue;
      const rows = await searchAttachmentsByDomain(uid, password, [
        ['res_model', '=', 'account.move'],
        ['res_id', 'in', group],
      ]);
      for (const row of rows) byId.set(row.id, row);
    }
  } catch (error) {
    warnings.push(`Bijlagen op facturen niet beschikbaar (${errorMessage(error)}).`);
  }

  try {
    const uploadedInPeriod = await searchAttachmentsByDomain(uid, password, [
      ['create_date', '>=', `${dateFrom} 00:00:00`],
      ['create_date', '<=', `${dateTo} 23:59:59`],
      ['res_model', 'in', ['account.move', 'account.bank.statement.line', 'account.payment']],
    ]);
    for (const row of uploadedInPeriod) byId.set(row.id, row);
  } catch (error) {
    warnings.push(`Bijlagen op uploaddatum niet beschikbaar (${errorMessage(error)}).`);
  }

  try {
    const peppolMailXml = await searchAttachmentsByDomain(uid, password, [
      ['create_date', '>=', `${dateFrom} 00:00:00`],
      ['create_date', '<=', `${dateTo} 23:59:59`],
      ['name', '=like', 'MAIL_%.xml'],
    ]);
    for (const row of peppolMailXml) byId.set(row.id, row);
  } catch (error) {
    warnings.push(`Peppol MAIL-XML niet beschikbaar (${errorMessage(error)}).`);
  }

  return [...byId.values()];
}

async function fetchExtraInvoices(
  uid: number,
  password: string,
  attachments: OdooAttachmentRecord[],
  documents: OdooDocumentRecord[],
  knownIds: Set<number>,
  warnings: string[]
): Promise<OdooInvoiceRecord[]> {
  const missing = uniqueIds([
    ...attachments.map((row) => (row.res_model === 'account.move' ? row.res_id : null)),
    ...documents.map((row) => (row.res_model === 'account.move' ? row.res_id : null)),
  ]).filter((id) => !knownIds.has(id));
  if (missing.length === 0) return [];

  const rows: OdooInvoiceRecord[] = [];
  try {
    for (const group of chunkIds(missing)) {
      const batch = await odooClient.read<OdooInvoiceRecord>(
        uid,
        password,
        'account.move',
        group,
        [...INVOICE_FIELDS, ...INVOICE_EXTRA_FIELDS]
      );
      rows.push(...batch);
    }
  } catch (error) {
    warnings.push(`Gekoppelde factuurnamen buiten de periode niet geladen (${errorMessage(error)}).`);
  }
  return rows;
}

async function fetchInvoicesByRefs(
  uid: number,
  password: string,
  refs: string[],
  knownIds: Set<number>,
  warnings: string[]
): Promise<OdooInvoiceRecord[]> {
  const uniqueRefs = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
  if (uniqueRefs.length === 0) return [];
  const rows: OdooInvoiceRecord[] = [];
  try {
    for (let i = 0; i < uniqueRefs.length; i += ID_CHUNK) {
      const refGroup = uniqueRefs.slice(i, i + ID_CHUNK);
      const batch = await searchReadPaged<OdooInvoiceRecord>(
        uid,
        password,
        'account.move',
        [
          ['ref', 'in', refGroup],
          ['move_type', 'in', ['in_invoice', 'in_refund', 'in_receipt']],
        ],
        [...INVOICE_FIELDS, ...INVOICE_EXTRA_FIELDS],
        'date desc, id desc'
      );
      for (const row of batch) {
        if (!knownIds.has(row.id)) rows.push(row);
      }
    }
  } catch (error) {
    warnings.push(`Peppol-facturen op referentie niet geladen (${errorMessage(error)}).`);
  }
  return rows;
}

export async function fetchAccountingDocuments(params: {
  uid: number;
  password: string;
  dateFrom: string;
  dateTo: string;
}): Promise<AccountingDocuments> {
  const { uid, password, dateFrom, dateTo } = params;
  const warnings: string[] = [];

  const invoicesResult = await Promise.allSettled([
    fetchInvoices(uid, password, dateFrom, dateTo, warnings),
    fetchBankLines(uid, password, dateFrom, dateTo),
    fetchDocumentsApp(uid, password, dateFrom, dateTo, warnings),
  ]);

  const invoices = invoicesResult[0].status === 'fulfilled' ? invoicesResult[0].value : [];
  const bankLines = invoicesResult[1].status === 'fulfilled' ? invoicesResult[1].value : [];
  const documents = invoicesResult[2].status === 'fulfilled' ? invoicesResult[2].value : [];

  if (invoicesResult[0].status === 'rejected') {
    warnings.push(`Facturen niet beschikbaar: ${errorMessage(invoicesResult[0].reason)}`);
  }
  if (invoicesResult[1].status === 'rejected') {
    warnings.push(`Bankregels niet beschikbaar: ${errorMessage(invoicesResult[1].reason)}`);
  }

  let attachments: OdooAttachmentRecord[] = [];
  try {
    attachments = await fetchAttachments(uid, password, dateFrom, dateTo, invoices, warnings);
  } catch (error) {
    warnings.push(`Bijlagen niet beschikbaar: ${errorMessage(error)}`);
  }

  const knownIds = new Set(invoices.map((invoice) => invoice.id));
  const extraFromLinks = await fetchExtraInvoices(
    uid,
    password,
    attachments,
    documents,
    knownIds,
    warnings
  );
  for (const row of extraFromLinks) knownIds.add(row.id);

  const mailRefs = attachments
    .map((row) => extractPeppolMailRef(typeof row.name === 'string' ? row.name : null))
    .filter((ref): ref is string => Boolean(ref));
  const extraFromRefs = await fetchInvoicesByRefs(uid, password, mailRefs, knownIds, warnings);
  const extraInvoices = [...extraFromLinks, ...extraFromRefs];

  return assembleAccountingDocuments({
    dateFrom,
    dateTo,
    invoices,
    attachments,
    documents,
    bankLines,
    extraInvoices,
    warnings,
  });
}
