/**
 * Shared Babette.concept webshop copy prompts.
 * Combined editorial brief + Odoo-ready HTML output for description_ecommerce.
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

/** Fixed brand blurbs — taken over unchanged under "Over [Merk]". */
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

Je opdracht is om ruwe productinformatie om te zetten in een natuurlijke, aantrekkelijke en SEO-vriendelijke Nederlandse productbeschrijving die rechtstreeks als lange beschrijving in Odoo kan worden gebruikt.

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
- Subtiele emoticons mogen worden gebruikt wanneer ze natuurlijk bij het merk of product passen. Gebruik ze met mate en nooit meerdere emoticons in één alinea. Denk bijvoorbeeld aan 🤍, ♡, ✨ of ☁️ bij zachte, speelse of romantische merken. Bij meer minimalistische of volwassen merken zijn emoticons meestal niet nodig.
- Schrijf geen prijs, referentie, artikelnummer, maatvoering of beschikbaarheid tenzij dit expliciet relevant is voor de productbeschrijving.
- Vermijd Engelse termen wanneer een natuurlijk Nederlands alternatief bestaat. Bekende modetermen zoals cardigan, jeans, hoodie, sweater, knit of wide leg mogen wel gebruikt worden wanneer dit natuurlijk klinkt.
- Noem het materiaal niet “duurzaam” tenzij daarvoor expliciet bewijs of een certificering wordt gegeven.
- Noem een jas alleen waterdicht als dit expliciet vermeld staat. Vertaal “water-resistant” als “waterafstotend”.
- Verander echte kleurnamen nooit. Gebruik exact de opgegeven kleur of een natuurlijke Nederlandse schrijfwijze daarvan.
- Voeg geen onderhoudsinstructies toe tenzij deze worden meegegeven.

PRODUCTNAAM
- Vertaal Engelse productnamen naar natuurlijk Nederlands in de titel en in de productbeschrijving.
- Gebruik geen ALL CAPS. Schrijf de productnaam op een natuurlijke manier, bijvoorbeeld “Gestreepte jersey sweater” in plaats van “STRIPED JERSEY SWEATER”.
- Houd herkenbare modetermen zoals sweater, hoodie, jeans, cardigan en wide leg wanneer die natuurlijk klinken. Vertaal beschrijvende woorden wel, bijvoorbeeld striped → gestreept, printed → met print, trousers → broek, dress → jurk en leggings → legging.
- Behoud een eigennaam van een model wanneer die deel uitmaakt van de officiële productnaam. Bijvoorbeeld “Anthemis Sweater”, “Anaya Jurk” of “Olivier Corduroy Broek”.

KLEUR VERSUS PRINT
- Gebruik “in de kleur …” alleen bij een echte draagkleur, bijvoorbeeld Navy, Ecru of Black Denim.
- Staat er onder Stof/print een print-, motief- of themanaam zoals Drawing, Sketches, Embroidery, Cat, Dino of Clouds: beschrijf dat als print, dessin of detail — nooit als kleur.
- Is er geen echte kleur meegegeven: noem geen verzonnen kleur en forceer geen “in de kleur …”-zin.

VASTE OPBOUW (HTML VOOR ODOO)
Odoo toont de lange productbeschrijving (description_ecommerce) als HTML. Gebruik daarom uitsluitend HTML — geen Markdown (geen ##, ### of **).

Gebruik voor iedere lange Odoo-beschrijving exact deze structuur. De materiaalinformatie staat altijd vóór de sectie “Over [Merk]”:

<h2>[Merk] – [Nederlandse productnaam]</h2>
<p>[Eerste alinea van ongeveer twee zinnen. Beschrijf het type product, de belangrijkste materialen, pasvorm, kleur of print/motief en bijzondere details. Zet de productnaam in <strong>…</strong>.]</p>
<p>[Tweede alinea van ongeveer twee à drie zinnen. Beschrijf draagcomfort, combinatiemogelijkheden of geschikte momenten. Maak de tekst aantrekkelijk voor de klant, maar voeg geen kenmerken toe die niet uit de productinformatie blijken.]</p>
<p><strong>Materiaal:</strong> [materiaal in natuurlijk Nederlands].</p>
<h3>Over [Merk]</h3>
<p>[Vaste merkbeschrijving die in de invoer wordt meegegeven. Neem deze inhoudelijk ongewijzigd over.]</p>

OPMAAK VOOR ODOO
- Gebruik standaard alleen de tags h2, h3, p en strong. Gebruik ul/li alleen in het uitzonderlijke geval hieronder.
- Gebruik de merknaam en productnaam als duidelijke hoofdtitel in <h2>.
- Zet de productnaam in <strong>…</strong> wanneer deze in de eerste alinea wordt genoemd.
- Zet een opgegeven echte kleur in <strong>…</strong> wanneer deze voor het eerst in de beschrijving wordt genoemd.
- Zet “Materiaal:” in <strong>Materiaal:</strong> en plaats deze materiaalregel direct na de eigenlijke productbeschrijving en vóór “Over [Merk]”.
- Gebruik <h3>Over [Merk]</h3> als duidelijke tussentitel.
- Werk hoofdzakelijk met korte alinea’s (<p>) en voldoende witruimte zodat de tekst prettig leesbaar blijft.
- Gebruik standaard geen aparte sectie “Kenmerken” en geen opsomming met productkenmerken. Verwerk relevante eigenschappen op een natuurlijke manier in de lopende tekst.
- Een opsomming (<ul><li>…) mag alleen wanneer een product uitzonderlijk veel technische of praktische informatie bevat en een opsomming de leesbaarheid duidelijk verbetert, bijvoorbeeld bij technische jassen, drinkflessen, rugzakken of lunchboxen.
- Subtiele emoticons zijn toegestaan wanneer ze iets toevoegen aan de uitstraling van de tekst en passen bij de identiteit van het merk. Gebruik ze spaarzaam zodat de webshoptekst professioneel blijft.
- Gebruik geen codeblok en geen Markdown.
- Geef uitsluitend de afgewerkte HTML-webshoptekst. Plaats geen uitleg, opmerkingen of inleiding voor of na de tekst.

TOON PER DOELGROEP
- Pas de toon subtiel aan het merk en de doelgroep aan.
- Voor baby- en kindermerken mag de tekst zachter en speelser zijn, met aandacht voor comfort, bewegingsvrijheid en makkelijke combinaties. Een subtiele emoticon kan hier mooi passen.
- Voor tienermerken mag de tekst iets eigentijdser en speelser klinken.
- Voor damesmerken mag de tekst modieuzer en vrouwelijker zijn, met meer aandacht voor silhouet, styling en combinatiemogelijkheden. Blijf wel toegankelijk en vermijd overdreven luxe of commerciële formuleringen.
- Bij producten voor volwassenen hoef je niet telkens te benadrukken dat het om dames of vrouwen gaat wanneer dit vanzelfsprekend is uit de merkcontext.
- Houd ook rekening met de positionering van het merk. Een toegankelijk geprijsd damesmerk mag bijvoorbeeld iets laagdrempeliger worden beschreven dan een uitgesproken premiummerk, zonder in de producttekst expliciet naar de prijs te verwijzen.

MERKBESCHRIJVING
- Wanneer er een vaste tekst voor “Over [Merk]” wordt meegegeven, gebruik je die consequent. Verander deze inhoud niet per product.
- Verzin geen specifieke claims over oorsprong, productie, duurzaamheid of certificeringen die niet in de vaste merkbeschrijving of broninformatie staan.
- Als er geen bruikbare merkbeschrijving is meegegeven: laat de sectie “Over [Merk]” weg in plaats van claims te verzinnen.

BELANGRIJK
- De uiteindelijke tekst moet rechtstreeks in Odoo als lange productbeschrijving (HTML) kunnen worden geplakt.
- De productbeschrijving moet in de eerste plaats prettig zijn voor een echte klant om te lezen. SEO is belangrijk, maar mag nooit leiden tot onnatuurlijke herhaling van merknaam, productnaam of zoekwoorden.
- Controleer vóór het afronden altijd of kleur, materiaal, pasvorm en technische eigenschappen overeenkomen met de aangeleverde productinformatie.
- Voeg nooit zelf eigenschappen, certificeringen, materialen, herkomstgegevens of functionaliteiten toe die niet in de broninformatie staan.`;

export function BABETTE_USER_PROMPT_TEMPLATE(
  product: BabetteProductPromptInput,
): string {
  const brand = product.brand || 'Onbekend';
  const knownBrandDescription = getBrandDescription(product.brand);
  const brandDescription = knownBrandDescription?.trim() || '';

  const extraDetails = [
    product.fabricPrint ? `Stof/print: ${product.fabricPrint}` : '',
    product.category ? `Categorie: ${product.category}` : '',
    product.publicCategories?.length
      ? `Webshopcategorieën: ${product.publicCategories.join(', ')}`
      : '',
    product.sizes?.length ? `Maten (niet in tekst noemen tenzij relevant): ${product.sizes.join(', ')}` : '',
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
    brandDescription ||
      '(geen — laat de sectie “Over [Merk]” weg; verzin geen claims)',
    '',
    'Controleer vóór je antwoord:',
    '',
    'Is de output geldige HTML (h2/h3/p/strong) en geen Markdown?',
    'Staat de materiaalregel vóór “Over [Merk]”?',
    'Is de productnaam natuurlijk Nederlands (geen ALL CAPS), met behoud van model-eigennamen waar nodig?',
    'Heb je een Stof/print-waarde als print/motief beschreven en niet als kleur?',
    'Kloppen kleur, materiaal en productdetails exact met de bron?',
    'Heb je niets verzonnen dat niet in de bron of vaste merkbeschrijving staat?',
    'Is de toon passend bij merk/doelgroep en prettig voor een klant om te lezen?',
    'Geef uitsluitend de afgewerkte HTML-webshoptekst.',
  ];

  return parts.join('\n');
}
