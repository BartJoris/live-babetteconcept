import type { NextApiRequest, NextApiResponse } from 'next';

// Import prompts directly to avoid potential module resolution issues
import { KINDEREN_SYSTEM_PROMPT, KINDEREN_USER_PROMPT_TEMPLATE } from '../../prompts/kinderen';
import { VOLWASSENEN_SYSTEM_PROMPT, VOLWASSENEN_USER_PROMPT_TEMPLATE } from '../../prompts/volwassenen';

// Types
type PromptCategory = 'kinderen' | 'volwassenen';

interface ProductInfo {
  name: string;
  brand?: string;
  category?: string;
  material?: string;
  color?: string;
  description?: string;
  fabricPrint?: string;
}

interface RequestBody {
  product: ProductInfo;
  sizeAttribute?: string; // MAAT Baby's, MAAT Kinderen, MAAT Tieners, MAAT Volwassenen
  customSystemPrompt?: string; // Optional custom system prompt override
}

function getPromptCategory(sizeAttribute?: string): PromptCategory {
  if (sizeAttribute === 'MAAT Volwassenen') {
    return 'volwassenen';
  }
  return 'kinderen';
}

function getSystemPrompt(category: PromptCategory): string {
  if (category === 'volwassenen') {
    return VOLWASSENEN_SYSTEM_PROMPT;
  }
  return KINDEREN_SYSTEM_PROMPT;
}

function getUserPrompt(category: PromptCategory, product: ProductInfo): string {
  if (category === 'volwassenen') {
    return VOLWASSENEN_USER_PROMPT_TEMPLATE(product);
  }
  return KINDEREN_USER_PROMPT_TEMPLATE(product);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // GET request: return available prompts for preview
  if (req.method === 'GET') {
    return res.status(200).json({
      prompts: {
        kinderen: {
          name: "Baby's, Kinderen & Tieners",
          systemPrompt: KINDEREN_SYSTEM_PROMPT,
          sizeAttributes: ['MAAT Baby\'s', 'MAAT Kinderen', 'MAAT Tieners']
        },
        volwassenen: {
          name: 'Volwassenen',
          systemPrompt: VOLWASSENEN_SYSTEM_PROMPT,
          sizeAttributes: ['MAAT Volwassenen']
        }
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'OpenAI API key not configured',
      message: 'Voeg OPENAI_API_KEY toe aan je .env.local bestand'
    });
  }

  try {
    const { product, sizeAttribute, customSystemPrompt } = req.body as RequestBody;

    if (!product || !product.name) {
      return res.status(400).json({ error: 'Product information required' });
    }

    // Determine which prompt category to use
    const promptCategory: PromptCategory = getPromptCategory(sizeAttribute);
    
    // Use custom prompt if provided, otherwise use the standard prompt for this category
    const systemPrompt = customSystemPrompt || getSystemPrompt(promptCategory);
    const userPrompt = getUserPrompt(promptCategory, product);

    console.log('🤖 Generating description for:', product.name);
    console.log('📂 Prompt category:', promptCategory);
    console.log('📝 User prompt:', userPrompt);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return res.status(response.status).json({ 
        error: 'OpenAI API error',
        details: errorData 
      });
    }

    const data = await response.json();
    const generatedDescription = data.choices[0]?.message?.content?.trim();

    if (!generatedDescription) {
      return res.status(500).json({ error: 'No description generated' });
    }

    console.log('✅ Generated description:', generatedDescription.substring(0, 100) + '...');

    return res.status(200).json({ 
      description: generatedDescription,
      product: product.name,
      promptCategory,
      systemPromptUsed: systemPrompt.substring(0, 100) + '...'
    });

  } catch (error) {
    console.error('Error generating description:', error);
    return res.status(500).json({ 
      error: 'Failed to generate description',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
