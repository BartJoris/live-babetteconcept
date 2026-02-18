/**
 * AI Prompt voor Baby's en Kinderen producten
 * Gebruikt voor: MAAT Baby's, MAAT Kinderen, MAAT Tieners
 */

export const KINDEREN_SYSTEM_PROMPT = `Schrijf een vlot leesbare webshoptekst in het Nederlands voor een kinderconceptstore.

De toon is warm, eenvoudig en speels, maar niet overdreven. Gebruik maximaal één subtiele emoji in de producttekst.

BELANGRIJKE REGELS:
1. VERTAAL productbenaming naar het Nederlands (bijv. CHAPEAU → Hoed, DRESS → Jurk, SHIRT → Shirt, SAC → Tas, PANTALON → Broek)
2. Herhaal de productnaam NIET meerdere keren - gebruik synoniemen of beschrijvende woorden
3. Schrijf GEEN droge opsommingen - maak vloeiende zinnen van de details
4. Begin NIET met de productnaam als titel - begin direct met de beschrijving

Structuur:
1. Start met een korte, aantrekkelijke beschrijving (2-3 zinnen) waarin je het product introduceert
2. Verwerk materiaal en details in vloeiende tekst, niet als losse bullets
3. Eindig met een korte merkbeschrijving in cursief

Voorbeeld FOUT:
"CHAPEAU<br>De CHAPEAU in de kleur... • Materiaal: 100% katoen"

Voorbeeld GOED:
"Deze zachte hoed is perfect voor zonnige dagen. Gemaakt van puur katoen voelt hij heerlijk aan en beschermt tegen de zon. 🌻<br><br><em>Emile & Ida combineert speelse prints met zachte materialen.</em>"

BELANGRIJK - Formatting:
- Gebruik <br> voor regelovergangen
- Gebruik <em> voor de merkbeschrijving
- GEEN losse bullet points met "Materiaal:" of "Kleur:"
- GEEN markdown, alleen HTML tags`;

export const KINDEREN_USER_PROMPT_TEMPLATE = (product: {
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
    'Emile & Ida': 'Emile & Ida is een Frans kinderkledingmerk dat speelse prints combineert met zachte materialen.',
    'Emile et Ida': 'Emile & Ida is een Frans kinderkledingmerk dat speelse prints combineert met zachte materialen.',
    'Tiny Cottons': 'Tiny Cottons is een Spaans merk dat moderne, minimalistische kinderkleding ontwerpt.',
    'Play Up': 'Play Up is een Portugees merk dat duurzame kinderkleding maakt met oog voor comfort.',
    'Flöss': 'Flöss is een Deens merk dat tijdloze kinderkleding ontwerpt met oog voor detail.',
    'Brunobruno': 'Brunobruno is een merk dat stijlvolle kinderkleding ontwerpt.',
    'Petit Blush': 'Petit Blush is een duurzaam kindermodemerk dat feminine, speelse stukken ontwerpt met organisch katoen en gerecyclede materialen.',
    'The Sunday Collective': 'The Sunday Collective maakt comfortabele kinderkleding met een relaxte uitstraling.',
    'Goldie and Ace': 'Goldie and Ace is een Australisch merk met speelse, kleurrijke kinderkleding.',
  };
  
  const brandDesc = product.brand ? brandDescriptions[product.brand] : undefined;
  if (brandDesc) {
    parts.push(`Merkbeschrijving (gebruik dit in cursief aan het einde): ${brandDesc}`);
  }
  
  parts.push('');
  parts.push('ONTHOUD: Vertaal productbenaming naar Nederlands, geen herhalingen, geen droge bullets, vloeiende tekst!');
  
  return parts.join('\n');
};
