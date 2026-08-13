/**
 * Shared Babette.concept webshop copy prompts.
 * Aligned with the ChatGPT / Responses API style used for Flöss and other brands.
 */

export interface BabetteProductPromptInput {
  name: string;
  brand?: string;
  color?: string;
  material?: string;
  description?: string;
  fabricPrint?: string;
  category?: string;
  sizes?: string[];
  publicCategories?: string[];
}

/** Fixed brand blurbs — taken over unchanged under "### Over [Merk]". */
export const BRAND_DESCRIPTIONS: Record<string, string> = {
  Flöss:
    'Flöss is een Deens kinderkledingmerk dat Scandinavisch design combineert met zachte kleuren, verfijnde prints en hoogwaardige materialen. De collecties zijn ontworpen met oog voor comfort, kwaliteit en tijdloze stijl, zodat kinderen vrij kunnen spelen én er tegelijkertijd stijlvol uitzien.',
  Brunobruno:
    'Brunobruno is een merk dat stijlvolle kinderkleding ontwerpt met aandacht voor detail en comfort.',
  'Emile & Ida':
    'Emile & Ida is een Frans kinderkledingmerk dat speelse prints combineert met zachte materialen.',
  'Emile et Ida':
    'Emile & Ida is een Frans kinderkledingmerk dat speelse prints combineert met zachte materialen.',
  'Tiny Cottons':
    'Tiny Cottons is een Spaans merk dat moderne, minimalistische kinderkleding ontwerpt.',
  'Play Up':
    'Play Up is een Portugees kinderkledingmerk dat comfortabele basics en speelse prints combineert met zachte materialen. De collecties zijn gemaakt om in te spelen en tegelijk stijlvol uit te zien, met oog voor kwaliteit en een tijdloze uitstraling.',
  'Petit Blush':
    'Petit Blush is een duurzaam kindermodemerk dat feminine, speelse stukken ontwerpt met organisch katoen en gerecyclede materialen.',
  'The Sunday Collective':
    'The Sunday Collective maakt comfortabele kinderkleding met een relaxte uitstraling.',
  'Goldie and Ace':
    'Goldie and Ace is een Australisch merk met speelse, kleurrijke kinderkleding.',
  'Armed Angels':
    'ARMEDANGELS maakt duurzame mode van biologische en gerecyclede materialen.',
  ARMEDANGELS:
    'ARMEDANGELS maakt duurzame mode van biologische en gerecyclede materialen.',
  'Thinking MU':
    'Thinking MU ontwerpt kleurrijke, duurzame mode met respect voor mens en milieu.',
};

export function getBrandDescription(brand?: string): string | undefined {
  if (!brand) return undefined;
  if (BRAND_DESCRIPTIONS[brand]) return BRAND_DESCRIPTIONS[brand];
  const match = Object.entries(BRAND_DESCRIPTIONS).find(
    ([key]) => key.toLowerCase() === brand.toLowerCase(),
  );
  return match?.[1];
}

export const BABETTE_SYSTEM_PROMPT = `Je schrijft Nederlandstalige webshopteksten voor Babette.concept, een stijlvolle winkel voor baby’s, kinderen, tieners en volwassenen.
Je opdracht is om ruwe Engelstalige productinformatie om te zetten in een natuurlijke, aantrekkelijke en SEO-vriendelijke Nederlandse productbeschrijving.

STIJL
- Schrijf warm, stijlvol en menselijk.
- Gebruik natuurlijk Nederlands en vermijd letterlijke vertalingen.
- De tekst moet professioneel maar niet afstandelijk klinken.
- Vermijd overdreven commerciële taal.
- Gebruik geen clichés zoals “een absolute must-have” tenzij dit echt natuurlijk past.
- Schrijf helder en vlot, zonder lange of ingewikkelde zinnen.
- Verzin geen kenmerken die niet in de productinformatie staan.
- Benoem materialen, kleuren en details correct.
- Gebruik het woord “kinderen”, “meisjes”, “jongens” of “tieners” alleen wanneer dit uit de productinformatie of merkcontext blijkt.
- Gebruik geen opsommingstekens.
- Gebruik geen nummering.
- Gebruik geen emoji’s.
- Schrijf geen prijs, referentie, artikelnummer, maatvoering of beschikbaarheid tenzij dit expliciet wordt meegegeven.
- Vermijd Engelse termen wanneer een natuurlijk Nederlands alternatief bestaat. Bekende modetermen zoals cardigan, jeans, hoodie, sweater, knit of wide leg mogen wel gebruikt worden wanneer dit natuurlijk klinkt.
- Noem het materiaal niet “duurzaam” tenzij daarvoor expliciet bewijs of een certificering wordt gegeven.
- Noem een jas alleen waterdicht als dit expliciet vermeld staat. Vertaal “water-resistant” als “waterafstotend”.
- Verander echte kleurnamen nooit. Gebruik exact de opgegeven kleur of een natuurlijke Nederlandse schrijfwijze daarvan.
- Voeg geen onderhoudsinstructies toe tenzij deze worden meegegeven.

PRODUCTNAAM
- Vertaal Engelse productnamen naar natuurlijk Nederlands in de titel én in de vetgedrukte productnaam.
- Gebruik geen ALL CAPS. Schrijf Title Case of zinshoofdletter, bijvoorbeeld “Gestreepte jersey sweater” i.p.v. “STRIPED JERSEY SWEATER”.
- Houd herkenbare modetermen (sweater, hoodie, jeans, cardigan, wide leg) wanneer die natuurlijk klinken; vertaal beschrijvende woorden wel (striped → gestreept, printed → met print, trousers → broek, dress → jurk, leggings → legging).

KLEUR VS PRINT
- Gebruik “in de kleur …” alleen bij een echte draagkleur (bijv. navy, ecru, black denim).
- Staat er onder Stof/print een print-, motief- of themanaam (bijv. DRAWING, SKETCHES, EMBROIDERY, CAT, DINO, CLOUDS): beschrijf dat als print, dessin of detail — nooit als kleur.
- Is er geen echte kleur meegegeven: noem geen verzonnen kleur en forceer geen “in de kleur …”-zin.

VASTE OPBOUW
Gebruik exact deze structuur:

## [Merk] – [Nederlandse productnaam]

[Eerste alinea van ongeveer 2 zinnen. Beschrijf het type kledingstuk, de belangrijkste materialen, pasvorm, kleur of print/motief, en bijzondere details.]

[Tweede alinea van ongeveer 2 zinnen. Beschrijf draagcomfort, combinatiemogelijkheden of geschikte momenten, zonder onbewezen eigenschappen toe te voegen.]

### Over [Merk]

[Vaste merkbeschrijving die in de invoer wordt meegegeven. Neem deze inhoudelijk ongewijzigd over.]

**Materiaal:** [materiaal in natuurlijk Nederlands].

OPMAAK
- Zet de merknaam en de vertaalde productnaam in de titel.
- Zet de vertaalde productnaam in de eerste alinea vet (**productnaam**).
- Zet een opgegeven echte kleur vet wanneer die in de beschrijving wordt genoemd.
- Gebruik “### Over [Merk]” als tussentitel.
- Zet “Materiaal:” vet.
- Sluit de materiaalregel af met een punt.
- Geef uitsluitend de afgewerkte webshoptekst.
- Plaats geen uitleg, opmerkingen of inleiding voor of na de tekst.
- Gebruik geen codeblok.`;

export function BABETTE_USER_PROMPT_TEMPLATE(
  product: BabetteProductPromptInput,
): string {
  const brand = product.brand || 'Onbekend';
  const brandDescription =
    getBrandDescription(product.brand) ||
    `${brand} is een merk uit het assortiment van Babette.concept.`;

  const extraDetails = [
    product.fabricPrint ? `Stof/print: ${product.fabricPrint}` : '',
    product.category ? `Categorie: ${product.category}` : '',
    product.publicCategories?.length
      ? `Webshopcategorieën: ${product.publicCategories.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const parts = [
    'Maak een webshoptekst op basis van onderstaande productinformatie.',
    '',
    'Merk:',
    brand,
    '',
    'Productnaam:',
    product.name,
    '',
    'Originele productbeschrijving:',
    product.description?.trim() || '',
    '',
    'Kleur (alleen echte draagkleur; leeg laten als onbekend):',
    product.color?.trim() || '',
    '',
    'Materiaal:',
    product.material?.trim() || '',
    '',
    'Extra productdetails:',
    extraDetails || '(geen)',
    '',
    'Vaste merkbeschrijving:',
    brandDescription,
    '',
    'Controleer vóór je antwoord:',
    '',
    'Is de productnaam vertaald naar natuurlijk Nederlands (geen ALL CAPS)?',
    'Heb je een Stof/print-waarde als print/motief beschreven en niet als kleur?',
    'Kloppen kleur, materiaal en productdetails exact?',
    'Heb je niets toegevoegd dat niet in de bron staat?',
    'Is de tekst natuurlijk Nederlands en geen letterlijke vertaling?',
    'Staat alles in de gevraagde vaste opbouw?',
    'Geef uitsluitend de afgewerkte webshoptekst.',
  ];

  return parts.join('\n');
}
