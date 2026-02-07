/**
 * AI Prompts voor productbeschrijvingen
 * 
 * Deze folder bevat alle AI prompts die gebruikt worden voor het genereren
 * van webshopteksten. De prompts zijn gescheiden per doelgroep.
 * 
 * Structuur:
 * - kinderen.ts: Prompts voor baby's, kinderen en tieners
 * - volwassenen.ts: Prompts voor volwassenen/damesmode
 */

import { KINDEREN_SYSTEM_PROMPT, KINDEREN_USER_PROMPT_TEMPLATE } from './kinderen';
import { VOLWASSENEN_SYSTEM_PROMPT, VOLWASSENEN_USER_PROMPT_TEMPLATE } from './volwassenen';

export { KINDEREN_SYSTEM_PROMPT, KINDEREN_USER_PROMPT_TEMPLATE };
export { VOLWASSENEN_SYSTEM_PROMPT, VOLWASSENEN_USER_PROMPT_TEMPLATE };

// Types voor prompt selectie
export type PromptCategory = 'kinderen' | 'volwassenen';

export interface ProductPromptInput {
  name: string;
  brand?: string;
  color?: string;
  material?: string;
  description?: string;
  fabricPrint?: string;
}

/**
 * Bepaal welke prompt categorie gebruikt moet worden op basis van sizeAttribute
 */
export function getPromptCategory(sizeAttribute?: string): PromptCategory {
  if (sizeAttribute === 'MAAT Volwassenen') {
    return 'volwassenen';
  }
  // Default naar kinderen voor: MAAT Baby's, MAAT Kinderen, MAAT Tieners, of geen attribute
  return 'kinderen';
}

/**
 * Haal de juiste system prompt op basis van categorie
 */
export function getSystemPrompt(category: PromptCategory): string {
  if (category === 'volwassenen') {
    return VOLWASSENEN_SYSTEM_PROMPT;
  }
  return KINDEREN_SYSTEM_PROMPT;
}

/**
 * Genereer de user prompt op basis van categorie en product info
 */
export function getUserPrompt(category: PromptCategory, product: ProductPromptInput): string {
  if (category === 'volwassenen') {
    return VOLWASSENEN_USER_PROMPT_TEMPLATE(product);
  }
  return KINDEREN_USER_PROMPT_TEMPLATE(product);
}
