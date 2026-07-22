/**
 * AI Prompt voor Volwassenen producten
 * Gebruikt voor: MAAT Volwassenen
 *
 * Zelfde Babette.concept schrijfstijl als kinderen (zie prompts/babette.ts).
 */

import {
  BABETTE_SYSTEM_PROMPT,
  BABETTE_USER_PROMPT_TEMPLATE,
  type BabetteProductPromptInput,
} from './babette';

export const VOLWASSENEN_SYSTEM_PROMPT = BABETTE_SYSTEM_PROMPT;

export const VOLWASSENEN_USER_PROMPT_TEMPLATE = (
  product: BabetteProductPromptInput,
) => BABETTE_USER_PROMPT_TEMPLATE(product);
