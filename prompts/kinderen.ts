/**
 * AI Prompt voor Baby's en Kinderen producten
 * Gebruikt voor: MAAT Baby's, MAAT Kinderen, MAAT Tieners
 *
 * Deelbaar met de Babette.concept ChatGPT-stijl (zie prompts/babette.ts).
 */

import {
  BABETTE_SYSTEM_PROMPT,
  BABETTE_USER_PROMPT_TEMPLATE,
  type BabetteProductPromptInput,
} from './babette';

export const KINDEREN_SYSTEM_PROMPT = BABETTE_SYSTEM_PROMPT;

export const KINDEREN_USER_PROMPT_TEMPLATE = (
  product: BabetteProductPromptInput,
) => BABETTE_USER_PROMPT_TEMPLATE(product);
