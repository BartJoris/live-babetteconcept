import {
  categorizeMove,
  dateOnly,
  many2oneId,
  many2oneName,
  type ActionCategory,
} from '@/lib/accounting/insights';

export const INVOICE_MOVE_TYPES = [
  'in_invoice',
  'in_refund',
  'out_invoice',
  'out_refund',
  'in_receipt',
  'out_receipt',
] as const;

const VENDOR_BILL_TYPES = new Set<string>(['in_invoice', 'in_refund', 'in_receipt']);

const ODOO_WEB = 'https://www.babetteconcept.be/web';

export type DocumentSource = 'documents.document' | 'ir.attachment';

export type MissingSupportKind = 'missing_invoice' | 'missing_document';

export type MissingSupportRowType = 'bank_line' | 'vendor_bill';

export type PeppolMoveState = 'ready' | 'to_send' | 'processing' | 'done' | 'error';

export type PeppolLinkStatus = 'linked' | 'unlinked' | 'invoice_without_file' | 'mismatch';

export type PeppolOrigin = 'mail_xml' | 'ubl_xml' | 'invoice';

export type OdooInvoiceRecord = {
  id: number;
  name?: string;
  date?: string;
  state?: string;
  amount_total_signed?: number;
  amount_total?: number;
  ref?: string | false;
  partner_id?: unknown;
  journal_id?: unknown;
  move_type?: string;
  message_main_attachment_id?: unknown;
  attachment_ids?: number[] | false;
  peppol_move_state?: string | false;
  peppol_message_uuid?: string | false;
  ubl_cii_xml_id?: unknown;
  ubl_cii_xml_filename?: string | false;
};

export type OdooAttachmentRecord = {
  id: number;
  name?: string;
  mimetype?: string | false;
  res_model?: string | false;
  res_id?: number | false;
  create_date?: string;
  file_size?: number | false;
};

export type OdooDocumentRecord = {
  id: number;
  name?: string;
  mimetype?: string | false;
  res_model?: string | false;
  res_id?: number | false;
  partner_id?: unknown;
  folder_id?: unknown;
  create_date?: string;
  attachment_id?: unknown;
  file_size?: number | false;
  type?: string;
};

export type OdooBankLineRecord = {
  id: number;
  date?: string;
  amount?: number;
  payment_ref?: string | false;
  partner_id?: unknown;
  journal_id?: unknown;
  is_reconciled?: boolean;
  move_id?: unknown;
  ref?: string | false;
  state?: string;
};

export type UploadedDocument = {
  id: number;
  source: DocumentSource;
  name: string;
  createDate: string | null;
  mimetype: string | null;
  fileSize: number | null;
  partnerName: string | null;
  folderName: string | null;
  invoiceId: number | null;
  invoiceName: string | null;
  invoiceDate: string | null;
  linked: boolean;
  isPeppol: boolean;
  peppolLinkStatus: PeppolLinkStatus | null;
  odooHref: string;
};

export type InvoiceWithDocument = {
  id: number;
  name: string | null;
  date: string;
  category: ActionCategory;
  amount: number;
  state: string;
  partnerName: string | null;
  ref: string | null;
  documentCount: number;
  documentName: string | null;
  isPeppolInbound: boolean;
  peppolMoveState: PeppolMoveState | null;
  peppolLinkStatus: PeppolLinkStatus | null;
  odooHref: string;
};

export type MissingSupportRow = {
  id: number;
  rowType: MissingSupportRowType;
  kind: MissingSupportKind;
  date: string;
  name: string | null;
  amount: number;
  state: string;
  partnerName: string | null;
  journalName: string | null;
  ref: string | null;
  isPeppolInbound: boolean;
  odooHref: string;
};

export type PeppolInboundRow = {
  id: string;
  origin: PeppolOrigin;
  date: string | null;
  fileName: string | null;
  fileHref: string | null;
  invoiceId: number | null;
  invoiceName: string | null;
  invoiceRef: string | null;
  invoiceHref: string | null;
  partnerName: string | null;
  peppolState: PeppolMoveState | null;
  peppolStateRaw: string | null;
  linkStatus: PeppolLinkStatus;
};

export type AccountingDocuments = {
  dateFrom: string;
  dateTo: string;
  uploaded: UploadedDocument[];
  invoicesWithDocument: InvoiceWithDocument[];
  missingSupport: MissingSupportRow[];
  peppolInbound: PeppolInboundRow[];
  warnings: string[];
};

export function odooFormHref(model: string, id: number): string {
  return `${ODOO_WEB}#id=${id}&model=${model}&view_type=form`;
}

export function documentSourceLabel(source: DocumentSource): string {
  switch (source) {
    case 'documents.document':
      return 'Odoo Documenten';
    case 'ir.attachment':
      return 'Bijlage';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function missingSupportKindLabel(kind: MissingSupportKind): string {
  switch (kind) {
    case 'missing_invoice':
      return 'Geen factuur afgeletterd';
    case 'missing_document':
      return 'Geen document/PDF';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function missingSupportRowTypeLabel(rowType: MissingSupportRowType): string {
  switch (rowType) {
    case 'bank_line':
      return 'Bankregel';
    case 'vendor_bill':
      return 'Aankoopfactuur';
    default: {
      const _exhaustive: never = rowType;
      return _exhaustive;
    }
  }
}

export function peppolLinkStatusLabel(status: PeppolLinkStatus): string {
  switch (status) {
    case 'linked':
      return 'Juist gekoppeld';
    case 'unlinked':
      return 'Bestand zonder factuur';
    case 'invoice_without_file':
      return 'Factuur zonder XML';
    case 'mismatch':
      return 'Koppeling klopt niet';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function peppolOriginLabel(origin: PeppolOrigin): string {
  switch (origin) {
    case 'mail_xml':
      return 'Peppol-bestand (MAIL)';
    case 'ubl_xml':
      return 'UBL op factuur';
    case 'invoice':
      return 'Peppol-factuur';
    default: {
      const _exhaustive: never = origin;
      return _exhaustive;
    }
  }
}

export function parsePeppolMoveState(value: unknown): PeppolMoveState | null {
  if (value === 'ready') return 'ready';
  if (value === 'to_send') return 'to_send';
  if (value === 'processing') return 'processing';
  if (value === 'done') return 'done';
  if (value === 'error') return 'error';
  return null;
}

export function peppolMoveStateLabel(state: PeppolMoveState | null, raw?: string | null): string {
  if (state == null) return raw && raw.trim() ? raw : '—';
  switch (state) {
    case 'ready':
      return 'Klaar om te versturen';
    case 'to_send':
      return 'In wachtrij (uitgaand)';
    case 'processing':
      return 'Wacht op ontvangst';
    case 'done':
      return 'Verwerkt';
    case 'error':
      return 'Fout';
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function isVendorBillType(moveType: string | undefined): boolean {
  return Boolean(moveType && VENDOR_BILL_TYPES.has(moveType));
}

export function extractPeppolMailRef(name: string | null | undefined): string | null {
  if (!name) return null;
  const match = name.trim().match(/^MAIL_(.+)\.xml$/i);
  const ref = match?.[1]?.trim();
  return ref ? ref : null;
}

export function isPeppolInboundFileName(name: string | null, mimetype: string | null): boolean {
  if (extractPeppolMailRef(name)) return true;
  const n = (name ?? '').toLowerCase();
  if (n.includes('peppol')) return true;
  if (n.includes('ubl') && n.endsWith('.xml')) return true;
  const mime = (mimetype ?? '').toLowerCase();
  return mime.includes('xml') && n.startsWith('mail_') && n.endsWith('.xml');
}

export function isPeppolInboundInvoice(invoice: OdooInvoiceRecord): boolean {
  if (!isVendorBillType(invoice.move_type)) return false;
  return Boolean(asText(invoice.peppol_move_state) || asText(invoice.peppol_message_uuid));
}

export function ublFilenameMatchesRef(filename: string | null, ref: string | null): boolean {
  if (!filename || !ref) return false;
  const base = filename.replace(/\.xml$/i, '').trim();
  const needle = ref.trim();
  if (!needle) return false;
  return base === needle || filename.includes(needle);
}

export function invoiceHasPeppolXml(invoice: OdooInvoiceRecord): boolean {
  if (many2oneId(invoice.ubl_cii_xml_id) != null) return true;
  return Boolean(asText(invoice.ubl_cii_xml_filename));
}

export function peppolStatusForMatchedInvoice(invoice: OdooInvoiceRecord, mailRef: string): PeppolLinkStatus {
  if (!isVendorBillType(invoice.move_type) || !mailRef.trim()) return 'mismatch';
  if (!invoiceHasPeppolXml(invoice)) return 'mismatch';
  return 'linked';
}

export function peppolNeedsAttention(status: PeppolLinkStatus): boolean {
  switch (status) {
    case 'linked':
      return false;
    case 'unlinked':
    case 'invoice_without_file':
    case 'mismatch':
      return true;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function matchesQuery(
  fields: Array<string | null | undefined>,
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => Boolean(field && field.toLowerCase().includes(q)));
}

export function invoiceHasDocument(
  invoice: OdooInvoiceRecord,
  attachmentIdsByMove: Map<number, number[]>,
  documentIdsByMove: Map<number, number[]>
): boolean {
  if (many2oneId(invoice.message_main_attachment_id) != null) return true;
  if (Array.isArray(invoice.attachment_ids) && invoice.attachment_ids.length > 0) return true;
  if ((attachmentIdsByMove.get(invoice.id) ?? []).length > 0) return true;
  if ((documentIdsByMove.get(invoice.id) ?? []).length > 0) return true;
  return false;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return null;
}

function invoiceAmount(invoice: OdooInvoiceRecord): number {
  return invoice.amount_total_signed != null
    ? asNumber(invoice.amount_total_signed)
    : asNumber(invoice.amount_total);
}

function byDateDesc<T extends { date?: string | null; createDate?: string | null }>(
  a: T,
  b: T
): number {
  const dateA = a.date ?? a.createDate ?? '';
  const dateB = b.date ?? b.createDate ?? '';
  if (dateA === dateB) return 0;
  return dateA < dateB ? 1 : -1;
}

function collectLinkedMoveId(
  resModel: string | null,
  resId: number | null
): number | null {
  if (resModel === 'account.move' && resId != null && resId > 0) return resId;
  return null;
}

export function assemblePeppolInbound(params: {
  invoices: OdooInvoiceRecord[];
  extraInvoices?: OdooInvoiceRecord[];
  attachments: OdooAttachmentRecord[];
}): PeppolInboundRow[] {
  const allInvoices = [...params.invoices, ...(params.extraInvoices ?? [])];
  const invoiceByRef = new Map<string, OdooInvoiceRecord>();
  for (const invoice of allInvoices) {
    const ref = asText(invoice.ref);
    if (!ref || !isVendorBillType(invoice.move_type)) continue;
    const existing = invoiceByRef.get(ref);
    if (!existing || isPeppolInboundInvoice(invoice)) invoiceByRef.set(ref, invoice);
  }

  const coveredInvoiceIds = new Set<number>();
  const rows: PeppolInboundRow[] = [];

  for (const attachment of params.attachments) {
    const name = asText(attachment.name);
    const mailRef = extractPeppolMailRef(name);
    if (!mailRef) continue;
    const invoice = invoiceByRef.get(mailRef);
    if (invoice) coveredInvoiceIds.add(invoice.id);
    const linkStatus: PeppolLinkStatus = invoice
      ? peppolStatusForMatchedInvoice(invoice, mailRef)
      : 'unlinked';
    const peppolState = invoice ? parsePeppolMoveState(invoice.peppol_move_state) : null;
    rows.push({
      id: `mail-xml-${attachment.id}`,
      origin: 'mail_xml',
      date: dateOnly(attachment.create_date) ?? (invoice ? dateOnly(invoice.date) : null),
      fileName: name,
      fileHref: odooFormHref('ir.attachment', attachment.id),
      invoiceId: invoice?.id ?? null,
      invoiceName: invoice ? asText(invoice.name) : null,
      invoiceRef: invoice ? asText(invoice.ref) : mailRef,
      invoiceHref: invoice ? odooFormHref('account.move', invoice.id) : null,
      partnerName: invoice ? many2oneName(invoice.partner_id) : null,
      peppolState,
      peppolStateRaw: invoice ? asText(invoice.peppol_move_state) : null,
      linkStatus,
    });
  }

  for (const invoice of params.invoices) {
    if (!isPeppolInboundInvoice(invoice)) continue;
    if (coveredInvoiceIds.has(invoice.id)) continue;
    const hasXml = invoiceHasPeppolXml(invoice);
    const ublId = many2oneId(invoice.ubl_cii_xml_id);
    const ublName = asText(invoice.ubl_cii_xml_filename) ?? many2oneName(invoice.ubl_cii_xml_id);
    const ref = asText(invoice.ref);
    rows.push({
      id: hasXml ? `ubl-${invoice.id}` : `invoice-${invoice.id}`,
      origin: hasXml ? 'ubl_xml' : 'invoice',
      date: dateOnly(invoice.date),
      fileName: ublName,
      fileHref: ublId != null ? odooFormHref('ir.attachment', ublId) : null,
      invoiceId: invoice.id,
      invoiceName: asText(invoice.name),
      invoiceRef: ref,
      invoiceHref: odooFormHref('account.move', invoice.id),
      partnerName: many2oneName(invoice.partner_id),
      peppolState: parsePeppolMoveState(invoice.peppol_move_state),
      peppolStateRaw: asText(invoice.peppol_move_state),
      linkStatus: hasXml ? 'linked' : 'invoice_without_file',
    });
  }

  rows.sort((a, b) => {
    const dateCmp = byDateDesc(a, b);
    if (dateCmp !== 0) return dateCmp;
    return (a.fileName ?? a.invoiceName ?? '').localeCompare(b.fileName ?? b.invoiceName ?? '', 'nl');
  });
  return rows;
}

export function assembleAccountingDocuments(params: {
  dateFrom: string;
  dateTo: string;
  invoices: OdooInvoiceRecord[];
  attachments: OdooAttachmentRecord[];
  documents: OdooDocumentRecord[];
  bankLines: OdooBankLineRecord[];
  extraInvoices?: OdooInvoiceRecord[];
  warnings?: string[];
}): AccountingDocuments {
  const invoiceById = new Map<number, OdooInvoiceRecord>();
  const invoiceByRef = new Map<string, OdooInvoiceRecord>();
  const ublXmlAttachmentIds = new Set<number>();
  for (const invoice of [...params.invoices, ...(params.extraInvoices ?? [])]) {
    invoiceById.set(invoice.id, invoice);
    const ref = asText(invoice.ref);
    if (ref && isVendorBillType(invoice.move_type)) {
      const existing = invoiceByRef.get(ref);
      if (!existing || isPeppolInboundInvoice(invoice)) invoiceByRef.set(ref, invoice);
    }
    const ublId = many2oneId(invoice.ubl_cii_xml_id);
    if (ublId != null) ublXmlAttachmentIds.add(ublId);
  }

  const attachmentIdsByMove = new Map<number, number[]>();
  for (const attachment of params.attachments) {
    const moveId = collectLinkedMoveId(
      asText(attachment.res_model),
      asId(attachment.res_id)
    );
    if (moveId == null) continue;
    const list = attachmentIdsByMove.get(moveId) ?? [];
    list.push(attachment.id);
    attachmentIdsByMove.set(moveId, list);
  }

  const documentIdsByMove = new Map<number, number[]>();
  for (const document of params.documents) {
    const moveId = collectLinkedMoveId(asText(document.res_model), asId(document.res_id));
    if (moveId == null) continue;
    const list = documentIdsByMove.get(moveId) ?? [];
    list.push(document.id);
    documentIdsByMove.set(moveId, list);
  }

  const uploadedByKey = new Map<string, UploadedDocument>();

  const putUploaded = (row: UploadedDocument, aliasKeys: string[]) => {
    const keys = [`${row.source}:${row.id}`, ...aliasKeys];
    const existing = keys.map((key) => uploadedByKey.get(key)).find(Boolean);
    const merged: UploadedDocument = existing
      ? {
          ...row,
          ...existing,
          source: existing.source === 'documents.document' ? existing.source : row.source,
          odooHref:
            existing.source === 'documents.document' ? existing.odooHref : row.odooHref,
          id: existing.source === 'documents.document' ? existing.id : row.id,
          invoiceId: existing.invoiceId ?? row.invoiceId,
          invoiceName: existing.invoiceName ?? row.invoiceName,
          invoiceDate: existing.invoiceDate ?? row.invoiceDate,
          partnerName: existing.partnerName ?? row.partnerName,
          folderName: existing.folderName ?? row.folderName,
          linked: existing.linked || row.linked,
          name: existing.name || row.name,
          isPeppol: existing.isPeppol || row.isPeppol,
          peppolLinkStatus: existing.peppolLinkStatus ?? row.peppolLinkStatus,
        }
      : row;
    const keysToWrite = new Set(keys);
    if (existing) {
      for (const [key, value] of uploadedByKey) {
        if (value === existing) keysToWrite.add(key);
      }
    }
    for (const key of keysToWrite) uploadedByKey.set(key, merged);
  };

  for (const document of params.documents) {
    const attachmentId = many2oneId(document.attachment_id);
    const invoiceId = collectLinkedMoveId(asText(document.res_model), asId(document.res_id));
    const invoice = invoiceId != null ? invoiceById.get(invoiceId) : undefined;
    const name = asText(document.name) ?? (attachmentId != null ? `Bijlage ${attachmentId}` : `Document ${document.id}`);
    const isPeppol =
      isPeppolInboundFileName(name, asText(document.mimetype)) ||
      (invoice != null && isPeppolInboundInvoice(invoice));
    putUploaded(
      {
        id: document.id,
        source: 'documents.document',
        name,
        createDate: dateOnly(document.create_date),
        mimetype: asText(document.mimetype),
        fileSize: document.file_size == null || document.file_size === false ? null : asNumber(document.file_size),
        partnerName: many2oneName(document.partner_id) ?? many2oneName(invoice?.partner_id),
        folderName: many2oneName(document.folder_id),
        invoiceId,
        invoiceName: invoice ? asText(invoice.name) : invoiceId != null ? `Factuur ${invoiceId}` : null,
        invoiceDate: invoice ? dateOnly(invoice.date) : null,
        linked: invoiceId != null,
        isPeppol,
        peppolLinkStatus: isPeppol
          ? invoice
            ? invoiceHasPeppolXml(invoice) || invoiceId != null
              ? 'linked'
              : 'mismatch'
            : 'unlinked'
          : null,
        odooHref: odooFormHref('documents.document', document.id),
      },
      attachmentId != null ? [`ir.attachment:${attachmentId}`] : []
    );
  }

  for (const attachment of params.attachments) {
    const resInvoiceId = collectLinkedMoveId(
      asText(attachment.res_model),
      asId(attachment.res_id)
    );
    const name = asText(attachment.name) ?? `Bijlage ${attachment.id}`;
    const mailRef = extractPeppolMailRef(name);
    const matchedByRef = mailRef ? invoiceByRef.get(mailRef) : undefined;
    const invoiceId = resInvoiceId ?? matchedByRef?.id ?? null;
    const invoice = invoiceId != null ? invoiceById.get(invoiceId) : undefined;
    const isPeppol =
      Boolean(mailRef) ||
      ublXmlAttachmentIds.has(attachment.id) ||
      isPeppolInboundFileName(name, asText(attachment.mimetype)) ||
      (invoice != null && isPeppolInboundInvoice(invoice));
    const peppolLinkStatus: PeppolLinkStatus | null = mailRef
      ? matchedByRef
        ? peppolStatusForMatchedInvoice(matchedByRef, mailRef)
        : 'unlinked'
      : isPeppol
        ? invoice
          ? invoiceHasPeppolXml(invoice) || resInvoiceId != null
            ? 'linked'
            : 'mismatch'
          : 'unlinked'
        : null;
    putUploaded(
      {
        id: attachment.id,
        source: 'ir.attachment',
        name,
        createDate: dateOnly(attachment.create_date),
        mimetype: asText(attachment.mimetype),
        fileSize: attachment.file_size == null || attachment.file_size === false ? null : asNumber(attachment.file_size),
        partnerName: many2oneName(invoice?.partner_id),
        folderName: null,
        invoiceId,
        invoiceName: invoice ? asText(invoice.name) : invoiceId != null ? `Factuur ${invoiceId}` : null,
        invoiceDate: invoice ? dateOnly(invoice.date) : null,
        linked: peppolLinkStatus === 'linked' || resInvoiceId != null,
        isPeppol,
        peppolLinkStatus,
        odooHref: odooFormHref('ir.attachment', attachment.id),
      },
      []
    );
  }

  const uploaded = [...new Set(uploadedByKey.values())].sort((a, b) => {
    const dateCmp = byDateDesc(a, b);
    if (dateCmp !== 0) return dateCmp;
    return a.name.localeCompare(b.name, 'nl');
  });

  const invoicesWithDocument: InvoiceWithDocument[] = [];
  const missingSupport: MissingSupportRow[] = [];

  for (const invoice of params.invoices) {
    const date = dateOnly(invoice.date);
    if (!date) continue;
    const state = asText(invoice.state) ?? '';
    const journalName = many2oneName(invoice.journal_id);
    const name = asText(invoice.name);
    const ref = asText(invoice.ref);
    const category = categorizeMove(invoice.move_type, journalName, name, ref);
    const attachmentIds = attachmentIdsByMove.get(invoice.id) ?? [];
    const documentIds = documentIdsByMove.get(invoice.id) ?? [];
    const mainAttachmentId = many2oneId(invoice.message_main_attachment_id);
    const documentCount = new Set([
      ...attachmentIds,
      ...documentIds,
      ...(mainAttachmentId != null ? [mainAttachmentId] : []),
      ...(Array.isArray(invoice.attachment_ids) ? invoice.attachment_ids : []),
    ]).size;
    const hasDocument = invoiceHasDocument(invoice, attachmentIdsByMove, documentIdsByMove);

    if (hasDocument) {
      const mainName = many2oneName(invoice.message_main_attachment_id);
      const firstAttachment = params.attachments.find((row) => attachmentIds.includes(row.id));
      const firstDocument = params.documents.find((row) => documentIds.includes(row.id));
      invoicesWithDocument.push({
        id: invoice.id,
        name,
        date,
        category,
        amount: invoiceAmount(invoice),
        state,
        partnerName: many2oneName(invoice.partner_id),
        ref,
        documentCount,
        documentName:
          mainName ?? asText(firstDocument?.name) ?? asText(firstAttachment?.name),
        isPeppolInbound: isPeppolInboundInvoice(invoice),
        peppolMoveState: parsePeppolMoveState(invoice.peppol_move_state),
        peppolLinkStatus: isPeppolInboundInvoice(invoice)
          ? invoiceHasPeppolXml(invoice)
            ? 'linked'
            : 'invoice_without_file'
          : null,
        odooHref: odooFormHref('account.move', invoice.id),
      });
    } else if (isVendorBillType(invoice.move_type) && state !== 'cancel') {
      missingSupport.push({
        id: invoice.id,
        rowType: 'vendor_bill',
        kind: 'missing_document',
        date,
        name,
        amount: invoiceAmount(invoice),
        state,
        partnerName: many2oneName(invoice.partner_id),
        journalName,
        ref,
        isPeppolInbound: isPeppolInboundInvoice(invoice),
        odooHref: odooFormHref('account.move', invoice.id),
      });
    }
  }

  for (const line of params.bankLines) {
    if (line.is_reconciled) continue;
    const date = dateOnly(line.date);
    if (!date) continue;
    const state = asText(line.state) ?? 'open';
    if (state === 'cancel') continue;
    missingSupport.push({
      id: line.id,
      rowType: 'bank_line',
      kind: 'missing_invoice',
      date,
      name: asText(line.payment_ref),
      amount: asNumber(line.amount),
      state,
      partnerName: many2oneName(line.partner_id),
      journalName: many2oneName(line.journal_id),
      ref: asText(line.ref),
      isPeppolInbound: false,
      odooHref: odooFormHref('account.bank.statement.line', line.id),
    });
  }

  invoicesWithDocument.sort((a, b) => byDateDesc(a, b));
  missingSupport.sort((a, b) => byDateDesc(a, b));

  const peppolInbound = assemblePeppolInbound({
    invoices: params.invoices,
    extraInvoices: params.extraInvoices,
    attachments: params.attachments,
  });

  return {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    uploaded,
    invoicesWithDocument,
    missingSupport,
    peppolInbound,
    warnings: params.warnings ?? [],
  };
}
