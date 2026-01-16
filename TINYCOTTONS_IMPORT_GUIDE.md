# Tiny Big sister Import Guide

## 📋 Overzicht

Deze guide legt uit hoe je producten importeert van **Tiny Big sister** (Tinycottons merknaam) naar je Odoo systeem.

## 🚀 Stap-voor-stap Import Procedure

### 1. **Navigeer naar Product Import**
   - Ga naar `/product-import`
   - Selecteer de **🎀 Tiny Big sister** leverancier

### 2. **Upload CSV Bestand**
   - Upload je Tiny Big sister order CSV bestand
   - Het systeem parseert automatisch:
     - ✅ Unieke producten (gegroepeerd op Product name)
     - ✅ Product varianten (verschillende maten)
     - ✅ Prijzen (Unit price en RRP)
     - ✅ EAN barcodes

### 3. **Review Geparseerde Producten** (Stap 2)
   - Controleer de product tabel
   - Elke rij = één product variant
   - Verifieer:
     - Product namen (format: "Tiny Big sister - [Product name]")
     - Maten (bijv. 34, 36, 38, etc. - MAAT Volwassenen)
     - Prijzen in EUR
     - EAN barcodes

### 4. **Bewerk Product Namen & Voorraad** (Stap 3)
   - Pas productnamen aan indien nodig
   - Stel voorraad aantallen in (standaard uit CSV)
   - Gebruik "📦 Voorraad 0" knop om alles op 0 te zetten
   - Of importeer met de standaard aantallen

### 5. **Wijs Categorieën Toe** (Stap 4)
   - Selecteer primaire categorie voor elk product
   - Gebruik batch selectie voor meerdere producten tegelijk
   - Voorbeeld categorieën:
     - Clothing > Dresses
     - Clothing > Shorts
     - Clothing > T-Shirts
     - Accessories > Socks
     - Accessories > Hair Clips

### 6. **Review & Importeer** (Stap 5-7)
   - Bekijk de preview van te importeren producten
   - Klik "Import Products" om naar Odoo te sturen
   - Monitor de voortgang
   - Controleer resultaten op eventuele fouten

## 📊 CSV Formaat Vereisten

### Verwachte Structuur

Je CSV **moet** deze kolommen hebben (semicolon-gescheiden):

**Verplicht:**
- `Product name` - Productnaam (bijv. "Alma Fruits Short")
- `EAN13` - EAN barcode
- `Size name` - Maat (bijv. "34", "36", "O/S W")
- `Quantity` - Aantal
- `Unit price` - Inkoopprijs (komma decimaal: `47,6`)
- `RRP` - Recommended Retail Price (komma decimaal: `119`)

**Optioneel maar nuttig:**
- `Order id` - Order referentie
- `Season` - Seizoen (bijv. "SS26")
- `Brand name` - Merknaam (Tinycottons)
- `Category` - Product categorie (bijv. "Shorts", "Dresses")
- `Composition` - Materiaal samenstelling (bijv. "100% cotton")

### Belangrijke Kenmerken
- Decimalen gebruiken **komma's** niet punten (`47,6` niet `47.6`)
- Eerste regel: Headers
- Tweede regel en verder: Data
- Één rij = één variant

### Voorbeeld CSV:

```csv
Order id;Season;Brand name;Category;Product name;Composition;Size name;EAN13;Quantity;Unit price;RRP
3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;34;8434525598872;1;47,6;119
3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;36;8434525598889;1;47,6;119
3117410;SS26;Tinycottons;Dresses;Ruffle Dress;exterior: 100% acetate lining: 100% cotton;34;8434525595345;1;59,6;149
```

### Productnaam Formatting
Het systeem formatteert automatisch productnamen:
- **Input:** "Alma Fruits Short"
- **Output:** "Tiny Big sister - Alma fruits short"

## ✨ Automatische Instellingen

Alle geïmporteerde Tiny Big sister producten krijgen automatisch:
- ✅ **Productsoort**: Verbruiksartikel
- ✅ **Gewicht**: 0,20 kg (per variant)
- ✅ **Kassa**: ✓ Kan verkocht worden
- ✅ **Website**: Gepubliceerd
- ✅ **Facturatiebeleid**: Geleverde hoeveelheden
- ✅ **Merk**: Auto-gedetecteerd (Tiny Big sister / Tinycottons brand in Odoo)
- ✅ **Maat Attribuut**: MAAT Volwassenen (voor alle producten)

## 🔧 Maat Attributen

Alle Tiny Big sister producten krijgen automatisch:
- **Maat Attribuut**: "MAAT Volwassenen" (voor alle maten: 34, 36, 38, 40, 42, O/S W)

## 💡 Tips & Best Practices

1. **Controleer EAN Codes**
   - Zorg dat alle EAN13 barcodes uniek zijn
   - Het systeem waarschuwt bij duplicaten

2. **Materiaal Samenstelling**
   - De "Composition" kolom wordt opgeslagen als materiaal
   - Nuttig voor product beschrijvingen

3. **Categorie Mapping**
   - Tiny Big sister heeft duidelijke categorieën in CSV
   - Map deze naar de juiste Odoo categorieën

4. **Voorraad Beheer**
   - Standaard wordt het aantal uit de CSV gebruikt
   - Pas aan indien nodig vóór import

5. **Brand Auto-detectie**
   - Het systeem zoekt automatisch naar "Tiny Big sister" of "Tinycottons" merk in Odoo
   - Zorg dat het merk bestaat vóór import

## 🐛 Troubleshooting

### Probleem: CSV wordt niet geparsed
**Oplossing:** Controleer of:
- Het bestand semicolon-gescheiden is (`;`)
- Headers matchen exact: `Product name`, `EAN13`, etc.
- Er minimaal 2 regels zijn (header + data)

### Probleem: Verkeerde prijzen
**Oplossing:**
- Check of decimalen komma's gebruiken: `47,6` niet `47.6`
- Controleer `Unit price` en `RRP` kolommen

### Probleem: Producten worden niet gegroepeerd
**Oplossing:**
- Controleer of `Product name` exact hetzelfde is voor varianten
- Maten moeten verschillen per variant

### Probleem: Brand niet gevonden
**Oplossing:**
- Maak eerst "Tiny Big sister" of "Tinycottons" merk aan in Odoo
- Of selecteer handmatig het merk tijdens import

## 📁 Voorbeeld Bestand

Zie: `example-import/tinycottons/Tiny Big sister 2026.csv`

Dit bevat:
- 41 unieke producten
- 139 varianten
- Alle product categorieën (Shorts, Dresses, T-Shirts, Accessories, etc.)

## ✅ Checklist voor Import

- [ ] CSV bestand gedownload van Tiny Big sister
- [ ] "Tiny Big sister" of "Tinycottons" merk bestaat in Odoo
- [ ] Product categorieën voorbereid
- [ ] CSV structuur geverifieerd
- [ ] Leverancier geselecteerd in import wizard (🎀 Tiny Big sister)
- [ ] CSV geüpload en geparsed
- [ ] Product namen gecontroleerd (moeten "Tiny Big sister - ..." zijn)
- [ ] Maat attribuut is "MAAT Volwassenen" (automatisch ingesteld)
- [ ] Voorraad aantallen aangepast
- [ ] Categorieën toegewezen
- [ ] Import voltooid
- [ ] Producten geverifieerd in Odoo

## 🆘 Support

Bij problemen:
1. Check console logs in browser (F12)
2. Verifieer CSV formaat met voorbeeld
3. Controleer Odoo connectie
4. Check audit logs in `/audit-monitor`
