import { describe, expect, it } from 'vitest';
import {
  attachmentToPdfBuffer,
  collectOrderAttachments,
  findOrderInvoiceAttachment,
  findOrderShippingLabelAttachment,
  isInvoiceAttachmentName,
  isPdfAttachment,
  isShippingLabelAttachmentName,
  isValidPdfBuffer,
  odooJson2Url,
  type OrderAttachmentsOdooCall,
} from './order-attachments';

const SAMPLE_PDF_BASE64 =
  'JVBERi0xLjQKJcOkw7zDtsO4CjEgMCBvYmogPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago=';

function domainResId(args: unknown[]): unknown {
  const domain = args[0];
  if (!Array.isArray(domain)) return undefined;
  const clause = domain.find((item) => Array.isArray(item) && item[0] === 'res_id');
  return Array.isArray(clause) ? clause[2] : undefined;
}

type OrderAttachmentsOdooCallParams = {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
};

describe('order attachment helpers', () => {
  it('builds the Odoo JSON-2 attachment read URL from jsonrpc', () => {
    expect(odooJson2Url('https://www.babetteconcept.be/jsonrpc', 'ir.attachment', 'read')).toBe(
      'https://www.babetteconcept.be/json/2/ir.attachment/read'
    );
  });

  it('detects pdf attachments by name and mimetype', () => {
    expect(isPdfAttachment({ name: 'Order.pdf', mimetype: false })).toBe(true);
    expect(isPdfAttachment({ name: 'label.txt', mimetype: 'application/pdf' })).toBe(true);
    expect(isPdfAttachment({ name: 'notes.txt', mimetype: 'text/plain' })).toBe(false);
  });

  it('classifies invoice and shipping label names', () => {
    expect(isInvoiceAttachmentName('Order - SO123.pdf')).toBe(true);
    expect(isInvoiceAttachmentName('Sendcloud shipping label.pdf')).toBe(false);
    expect(isShippingLabelAttachmentName('Sendcloud shipping label.pdf')).toBe(true);
  });

  it('rejects bin_size placeholders and accepts 19.3 raw dict content', () => {
    expect(attachmentToPdfBuffer({ id: 1, name: 'Order.pdf', datas: '4.2 Kb' })).toBeNull();

    const fromDatas = attachmentToPdfBuffer({
      id: 1,
      name: 'Order.pdf',
      datas: SAMPLE_PDF_BASE64,
    });
    expect(fromDatas).toBeTruthy();
    expect(isValidPdfBuffer(fromDatas!)).toBe(true);

    const fromRawDict = attachmentToPdfBuffer({
      id: 2,
      name: 'Order.pdf',
      raw: { filename: 'Order.pdf', content: SAMPLE_PDF_BASE64, size: 80 },
    });
    expect(fromRawDict).toBeTruthy();
    expect(isValidPdfBuffer(fromRawDict!)).toBe(true);
  });

  it('reads attachments via raw, not the removed datas field', async () => {
    const odooCall: OrderAttachmentsOdooCall = async <T>(params: OrderAttachmentsOdooCallParams) => {
      switch (`${params.model}:${params.method}`) {
        case 'ir.attachment:search_read':
          if (domainResId(params.args) === 42) {
            return [
              {
                id: 10,
                name: 'Order - SO42.pdf',
                mimetype: 'application/pdf',
                res_model: 'sale.order',
                res_id: 42,
              },
            ] as T;
          }
          if (domainResId(params.args) === 900) {
            return [
              {
                id: 11,
                name: 'Sendcloud label SO42.pdf',
                mimetype: 'application/pdf',
                res_model: 'stock.picking',
                res_id: 900,
              },
            ] as T;
          }
          return [] as T;
        case 'sale.order:read':
          return [{ invoice_ids: [] }] as T;
        case 'stock.picking:search_read':
          return [{ id: 900 }] as T;
        case 'ir.attachment:read': {
          const fields = params.kwargs?.fields;
          expect(Array.isArray(fields) && fields.includes('raw')).toBe(true);
          expect(Array.isArray(fields) && fields.includes('datas')).toBe(false);
          return [
            {
              id: 10,
              name: 'Order - SO42.pdf',
              mimetype: 'application/pdf',
              raw: { filename: 'Order - SO42.pdf', content: SAMPLE_PDF_BASE64, size: 80 },
              res_model: 'sale.order',
              res_id: 42,
            },
            {
              id: 11,
              name: 'Sendcloud label SO42.pdf',
              mimetype: 'application/pdf',
              raw: { filename: 'Sendcloud label SO42.pdf', content: SAMPLE_PDF_BASE64, size: 80 },
              res_model: 'stock.picking',
              res_id: 900,
            },
          ] as T;
        }
        default:
          throw new Error(`Unexpected call ${params.model}.${params.method}`);
      }
    };

    const attachments = await collectOrderAttachments(odooCall, 1, 'secret', 42);
    expect(attachments).toHaveLength(2);
    expect((await findOrderInvoiceAttachment(odooCall, 1, 'secret', 42))?.attachment.name).toBe(
      'Order - SO42.pdf'
    );
    expect((await findOrderShippingLabelAttachment(odooCall, 1, 'secret', 42))?.attachment.name).toBe(
      'Sendcloud label SO42.pdf'
    );
  });
});
