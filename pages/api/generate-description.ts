import type { NextApiRequest, NextApiResponse } from 'next';

import { KINDEREN_SYSTEM_PROMPT, KINDEREN_USER_PROMPT_TEMPLATE } from '../../prompts/kinderen';
import { VOLWASSENEN_SYSTEM_PROMPT, VOLWASSENEN_USER_PROMPT_TEMPLATE } from '../../prompts/volwassenen';
import type { BabetteProductPromptInput } from '../../prompts/babette';

type PromptCategory = 'kinderen' | 'volwassenen';

interface RequestBody {
  product: BabetteProductPromptInput;
  sizeAttribute?: string;
  customSystemPrompt?: string;
}

function getPromptCategory(sizeAttribute?: string): PromptCategory {
  if (sizeAttribute === 'MAAT Volwassenen') {
    return 'volwassenen';
  }
  return 'kinderen';
}

function getSystemPrompt(category: PromptCategory): string {
  return category === 'volwassenen'
    ? VOLWASSENEN_SYSTEM_PROMPT
    : KINDEREN_SYSTEM_PROMPT;
}

function getUserPrompt(
  category: PromptCategory,
  product: BabetteProductPromptInput,
): string {
  return category === 'volwassenen'
    ? VOLWASSENEN_USER_PROMPT_TEMPLATE(product)
    : KINDEREN_USER_PROMPT_TEMPLATE(product);
}

function extractResponsesText(data: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string | null {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const texts: string[] = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (
        (part.type === 'output_text' || part.type === 'text') &&
        typeof part.text === 'string'
      ) {
        texts.push(part.text);
      }
    }
  }
  const joined = texts.join('\n').trim();
  return joined || null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    return res.status(200).json({
      prompts: {
        kinderen: {
          name: "Baby's, Kinderen & Tieners",
          systemPrompt: KINDEREN_SYSTEM_PROMPT,
          sizeAttributes: ["MAAT Baby's", 'MAAT Kinderen', 'MAAT Tieners'],
        },
        volwassenen: {
          name: 'Volwassenen',
          systemPrompt: VOLWASSENEN_SYSTEM_PROMPT,
          sizeAttributes: ['MAAT Volwassenen'],
        },
      },
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OpenAI API key not configured',
      message: 'Voeg OPENAI_API_KEY toe aan je .env.local bestand',
    });
  }

  try {
    const { product, sizeAttribute, customSystemPrompt } =
      req.body as RequestBody;

    if (!product || !product.name) {
      return res.status(400).json({ error: 'Product information required' });
    }

    const promptCategory = getPromptCategory(sizeAttribute);
    const systemPrompt = customSystemPrompt || getSystemPrompt(promptCategory);
    const userPrompt = getUserPrompt(promptCategory, product);
    const model = process.env.OPENAI_DESCRIPTION_MODEL || 'gpt-5.5';

    console.log('🤖 Generating description for:', product.name);
    console.log('📂 Prompt category:', promptCategory);
    console.log('🧠 Model:', model);
    console.log('📝 User prompt:', userPrompt);

    // Responses API — same shape as the ChatGPT / prompt.txt workflow
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        reasoning: { effort: 'low' },
        max_output_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI Responses API error:', errorData);
      return res.status(response.status).json({
        error: 'OpenAI API error',
        details: errorData,
      });
    }

    const data = await response.json();
    const generatedDescription = extractResponsesText(data);

    if (!generatedDescription) {
      console.error('Unexpected Responses payload:', JSON.stringify(data).slice(0, 500));
      return res.status(500).json({ error: 'No description generated' });
    }

    console.log(
      '✅ Generated description:',
      generatedDescription.substring(0, 100) + '...',
    );

    return res.status(200).json({
      description: generatedDescription,
      product: product.name,
      promptCategory,
      model,
      systemPromptUsed: systemPrompt.substring(0, 100) + '...',
    });
  } catch (error) {
    console.error('Error generating description:', error);
    return res.status(500).json({
      error: 'Failed to generate description',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
