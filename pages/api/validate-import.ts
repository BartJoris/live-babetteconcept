import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { OdooValidationService } from '@/lib/import/services';
import { z } from 'zod';

const validateRequestSchema = z.object({
  validations: z.array(z.object({
    templateId: z.number(),
    expected: z.object({
      name: z.string(),
      categoryId: z.number(),
      brandName: z.string(),
      variantCount: z.number(),
      publicCategoryIds: z.array(z.number()).optional(),
      tagIds: z.array(z.number()).optional(),
      isPublished: z.boolean(),
      hasImages: z.boolean(),
    }),
  })).min(1),
});

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validation = validateRequestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid input', details: validation.error.issues });
  }

  try {
    const { uid, password } = req.session.user!;
    const service = new OdooValidationService(uid, password);

    const results = await service.validateBatch(validation.data.validations);

    return res.status(200).json({
      success: true,
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.overallStatus === 'pass').length,
        warnings: results.filter(r => r.overallStatus === 'warning').length,
        failed: results.filter(r => r.overallStatus === 'fail').length,
      },
    });
  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({
      error: 'Validation failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export default withAuth(handler);
