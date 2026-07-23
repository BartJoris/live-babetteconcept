import { tool, type ToolSet } from 'ai';
import { getToolsByAccess, executeTool, type McpToolDefinition } from '@/lib/mcp/tools';

/**
 * Expose read-only MCP tools to the AI SDK tool-calling loop.
 * Same executors as /api/mcp — no separate business logic.
 */
export function createMcpAiTools(): ToolSet {
  const tools: ToolSet = {};

  for (const def of getToolsByAccess('read')) {
    tools[def.name] = mcpToolToAiTool(def);
  }

  return tools;
}

function mcpToolToAiTool(def: McpToolDefinition) {
  return tool({
    description: def.description,
    inputSchema: def.inputSchema,
    execute: async (input) => {
      const args =
        input && typeof input === 'object'
          ? (input as Record<string, unknown>)
          : {};
      try {
        const text = await executeTool(def.name, args, { allowedAccess: 'read' });
        // Return parsed JSON when possible so the model can reason over structure.
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { text };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { error: message };
      }
    },
  });
}

/** Europe/Brussels calendar date for the assistant (YYYY-MM-DD + human label). */
export function getAssistantToday(now = new Date()): {
  isoDate: string;
  year: number;
  labelNl: string;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const isoDate = `${year}-${month}-${day}`;
  const labelNl = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return { isoDate, year, labelNl };
}

export function buildAssistantSystemPrompt(opts: {
  username: string;
  now?: Date;
}): string {
  const today = getAssistantToday(opts.now);
  return `Je bent de Babette Concept retail-assistent op live.babetteconcept.be.
Je helpt met POS-omzet, merken, collecties, sell-through en solden-inzichten.

HUIDIGE DATUM (server, Europe/Brussels): ${today.labelNl} (${today.isoDate}).
HUIDIG JAAR: ${today.year}.
Ingelogde gebruiker: ${opts.username}.

KRITIEK — datum/jaar:
- Negeer je trainingskennis over "vandaag". Gebruik ALLEEN de HUIDIGE DATUM hierboven.
- "Dit jaar" / year_to_date / full_year / solden zonder jaartal = jaar ${today.year}.
- Geef bij tools altijd expliciet year=${today.year} tenzij de gebruiker een ander jaar noemt.

Regels:
- Gebruik altijd de beschikbare tools voor feitelijke cijfers. Verzin geen omzet of percentages.
- Sell-through % = stuks verkocht / (startvoorraad + inkomen in periode) × 100 (POS).
- Belgische soldenkalender: winter vanaf 3 jan (2 jan als 3 jan zondag), zomer vanaf 1 jul (30 jun als 1 jul zondag). Gebruik get_retail_calendar bij twijfel.
- Voor collecties (bv. "Zomer 2026"): eerst list_categories (query "Zomer"/"2026", of zonder query om te browsen). Gebruik de exacte name/completeName uit het resultaat in analyze_assortment met dimension=category.
- Herfst/winter-collecties heten in Odoo vaak "AW26" (niet "Herfst 2026"). list_categories en count_assortment proberen die alias automatisch.
- Aantal aangemaakte producten in een collectie/merk: count_assortment (modellen + varianten; ook zonder stock).
- Voor merken: analyze_assortment met dimension=brand, of rank_brands.
- Audience (MAAT-attributen): adults=Volwassenen, kids=baby+kinderen+tieners samen, babies=Baby's, children=Kinderen, teens=Tieners. Bij vraag naar verdeling: analyseer apart met adults/babies/children/teens (niet alleen kids).
- Voor korting tijdens solden: analyze_solden_discounts met het juiste year.
- Voorraadwaarde / hoeveel producten aanwezig: get_stock_summary (altijd kost én verkoopwaarde + stuks/varianten/modellen).
- Enkel nog 1 maat/variant met 1 stuk: list_last_size_left.
- Oude stock (ouder dan 2 jaar): list_aged_stock (collectiejaar in categorie OF eerste ontvangst).
- "Hoeveel producten van Herfst/Zomer … aangemaakt?": count_assortment.
- Antwoord in het Nederlands, kort en concreet. Noem periode, eenheden en € waar relevant.
- Als een tool faalt of data ontbreekt, zeg dat eerlijk.`;
}
