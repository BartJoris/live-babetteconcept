/**
 * AI Prompt voor Volwassenen producten
 * Gebruikt voor: MAAT Volwassenen
 */

export const VOLWASSENEN_SYSTEM_PROMPT = `Schrijf een webshoptekst in het Nederlands voor een kledingcollectie voor volwassenen.

De toon is stijlvol, modern en toegankelijk. Focus op tijdloos design, kwaliteit en draagcomfort. Gebruik geen emoji's.

BELANGRIJKE REGELS:
1. VERTAAL productbenaming naar het Nederlands indien nodig (bijv. DRESS → Jurk, BLOUSE → Blouse, PANTALON → Broek)
2. Herhaal de productnaam NIET meerdere keren - gebruik synoniemen of beschrijvende woorden
3. Schrijf GEEN droge opsommingen - maak vloeiende zinnen van de details
4. Begin NIET met de productnaam als titel - begin direct met de beschrijving

Structuur:
1. Start met een korte, aantrekkelijke beschrijving (2-3 zinnen) waarin je het item introduceert
2. Verwerk materiaal, pasvorm en details in vloeiende tekst
3. Eindig met een korte merkbeschrijving in cursief

Voorbeeld FOUT:
"BLOUSE<br>De BLOUSE in de kleur... • Materiaal: TENCEL • Pasvorm: Regular"

Voorbeeld GOED:
"Deze elegante blouse combineert comfort met stijl. De vloeiende TENCEL-stof voelt zijdezacht aan en draagt heerlijk de hele dag. Perfect te combineren met een jeans of nette broek.<br><br><em>ARMEDANGELS maakt duurzame mode van biologische materialen.</em>"

BELANGRIJK - Formatting:
- Gebruik <br> voor regelovergangen
- Gebruik <em> voor de merkbeschrijving
- GEEN losse bullet points met "Materiaal:" of "Pasvorm:"
- GEEN markdown, alleen HTML tags`;

export const VOLWASSENEN_USER_PROMPT_TEMPLATE = (product: {
  name: string;
  brand?: string;
  color?: string;
  material?: string;
  description?: string;
  fabricPrint?: string;
}) => {
  const parts: string[] = [];
  
  parts.push(`Schrijf een productbeschrijving voor:`);
  parts.push(`Product: ${product.name}`);
  
  if (product.color) {
    parts.push(`Kleur: ${product.color}`);
  }
  
  if (product.material) {
    parts.push(`Materiaal: ${product.material}`);
  }
  
  if (product.fabricPrint) {
    parts.push(`Stof/Print: ${product.fabricPrint}`);
  }
  
  if (product.description) {
    parts.push(`Extra info: ${product.description}`);
  }
  
  parts.push('');
  parts.push(`Merk: ${product.brand || 'Onbekend'}`);
  
  // Add brand descriptions for known brands
  const brandDescriptions: Record<string, string> = {
    'Armed Angels': 'ARMEDANGELS maakt duurzame mode van biologische en gerecyclede materialen.',
    'ARMEDANGELS': 'ARMEDANGELS maakt duurzame mode van biologische en gerecyclede materialen.',
    'Thinking MU': 'Thinking MU ontwerpt kleurrijke, duurzame mode met respect voor mens en milieu.',
    'Emile & Ida': 'Emile & Ida brengt speelse prints en zachte materialen voor vrouwen.',
    'Emile et Ida': 'Emile & Ida brengt speelse prints en zachte materialen voor vrouwen.',
  };
  
  const brandDesc = product.brand ? brandDescriptions[product.brand] : undefined;
  if (brandDesc) {
    parts.push(`Merkbeschrijving (gebruik dit in cursief aan het einde): ${brandDesc}`);
  }
  
  parts.push('');
  parts.push('ONTHOUD: Vertaal productbenaming naar Nederlands, geen herhalingen, geen droge bullets, vloeiende tekst!');
  
  return parts.join('\n');
};
