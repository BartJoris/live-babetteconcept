# 🌸 Emile et Ida Import Gids

## ✅ Wat is Geïmplementeerd

### Leverancier: Emile et Ida
**Emoji:** 🌸

### Ondersteunde Bestanden

1. **Order CSV** (Verplicht)
   - Headers: `Order id;Date;Status;Season;Brand name;...;Product name;Product reference;Color name;Description;Composition;Fabric / print;Size family name;Size name;EAN13;SKU;Quantity;Unit price;...`
   - Voorbeeld bestand: `order-3087203-20260206.csv`

2. **TARIF CSV** (Optioneel - voor RRP/verkoopprijzen)
   - Headers: `Saison;Famille;Marque;Référence;Couleur;Taille;Gencod;Désignation;WHLS EUR;RRP EUR`
   - Voorbeeld bestand: `TARIF WHLS RRP SS26 KID + WOMAN.csv`
   - Koppeling via EAN code (Gencod ↔ EAN13)

## 📊 Product Naam Formaat

**Formule:** `"Emile & Ida" - "Product name" - "Color name" (product reference)`

**Voorbeeld:**
- Input: Product name=`CHAPEAU`, Product reference=`AD207D`, Color name=`VIVI`
- Output: `Emile & Ida - Chapeau - Vivi (ad207d)`

**Let op:** 
- Brand wordt altijd "Emile & Ida" (met &)
- Product name → Sentence case (eerste letter groot)
- Color name → Sentence case (eerste letter groot)
- Reference → lowercase, tussen haakjes

## 🛒 E-commerce Reference

**Formule:** `"Product name" + "Fabric / print"` (indien beschikbaar)

**Voorbeeld:**
- Product name: `SAC A DOS IMPRIME`
- Fabric / print: (leeg of `100% COTON`)
- E-commerce: `SAC A DOS IMPRIME` of `SAC A DOS IMPRIME 100% COTON`

## 📏 Maat Conversie

### Enkele maten
| Emile et Ida | Weergave | Size Attribute |
|--------------|----------|----------------|
| `02A` | `2 jaar` | MAAT Kinderen |
| `03A` | `3 jaar` | MAAT Kinderen |
| `04A` | `4 jaar` | MAAT Kinderen |
| `10A` | `10 jaar` | MAAT Tieners |
| `14A` | `14 jaar` | MAAT Tieners |
| `03M` | `3 maand` | MAAT Baby's |
| `06M` | `6 maand` | MAAT Baby's |
| `12M` | `12 maand` | MAAT Baby's |
| `18M` | `18 maand` | MAAT Baby's |
| `TU` | `U` | (One Size) |

### Maat ranges
| Emile et Ida | Weergave |
|--------------|----------|
| `06-18M` | `6 - 18 maand` |
| `02A-04A` | `2 - 4 jaar` |
| `06A-08A` | `6 - 8 jaar` |

### Automatische Size Attribute Bepaling:
- **MAAT Baby's**: Als er maat-varianten zijn met "maand" (bijv. 3 maand, 6 maand)
- **MAAT Tieners**: Als er maat-varianten zijn met 10+ jaar
- **MAAT Kinderen**: Standaard voor andere maten

## 💰 Prijzen

### Met TARIF CSV:
- **Kostprijs:** `Unit price` uit Order CSV
- **Verkoopprijs:** `RRP EUR` uit TARIF CSV (gekoppeld via EAN)

### Zonder TARIF CSV:
- **Kostprijs:** `Unit price` uit Order CSV
- **Verkoopprijs:** `Unit price × 2.5` (standaard markup, aanpasbaar)

## 🔄 Import Workflow

1. **Selecteer** 🌸 Emile et Ida in de leverancier selectie
2. **Upload Order CSV** (verplicht)
   - Systeem parseert producten, varianten, EAN codes
3. **Upload TARIF CSV** (optioneel)
   - Systeem koppelt RRP prijzen via EAN/Gencod
4. **Controleer & Pas aan**
   - Prijzen, maten, productnamen zijn aanpasbaar
5. **Importeer naar Odoo**

## 📝 Technische Details

### Parser Locatie
`pages/product-import.tsx`:
- `parseEmileetidaCSV()` - Order CSV parser
- `parseEmileetidaTarifCSV()` - TARIF CSV parser voor RRP lookup

### State Variables
- `emileetidaOrderLoaded` - Boolean, Order CSV geladen
- `emileetidaTarifLoaded` - Boolean, TARIF CSV geladen
- `emileetidaPriceMap` - Map<EAN, RRP>, prijzen lookup

### Product Key
Producten worden gegroepeerd op: `Product reference` + `Color name`

## ⚠️ Belangrijke Opmerkingen

1. **Order CSV is verplicht** - Bevat alle basisgegevens
2. **TARIF CSV is optioneel** - Alleen nodig voor correcte verkoopprijzen
3. **EAN matching** - TARIF prijzen worden gekoppeld via exacte EAN match
4. **Europese prijsnotatie** - Komma's worden automatisch naar punten geconverteerd (34,1 → 34.1)

## 🧪 Test Data

Voorbeeld uit order CSV:
```csv
3087203;2025-06-28 15:45:25;Closed;SS26;Emile Et Ida;Administratif Bureau;SS26-KID;ACCESSORIES;CHAPEAU;AD207D;VIVI;;;100% COTON BIOLOGIQUE;06-18M,02A-04A,06A-08A;06-18M;3664547681381;AD207D|VIVI|06-18M;2;14;28,00;28,00;0;EUR
```

Resultaat:
- **Product:** `Emile & Ida - Chapeau - Vivi (ad207d)`
- **Maat:** `6 - 18 maand` (06-18M)
- **EAN:** `3664547681381`
- **Kostprijs:** €14,00
- **Verkoopprijs:** Via TARIF lookup of €35,00 (2.5x)
