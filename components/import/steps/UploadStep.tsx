import { useState, useRef } from 'react';
import type { UseImportWizardReturn } from '@/hooks/useImportWizard';
import DocumentPreview from '@/components/import/shared/DocumentPreview';
import { supportsDirectoryPicker, isIOS } from '@/lib/import/shared/browser-utils';

interface UploadStepProps {
  wizard: UseImportWizardReturn;
}

function VendorFormatPreview({ vendor }: { vendor: string }) {
  switch (vendor) {
    case 'ao76':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`EAN barcode;Reference;Description;Quality;Colour;Size;Quantity;Price;RRP;HS code
5400562408965;225-2003-103;silas t-shirt;50% recycled cotton;natural;04;1;21.6;54;6109100010`}
        </pre>
      );
    case 'lenewblack':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`order-2995931-20251013
Brand name;Collection;Product name;Product reference;Color name;Description;Size name;EAN13;SKU;Quantity;Net amount;Currency
Hello Simone;Winter 25 - 26;Bear fleece jacket cookie;AW25-BFLJC;Cookie;Large jacket...;3Y;3701153659547;AW25-BFLJC-3Y;1;65,00;EUR

→ Wordt: "Hello Simone - Bear fleece jacket cookie"`}
        </pre>
      );
    case 'playup':
      return (
        <>
          <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Article,Color,Description,Size,Quantity,Price
1AR11002,P6179,"RIB LS T-SHIRT - 100% OGCO",3M,1,12.39

→ Wordt: "Play Up - Rib ls t-shirt - 100% ogco"
→ Gebruik Play UP PDF Converter om factuur PDF naar CSV te converteren`}
          </pre>
          <div className="mt-3">
            <a
              href="/playup-pdf-converter"
              target="_blank"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              🎮 Open Play UP PDF Converter →
            </a>
          </div>
        </>
      );
    case 'tinycottons':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Order id;Season;Brand name;Category;Product name;Composition;Size name;EAN13;Quantity;Unit price;RRP
3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;34;8434525598872;1;47,6;119

→ Wordt: "Tiny Big sister - Alma fruits short"
→ Variant: Maat 34 (MAAT Volwassenen), EAN: 8434525598872, Prijs: €47,60, RRP: €119,00`}
        </pre>
      );
    case 'armedangels':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Table 1
Item Number;Description;Color;Size;SKU;Quantity;Price (EUR)
10012345;Denim Jacket;Blue;S;10012345-BLU-S;1;89,95

→ Wordt: "Armed Angels - Denim jacket - Blue"`}
        </pre>
      );
    case 'thinkingmu':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`PDF Factuur met tabel structuur:
CODE          | CONCEPT                              | PRICE  | UNITS | TOTAL
8435512930002 | NAVY NOCTIS KNITTED TOP WKN00266,L   | 36,00€ | 1     | 36,00€

→ Wordt: "Thinking Mu - Navy noctis knitted top"
→ Variant: Maat L - 40, EAN: 8435512930002, Prijs: €36,00`}
        </pre>
      );
    case 'indee':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Season;Product Category 1;Product Category 2;Style;Colour;Description;Size;Barcode;Textile Content;WSP EUR;Ccy Symbol;RRP;Sales Order Quantity
SS26;SS26;DRESS;VILLAGGIO;TOMATO RED;LONG SLEEVES OVERSIZED DRESS;L;5404045609481;50% COTTON;60.00;€;€ 155.00;1

→ Wordt: "Indee - Villaggio long sleeves oversized dress tomato red"
→ Variant: Maat L - 40, EAN: 5404045609481, Kostprijs: €60,00, RRP: €155,00`}
        </pre>
      );
    case 'sundaycollective':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`PDF Factuur met tabel structuur:
ITEM                              | SKU           | QTY | MSRP   | PRICE  | TOTAL
Avenue Shorts In Cucumber Stripe  |               |     |        |        |
Size: 2Y-3Y                       | S26W2161-GR-2 | 1   | €64,00 | €28,00 | €28,00

→ Wordt: "The Sunday Collective - Avenue shorts in cucumber stripe"
→ Variant: Maat 2Y-3Y (MAAT Kinderen), SKU: S26W2161-GR-2, Prijs: €28,00
⚠️ Barcodes niet beschikbaar - handmatig aanvullen!`}
        </pre>
      );
    case 'tangerine':
      return (
        <div className="space-y-2">
          <p className="text-xs text-gray-700">
            <strong>1. Packing list</strong>: PDF, CSV, <strong>of plak tekst uit een screenshot</strong> (na OCR of overnemen).<br/>
            <strong>2. Prijzen PDF</strong> (optioneel): 2026055 IMT (100% Babette) SS26 Tangerine.pdf
          </p>
          <p className="text-xs text-gray-700">
            → Bij screenshots: maak een duidelijke screenshot, haal tekst eruit met een OCR-tool, plak in het tekstveld en klik op &quot;Importeer uit geplakte tekst&quot;.<br/>
            → Afbeeldingen: selecteer de hoofdmap (bijv. Flats Lays Photos - SS26); submappen (TG-622, TG-623) worden per product gekoppeld.
          </p>
        </div>
      );
    case 'goldieandace':
      return (
        <div className="space-y-4">
          <div>
            <h5 className="font-bold mb-2">CSV Line Sheet:</h5>
            <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`CATEGORY;STYLE CODE;DESCRIPTION;COLOUR NAME;SIZE;BARCODES;RETAIL EUR;W/S EUR;FIT COMMENTS;PRODUCT FEATURES
TEES;20001GA006;OUTBACK ROO T-SHIRT;CLASSIC BLUE;2Y;9361499023965;€29,00;€11,60;TRUE TO SIZE, RELAXED FIT;"Mid weight classic tee"`}
            </pre>
          </div>
          <div>
            <h5 className="font-bold mb-2">PDF Factuur:</h5>
            <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Description | Quantity | Unit Price | GST | Amount EUR
OUTBACK ROO T-SHIRT 2Y | 1.00 | 11.60 | GST Free | 11.60`}
            </pre>
          </div>
          <p className="text-xs text-gray-700 mt-2">
            → Wordt: &quot;Goldie and Ace - Outback roo t-shirt&quot;<br/>
            → Variant: Maat 2 jaar (MAAT Kinderen), EAN: 9361499023965, Prijs: €11,60
          </p>
        </div>
      );
    case 'onemore':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Order id;Date;Status;Season;Brand name;...;Product name;Product reference;Color name;...;Size name;EAN13;SKU;Quantity;Unit price
3116535;2025-08-05;Confirmed;Pre-SS26;1+ in the family;...;26s063;EGAS;blossom;...;T1;8448261015630;26s063blosT1;2;16

→ Wordt: "1+ in the family - Hat - Blossom"
→ Variant: Maat T1 (MAAT Baby's), EAN: 8448261015630, Prijs: €16,00, RRP: €40,00 (2.5x)`}
        </pre>
      );
    case 'jenest':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Order no.;Date;...;Product name;Item number;Color;Size;...;EAN Number;Rec retail price;Line quantity;Line unit price;...
SO-1239;2025-08-07;...;LIVIA TSHIRT;1222;LT FUCHSIA PINK;2-3Y;...;8721458809046;39,95;1;16,65;...

→ Wordt: "Jenest - Livia tshirt - Lt fuchsia pink"
→ Variant: Maat 2-3Y, EAN: 8721458809046, Prijs: €16,65, RRP: €39,95`}
        </pre>
      );
    case 'emileetida':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`📄 ORDER CSV:
Order id;Date;Status;Season;Brand name;...;Product name;Product reference;Color name;...;Size name;EAN13;SKU;Quantity;Unit price
3087203;2025-06-28;Closed;SS26;Emile Et Ida;...;SAC A DOS IMPRIME;ADSACADOS;TULIPE;...;TU;3664547680803;ADSACADOS|TULIPE|TU;3;34,1

💰 TARIF CSV (optioneel voor RRP):
Saison;Famille;Marque;Référence;Couleur;Taille;Gencod;Désignation;WHLS EUR;RRP EUR

→ Wordt: "Emile & Ida - Sac a dos imprime - Tulipe (adsacados)"
→ Maten: 02A → 2 jaar, 06-18M → 6 - 18 maand, TU → U`}
        </pre>
      );
    case 'bobochoses':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`📄 PACKING LIST CSV:
BOX;REFERENCE;DESCRIPTION;COLOR;SIZE;EAN;CUSTOMS CODE;ORIGIN COUNTRY;QUANTITY
1;B126AK001;Red patent-leather cross sandal;611;39;8445782377735;6405100000;ES;1

💰 PRICE PDF (optioneel):
REF: B226AD018
Wholesale price 30 eur
European RRP 75 eur

→ Wordt: "Bobo Choses - Red Patent-Leather Cross Sandal - Red"
→ Color code 611 → Red, 199 → Off White, 991 → Multi`}
        </pre>
      );
    case 'minirodini':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`ID;Art. no.;Brand;Product Name;Display Name;Variant Name;...;Size;...;EAN;Quantity;...;Wholesale price - EUR;RRP - EUR
7641362;11000335;MINI RODINI;Panther sp sweatshirt;...;Green;...;92/98;...;7332754714678;1;...;22;55

→ Wordt: "Mini Rodini - Panther sp sweatshirt - Green (11000335)"
→ Maten: 92/98 → 3 jaar, 104/110 → 5 jaar, 128/134 → 9 jaar`}
        </pre>
      );
    case 'favoritepeople':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`SKU;QTY;WHL PRICE;RETAIL PRICE;EAN CODE
SS26NAPOLIGIRLSHORTS24MFP;1; 26,00 € ;65,00 €;05600850526269

→ Wordt: "Favorite People - Napoli Girl Shorts"
→ SKU parsing: SS26 + NAPOLIGIRLSHORTS + 24M + FP
→ Maten: 24M → 24 maand, 3Y → 3 jaar, TU → U`}
        </pre>
      );
    case 'mipounet':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`"Order id";"Date";...;"Product name";"Product reference";"Color name";...;"Size name";"Quantity";"Unit price";...
"3088059";"2025-06-29";...;"LES EFANTS T-SHIRT";"1131.04";"ORGANIC COTTON JERSEY (BLUE) - SS26";...;"2Y";"1";"16";...

→ Wordt: "Mipounet - Les Efants T-Shirt" (ref: 1131.04, kleur: BLUE)
→ Maten: 2Y → 2 jaar, 10Y → 10 jaar, 0 → U`}
        </pre>
      );
    case 'wyncken':
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Table 1
Style No;Style Name;Brand;Type;Category;Quality;Color;Size;Qty;Barcode;...;Wholesale Price EUR;Recommended Retail Price EUR
F10625;Apple Knit Cardigan;Flöss Aps;Cardigan;;100% Cotton;Red Apple;68/6M;1;5715777018640;...;22,00;55,00

→ Product: F10625 - Apple knit cardigan - Red Apple
→ Variant: Maat 68/6M, EAN: 5715777018640, Prijs: €22,00, RRP: €55,00`}
        </pre>
      );
    default:
      return (
        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Table 1
Style No;Style Name;Brand;Type;Category;Quality;Color;Size;Qty;Barcode;...;Wholesale Price EUR;Recommended Retail Price EUR
F10625;Apple Knit Cardigan;Flöss Aps;Cardigan;;100% Cotton;Red Apple;68/6M;1;5715777018640;...;22,00;55,00

→ Product: F10625 - Apple knit cardigan - Red Apple
→ Variant: Maat 68/6M, EAN: 5715777018640, Prijs: €22,00, RRP: €55,00`}
        </pre>
      );
  }
}

const DOCLING_ACCEPT = '.pdf,.docx,.pptx,.xlsx';

function DoclingSection({ wizard }: { wizard: UseImportWizardReturn }) {
  const [expanded, setExpanded] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    wizard.processDocument(file);
    setExpanded(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (e.target) e.target.value = '';
  };

  const doclingImages = wizard.doclingResult?.images.map((img) => ({
    url: img.base64
      ? `data:image/png;base64,${img.base64}`
      : img.uri || '',
    alt: img.description || img.classification || undefined,
  })) ?? [];

  return (
    <div className="mt-8">
      <div className="border-t border-gray-300 dark:border-gray-600 pt-6">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
              Of importeer vanuit een document:
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Upload een PDF, DOCX, PPTX of XLSX — tabellen en afbeeldingen worden automatisch herkend
            </p>
          </div>
          <span className="text-2xl text-gray-400 ml-4 flex-shrink-0">
            {expanded ? '▼' : '▶'}
          </span>
        </button>

        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              {wizard.doclingProcessing ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-700 dark:text-gray-300 font-medium">
                    Document wordt verwerkt...
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Dit kan even duren afhankelijk van de grootte
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                    Sleep een bestand hierheen of klik om te selecteren
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    PDF, DOCX, PPTX, XLSX (max 50MB)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={DOCLING_ACCEPT}
                    onChange={handleFileChange}
                    className="hidden"
                    id="docling-file-upload"
                  />
                  <label
                    htmlFor="docling-file-upload"
                    className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-medium cursor-pointer hover:bg-blue-700 transition-colors"
                  >
                    Selecteer bestand
                  </label>
                </>
              )}
            </div>

            {/* Results */}
            {wizard.doclingResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">
                    Resultaat
                  </h4>
                  <div className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>{wizard.doclingResult.tables.length} tabel(len)</span>
                    <span>·</span>
                    <span>{wizard.doclingResult.images.length} afbeelding(en)</span>
                  </div>
                </div>
                <DocumentPreview
                  markdown={wizard.doclingResult.markdown}
                  tables={wizard.doclingResult.tables}
                  images={doclingImages}
                  onTableSelect={(tableIndex, columnMapping) => {
                    const reverseMapping: Record<string, string> = {};
                    for (const [header, field] of Object.entries(columnMapping)) {
                      reverseMapping[field] = header;
                    }
                    wizard.applyDoclingTable(tableIndex, reverseMapping);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getVendorFormatLabel(vendor: string): string {
  const isPdf = ['thinkingmu', 'sundaycollective', 'goldieandace', 'tangerine'].includes(vendor);
  const nameMap: Record<string, string> = {
    ao76: 'Ao76', lenewblack: 'Le New Black', playup: 'Play UP',
    tinycottons: 'Tiny Big sister', armedangels: 'Armed Angels',
    thinkingmu: 'Thinking Mu', sundaycollective: 'The Sunday Collective',
    indee: 'Indee', goldieandace: 'Goldie and Ace', jenest: 'Jenest',
    onemore: '1+ in the family', wyncken: 'Wyncken', emileetida: 'Emile et Ida',
    bobochoses: 'Bobo Choses', minirodini: 'Mini Rodini',
    favoritepeople: 'Favorite People', mipounet: 'Mipounet', tangerine: 'Tangerine',
  };
  return `⚠️ Verwacht ${isPdf ? 'PDF' : 'CSV'} Formaat voor ${nameMap[vendor] || 'Flöss'}:`;
}

export default function UploadStep({ wizard }: UploadStepProps) {
  const plugin = wizard.selectedVendor
    ? wizard.getSupplier(wizard.selectedVendor)
    : null;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        📤 Upload Product Data
      </h2>
      <p className="text-gray-800 dark:text-gray-300 mb-6 font-medium">
        Selecteer eerst de leverancier en upload dan de productgegevens.
      </p>

      {/* Vendor Selection */}
      <div className="mb-8">
        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">
          1️⃣ Selecteer Leverancier
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {wizard.getAllSuppliers().map((p) => (
            <button
              key={p.id}
              onClick={() => {
                wizard.setSelectedVendor(p.id);
                wizard.setSupplierFiles({});
                wizard.setSupplierFileStatus({});
              }}
              className={`border-2 rounded-lg p-6 text-center transition-all ${
                wizard.selectedVendor === p.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
                {p.displayName}
              </h3>
              <p className="text-sm text-gray-800 dark:text-gray-300">
                {p.fileInputs.map((fi) => fi.label).join(' + ')}
              </p>
              {wizard.selectedVendor === p.id && (
                <div className="mt-3 text-green-600 font-bold">
                  ✓ Geselecteerd
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* File Upload */}
      {wizard.selectedVendor && plugin && (
        <>
          <div className="mb-6">
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">
              2️⃣ Upload Bestand
            </h3>

            {/* Automatic Defaults Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-blue-900 dark:text-blue-300 mb-3">
                ✨ Automatische Standaardinstellingen
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Productsoort:
                  </span>{' '}
                  <span className="text-gray-900 dark:text-gray-100">
                    Verbruiksartikel
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Gewicht:
                  </span>{' '}
                  <span className="text-gray-900 dark:text-gray-100">
                    0,20 kg
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Voorraad bijhouden:
                  </span>{' '}
                  <span className="text-green-600 dark:text-green-400">
                    ✓ Ingeschakeld
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Kassa:
                  </span>{' '}
                  <span className="text-green-600 dark:text-green-400">
                    ✓ Verkopen
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Website:
                  </span>{' '}
                  <span className="text-green-600 dark:text-green-400">
                    ✓ Gepubliceerd
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Inkoop:
                  </span>{' '}
                  <span className="text-red-600 dark:text-red-400">
                    ✗ Uitgeschakeld
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Voorraad:
                  </span>{' '}
                  <span className="text-gray-900 dark:text-gray-100">
                    0 (instelbaar)
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Out of stock bericht:
                  </span>{' '}
                  <span className="text-gray-900 dark:text-gray-100">
                    Verkocht!
                  </span>
                </div>
              </div>
              {wizard.selectedVendor === 'lenewblack' && (
                <p className="text-xs text-blue-800 mt-3 border-t border-blue-300 pt-2">
                  <strong>Le New Black specifiek:</strong> Verkoopprijs
                  wordt automatisch berekend als{' '}
                  <strong>2.5x de inkoopprijs</strong>. Je kunt dit later
                  aanpassen in stap 3.
                </p>
              )}
            </div>

            {/* Generic file inputs from plugin */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plugin.fileInputs.map((fi) => (
                  <div
                    key={fi.id}
                    className={`border-2 ${
                      wizard.supplierFileStatus[fi.id]
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                        : fi.required
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'
                          : 'border-gray-300 dark:border-gray-600'
                    } rounded-lg p-6 text-center`}
                  >
                    <div className="text-4xl mb-3">
                      {fi.type === 'pdf'
                        ? '📑'
                        : fi.type === 'xlsx'
                          ? '📊'
                          : '📄'}
                    </div>
                    <h4 className="font-bold text-lg mb-2 text-gray-900 dark:text-gray-100">
                      {fi.label}
                      {fi.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </h4>
                    <input
                      type="file"
                      accept={fi.accept}
                      onChange={(e) =>
                        fi.type === 'pdf'
                          ? wizard.handlePdfUpload(e, fi.id)
                          : wizard.handleFileUpload(e, fi.id)
                      }
                      className="hidden"
                      id={`file-upload-${fi.id}`}
                    />
                    <label
                      htmlFor={`file-upload-${fi.id}`}
                      className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                        wizard.supplierFileStatus[fi.id]
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {wizard.supplierFileStatus[fi.id]
                        ? '✅ Geladen'
                        : `Upload ${fi.type.toUpperCase()}`}
                    </label>
                  </div>
                ))}
              </div>

              {/* Optional image folder upload */}
              {plugin.imageUpload?.enabled && (
                <div className="mt-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                    🖼️ Afbeeldingen (optioneel)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Selecteer een map met productafbeeldingen of sleep bestanden.
                    Je kunt dit ook later doen in stap 5.
                  </p>
                  {plugin.imageUpload.exampleFilenames.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Voorbeeld: {plugin.imageUpload.exampleFilenames.slice(0, 2).join(', ')}
                    </p>
                  )}
                  <div className="flex gap-3">
                    {supportsDirectoryPicker() ? (
                      <label className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                        📁 Selecteer map
                        <input
                          type="file"
                          {...({ webkitdirectory: '', directory: '' } as any)}
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) wizard.addImagesFromFiles(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic self-center">
                        {isIOS()
                          ? 'Map selectie is niet beschikbaar op iOS. Gebruik "Selecteer bestanden" of sleep bestanden.'
                          : 'Map selectie is niet beschikbaar in deze browser.'}
                      </div>
                    )}
                    <label className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                      📎 Selecteer bestanden
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) wizard.addImagesFromFiles(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {wizard.imagePool.length > 0 && (
                    <div className="mt-3 text-sm">
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        ✓ {wizard.imagePool.filter((i) => i.assignedReference).length} afbeeldingen gematcht
                      </span>
                      {wizard.imagePool.filter((i) => !i.assignedReference).length > 0 && (
                        <span className="text-orange-600 dark:text-orange-400 ml-2">
                          · {wizard.imagePool.filter((i) => !i.assignedReference).length} niet gematcht
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tangerine: paste text */}
              {wizard.selectedVendor === 'tangerine' && (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Of: plak tekst uit screenshot
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Maak een duidelijke screenshot van de packing list,
                    gebruik een OCR-tool (bijv. online) om de tekst te
                    extraheren, en plak die hier. Of typ de tabel over.
                    Kolommen gescheiden door tab of meerdere spaties.
                  </p>
                  <textarea
                    value={wizard.tangerinePastedText}
                    onChange={(e) =>
                      wizard.setTangerinePastedText(e.target.value)
                    }
                    placeholder="Plak hier de tabel (eerste regel = kolomnamen, daarna datarijen met TG-xxx, SIZE, EAN, UNITS…)"
                    rows={6}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={wizard.handleTangerinePaste}
                    disabled={!wizard.tangerinePastedText.trim()}
                    className="mt-2 px-4 py-2 bg-amber-600 text-white rounded font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Importeer uit geplakte tekst
                  </button>
                </div>
              )}

              {/* Play UP hint */}
              {wizard.selectedVendor === 'playup' &&
                wizard.parsedProducts.length === 0 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <strong>Geen producten?</strong> Upload eerst het{' '}
                    <strong>EAN CSV</strong>-bestand (Reference, Description,
                    Size, Colour Code, EAN Code…). Zodra dat geladen is,
                    verschijnt hieronder de knop &quot;Ga verder&quot;. De
                    factuur PDF is optioneel (alleen voor hoeveelheden per
                    maat).
                  </div>
                )}

              {/* Go to next step */}
              {wizard.parsedProducts.length > 0 && (
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => wizard.setCurrentStep(2)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                  >
                    Ga verder met {wizard.parsedProducts.length} producten →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Format Preview */}
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <h4 className="font-bold text-yellow-900 text-gray-900 mb-2">
              {getVendorFormatLabel(wizard.selectedVendor)}
            </h4>
            <VendorFormatPreview vendor={wizard.selectedVendor} />
          </div>
        </>
      )}

      {/* ─── Document Import (Docling) ─────────────────────────────── */}
      <DoclingSection wizard={wizard} />

      {!wizard.selectedVendor && !wizard.doclingResult && (
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center">
          <p className="text-gray-800">
            👆 Selecteer een leverancier of importeer vanuit een document
          </p>
        </div>
      )}
    </div>
  );
}
