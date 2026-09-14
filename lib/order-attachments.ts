export type OrderAttachmentsOdooCall = <T>(params: {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}) => Promise<T>;

export type AttachmentMeta = {
  id: number;
  name: string;
  mimetype?: string | false;
  res_model?: string;
  res_id?: number;
};

export type AttachmentWithData = AttachmentMeta & {
  datas?: unknown;
  raw?: unknown;
};

const BINARY_META_FIELDS = ['id', 'name', 'mimetype', 'res_model', 'res_id'] as const;
const RAW_CONTEXT = { include_binary_content: true, bin_size: false };
const DATAS_CONTEXT = { bin_size: false };
const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

export function odooJson2Url(jsonrpcUrl: string, model: string, method: string): string {
  const origin = jsonrpcUrl.replace(/\/jsonrpc\/?$/i, '').replace(/\/+$/, '');
  return `${origin}/json/2/${model}/${method}`;
}

export function isPdfAttachment(attachment: {
  name: string;
  mimetype?: string | false;
}): boolean {
  const name = attachment.name.toLowerCase();
  if (name.endsWith('.pdf')) return true;

  const mime =
    typeof attachment.mimetype === 'string' ? attachment.mimetype.toLowerCase() : '';
  return mime === 'application/pdf' || mime === 'application/x-pdf' || mime.includes('pdf');
}

export function isInvoiceAttachmentName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    (normalized.includes('order') ||
      normalized.includes('invoice') ||
      normalized.includes('factuur') ||
      normalized.startsWith('order - ')) &&
    !normalized.includes('shipping') &&
    !normalized.includes('sendcloud') &&
    !normalized.includes('label') &&
    !normalized.includes('verzending')
  );
}

export function isShippingLabelAttachmentName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.includes('shipping') ||
    normalized.includes('sendcloud') ||
    normalized.includes('label') ||
    normalized.includes('verzending')
  );
}

function isBinSizePlaceholder(data: string): boolean {
  return /^\d+(?:\.\d+)?\s*(?:bytes?|[kmg]b)?$/i.test(data.trim());
}

function decodeBinaryValue(value: unknown): Buffer | null {
  if (value == null || value === false) return null;

  if (typeof value === 'string') {
    const trimmed = value.replace(/\s/g, '');
    if (!trimmed || isBinSizePlaceholder(value) || isBinSizePlaceholder(trimmed)) return null;
    const buffer = Buffer.from(trimmed, 'base64');
    return isValidPdfBuffer(buffer) ? buffer : null;
  }

  if (typeof value === 'object') {
    return decodeBinaryValue((value as { content?: unknown }).content);
  }

  return null;
}

export function attachmentToPdfBuffer(attachment: AttachmentWithData): Buffer | null {
  return decodeBinaryValue(attachment.raw) ?? decodeBinaryValue(attachment.datas);
}

export function isValidPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.subarray(0, 4).toString() === '%PDF';
}

async function searchAttachmentMeta(
  odooCall: OrderAttachmentsOdooCall,
  uid: number,
  password: string,
  resModel: string,
  resId: number
): Promise<AttachmentMeta[]> {
  return odooCall<AttachmentMeta[]>({
    uid,
    password,
    model: 'ir.attachment',
    method: 'search_read',
    args: [
      [
        ['res_model', '=', resModel],
        ['res_id', '=', resId],
      ],
    ],
    kwargs: {
      fields: ['id', 'name', 'mimetype', 'res_model', 'res_id'],
      order: 'create_date desc',
    },
  });
}

function hasDecodablePdf(attachments: AttachmentWithData[]): boolean {
  return attachments.some((attachment) => attachmentToPdfBuffer(attachment) !== null);
}

async function readAttachmentBinaryJson2(
  apiKey: string,
  attachmentIds: number[]
): Promise<AttachmentWithData[] | null> {
  const url = odooJson2Url(ODOO_URL, 'ir.attachment', 'read');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${apiKey}`,
      'X-Odoo-Database': ODOO_DB,
    },
    body: JSON.stringify({
      ids: attachmentIds,
      fields: [...BINARY_META_FIELDS, 'raw'],
      context: RAW_CONTEXT,
    }),
  });

  if (!res.ok) return null;

  const json: unknown = await res.json();
  if (Array.isArray(json)) return json as AttachmentWithData[];
  if (
    json &&
    typeof json === 'object' &&
    'result' in json &&
    Array.isArray((json as { result?: unknown }).result)
  ) {
    return (json as { result: AttachmentWithData[] }).result;
  }
  return null;
}

async function readAttachmentBinary(
  odooCall: OrderAttachmentsOdooCall,
  uid: number,
  password: string,
  attachmentIds: number[]
): Promise<AttachmentWithData[]> {
  if (attachmentIds.length === 0) return [];

  const attempts: Array<{ fields: string[]; context: Record<string, unknown> }> = [
    {
      fields: [...BINARY_META_FIELDS, 'raw'],
      context: RAW_CONTEXT,
    },
    {
      fields: [...BINARY_META_FIELDS, 'datas'],
      context: DATAS_CONTEXT,
    },
  ];

  let lastError: unknown;
  let rpcResult: AttachmentWithData[] = [];

  for (const attempt of attempts) {
    try {
      rpcResult = await odooCall<AttachmentWithData[]>({
        uid,
        password,
        model: 'ir.attachment',
        method: 'read',
        args: [attachmentIds],
        kwargs: attempt,
      });
      if (hasDecodablePdf(rpcResult)) return rpcResult;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    const json2 = await readAttachmentBinaryJson2(password, attachmentIds);
    if (json2 && hasDecodablePdf(json2)) return json2;
  } catch (error) {
    lastError = lastError ?? error;
  }

  if (rpcResult.length > 0) return rpcResult;
  throw lastError instanceof Error ? lastError : new Error('Failed to read attachment binary');
}

export async function collectOrderAttachments(
  odooCall: OrderAttachmentsOdooCall,
  uid: number,
  password: string,
  orderId: number
): Promise<AttachmentWithData[]> {
  const numericOrderId = Number(orderId);
  if (!Number.isFinite(numericOrderId)) return [];

  const meta: AttachmentMeta[] = [];

  meta.push(
    ...(await searchAttachmentMeta(odooCall, uid, password, 'sale.order', numericOrderId))
  );

  const orders = await odooCall<Array<{ invoice_ids?: number[] }>>({
    uid,
    password,
    model: 'sale.order',
    method: 'read',
    args: [[numericOrderId], ['invoice_ids']],
  });

  for (const invoiceId of orders[0]?.invoice_ids ?? []) {
    meta.push(
      ...(await searchAttachmentMeta(odooCall, uid, password, 'account.move', invoiceId))
    );
  }

  const pickings = await odooCall<Array<{ id: number }>>({
    uid,
    password,
    model: 'stock.picking',
    method: 'search_read',
    args: [[['sale_id', '=', numericOrderId]]],
    kwargs: { fields: ['id'] },
  });

  for (const picking of pickings) {
    meta.push(
      ...(await searchAttachmentMeta(odooCall, uid, password, 'stock.picking', picking.id))
    );
  }

  const uniqueMeta = [...new Map(meta.map((attachment) => [attachment.id, attachment])).values()];
  const pdfMeta = uniqueMeta.filter(isPdfAttachment);
  if (pdfMeta.length === 0) return [];

  return readAttachmentBinary(
    odooCall,
    uid,
    password,
    pdfMeta.map((attachment) => attachment.id)
  );
}

function pickAttachment(
  attachments: AttachmentWithData[],
  matchesName: (name: string) => boolean,
  preferredModels: string[]
): AttachmentWithData | null {
  const withPdf = attachments
    .map((attachment) => ({
      attachment,
      buffer: attachmentToPdfBuffer(attachment),
    }))
    .filter((entry) => entry.buffer !== null);

  for (const model of preferredModels) {
    const match = withPdf.find(
      (entry) =>
        entry.attachment.res_model === model && matchesName(entry.attachment.name)
    );
    if (match) return match.attachment;
  }

  const namedMatch = withPdf.find((entry) => matchesName(entry.attachment.name));
  return namedMatch?.attachment ?? null;
}

export async function findOrderInvoiceAttachment(
  odooCall: OrderAttachmentsOdooCall,
  uid: number,
  password: string,
  orderId: number
): Promise<{ attachment: AttachmentWithData; buffer: Buffer } | null> {
  const attachments = await collectOrderAttachments(odooCall, uid, password, orderId);

  const invoiceAttachment = pickAttachment(
    attachments,
    isInvoiceAttachmentName,
    ['sale.order', 'account.move']
  );
  if (invoiceAttachment) {
    const buffer = attachmentToPdfBuffer(invoiceAttachment);
    if (buffer && isValidPdfBuffer(buffer)) {
      return { attachment: invoiceAttachment, buffer };
    }
  }

  const fallback = attachments
    .filter(
      (attachment) =>
        !isShippingLabelAttachmentName(attachment.name) &&
        attachmentToPdfBuffer(attachment) !== null
    )
    .sort((left, right) => {
      const leftScore = left.res_model === 'account.move' ? 0 : 1;
      const rightScore = right.res_model === 'account.move' ? 0 : 1;
      return leftScore - rightScore;
    })[0];

  if (!fallback) return null;

  const buffer = attachmentToPdfBuffer(fallback);
  if (!buffer || !isValidPdfBuffer(buffer)) return null;

  return { attachment: fallback, buffer };
}

export async function findOrderShippingLabelAttachment(
  odooCall: OrderAttachmentsOdooCall,
  uid: number,
  password: string,
  orderId: number
): Promise<{ attachment: AttachmentWithData; buffer: Buffer } | null> {
  const attachments = await collectOrderAttachments(odooCall, uid, password, orderId);

  const shippingAttachment = pickAttachment(
    attachments,
    isShippingLabelAttachmentName,
    ['stock.picking', 'sale.order']
  );
  if (!shippingAttachment) return null;

  const buffer = attachmentToPdfBuffer(shippingAttachment);
  if (!buffer || !isValidPdfBuffer(buffer)) return null;

  return { attachment: shippingAttachment, buffer };
}
