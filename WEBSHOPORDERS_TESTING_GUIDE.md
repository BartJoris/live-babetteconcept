# Webshoporders - Testing Guide voor Nieuwe Orders

## 🎯 Wat is er gebouwd?

Een volledig geautomatiseerd systeem om webshop orders te beheren zonder Odoo te bezoeken!

### Features:
1. ✅ **Product Beschikbaarheid Check** - Zie voorraad voordat je bevestigt
2. ✅ **Levering Bevestigen** - Bevestig picking/delivery vanuit de website
3. ✅ **Auto-verzending naar Sendcloud** - Triggert automatisch label creatie
4. ✅ **Label Download** - Download verzendlabel direct
5. ✅ **Dubbele Label Preventie** - Voorkomt duplicate Sendcloud labels

---

## 🧪 Testprocedure bij Nieuwe Order

### Stap 1: Open Webshoporders Beheren
```
http://localhost:3000/webshoporders-beheren
```

### Stap 2: Vind de Nieuwe Order
- Klik op de order om uit te klappen
- Noteer het ordernummer (bijv. S02158)

### Stap 3: Bevestig Order
1. Klik **"✅ Bevestig Order"**
2. **Dialog verschijnt** met product beschikbaarheid:
   ```
   Product: The tiny big sister - Chloe striped sweater
   Benodigd: 1
   Voorraad: X
   Status: ✅ OK (of ❌ Te weinig)
   ```
3. Klik **"✅ Bevestig Order"** (of "⚠️ Bevestig Toch")
4. ✅ Alert: "Order bevestigd! ✅"
5. ✅ Button verandert naar "✅ Order Bevestigd"

### Stap 4: Bevestig Levering
1. Klik **"📦 Bevestig Levering"**
2. **Dialog verschijnt** met picking details:
   ```
   ODK/OUT/00633
   Status: assigned
   
   Product: The tiny big sister - Chloe striped sweater
   Benodigd: 1
   Gereserveerd: 1
   Klaar: 0
   ```
3. Klik **"✅ Bevestig Levering"** in dialog
4. ✅ Alert: "Levering bevestigd! ✅
             Verzonden naar Sendcloud - verzendlabel wordt aangemaakt."
5. ✅ Button verdwijnt

### Stap 5: Download Verzendlabel
1. **Wacht 3-5 seconden** (Sendcloud maakt label aan)
2. Klik **🔄 Vernieuwen** om order list te verversen
3. Klik **"📦 Download Verzendlabel"**
4. ✅ PDF downloadt: `ShippingLabel_S02158.pdf`

---

## 📊 Wat te Controleren in Terminal/Console

### Bij Stap 3 (Bevestig Order):
```
📦 Checking product availability for order: 2158
✅ Availability check completed
```

### Bij Stap 4 (Bevestig Levering):
**Let op deze logs:**
```
📦 Fetching picking details for order: 2158
✅ Found 1 picking(s): [{ id: 12XXX, name: 'ODK/OUT/00633', state: 'assigned' }]
✅ Found 2 products from order

🚚 handleConfirmDelivery called...
📤 Confirming delivery with /api/confirm-delivery

════════════════════════════════════════
📦 CONFIRMING PICKING 12XXX
   Name: ODK/OUT/00633
   Current State: assigned
════════════════════════════════════════

Attempting direct state change to 'done'...
✅ Write result: true
✅ FINAL STATE: done

📮 Checking for existing shipping label...
Found 0 existing label(s): []
✅ No existing label found - proceeding with send to shipper
✅ Auto-sent to shipper
✅ Delivery confirmation completed
```

**Belangrijk te checken:**
- ✅ `FINAL STATE: done` (moet 'done' zijn, niet 'assigned')
- ✅ `Found 0 existing label(s)` (eerste keer)
- ✅ `Auto-sent to shipper` (Sendcloud getriggered)

### Als je Dubbel Klikt (Test Duplicate Prevention):
```
📮 Checking for existing shipping label...
Found 1 existing label(s): [ 'LabelShipping-sendcloud-XXX.pdf' ]
⚠️ Shipping label already exists - SKIPPING send to shipper to prevent duplicates
```

---

## ❌ Mogelijke Problemen & Oplossingen

### Probleem 1: State Blijft 'assigned'
**Symptoom:**
```
✅ FINAL STATE: assigned  ← Moet 'done' zijn!
```

**Oorzaak:**
Odoo blokkeert de state change omdat validaties niet kloppen (qty_done niet ingesteld)

**Oplossing:**
We moeten `qty_done` instellen voordat we state naar 'done' zetten.

**Fix:** (Vertel me als dit gebeurt, ik pas de code aan)

### Probleem 2: Label Bestaat Niet na 5 Seconden
**Symptoom:**
"Geen verzendlabel gevonden" bij download

**Mogelijke Oorzaken:**
- Sendcloud webhook is traag
- action_send_to_shipper werkte niet
- Sendcloud configuratie issue

**Check:**
1. Ga naar Odoo → Picking → Verzend bericht tab
2. Zie je "Shipment created in Sendcloud"?
3. Zie je tracking nummer?

### Probleem 3: Duplicate Labels
**Symptoom:**
2 labels in Sendcloud voor dezelfde order

**Oplossing:**
✅ Automatisch opgelost! De code checkt nu eerst of label bestaat.

---

## 🔍 Debug Checklist

Als iets niet werkt, check het volgende:

### Backend (Terminal):
- [ ] Dev server draait (`npm run dev`)
- [ ] Geen errors in terminal
- [ ] Logs tonen correct state changes
- [ ] "FINAL STATE: done" verschijnt
- [ ] "Auto-sent to shipper" verschijnt

### Frontend (Browser Console F12):
- [ ] Geen rode errors
- [ ] Network tab toont 200 responses (niet 401/500)
- [ ] POST /api/confirm-delivery succesvol

### Odoo:
- [ ] Order state = "Sale Order" (Verkooporder)
- [ ] Picking state = "Done" (Voltooid)
- [ ] Verzend bericht tab toont Sendcloud notificatie
- [ ] Tracking nummer zichtbaar
- [ ] PDF attachment bestaat op picking

---

## 📋 Verwachte Resultaten

### In je Website:
1. ✅ Order bevestigd zonder Odoo te bezoeken
2. ✅ Levering bevestigd zonder Odoo te bezoeken
3. ✅ Label automatisch aangemaakt
4. ✅ Label gedownload als PDF
5. ✅ Totale tijd: ~1 minuut (was 2-3 minuten)

### In Odoo:
1. ✅ Order state: "Sale Order"
2. ✅ Picking state: "Done"
3. ✅ Verzend bericht: "Shipment created in Sendcloud"
4. ✅ Tracking nummer: 3232...
5. ✅ PDF attachment: LabelShipping-sendcloud-XXX.pdf

### In Sendcloud Dashboard:
1. ✅ Nieuwe shipment aangemaakt
2. ✅ Status: "Geprint" of "Ready"
3. ✅ Tracking nummer gekoppeld
4. ✅ **Geen duplicaten!**

---

## 🚨 Wat te Doen als het Niet Werkt

1. **Kopieer ALLE terminal logs** vanaf het moment dat je klikt
2. **Kopieer browser console errors** (F12 → Console tab)
3. **Check Odoo picking state** - is het 'done' of nog 'assigned'?
4. **Screenshot van de error/dialog**

Stuur me deze informatie en ik kan het probleem onmiddellijk identificeren en fixen!

---

## 💡 Tips

### Best Practice:
- Ververs de order list (🔄) voordat je begint
- Wacht 3-5 seconden na "Bevestig Levering" voordat je label download
- Check altijd de terminal logs als iets misgaat

### Snelheid:
- Product check: ~1 seconde
- Order bevestiging: ~1 seconde  
- Delivery bevestiging: ~2 seconden
- Sendcloud trigger: automatisch
- Label aanmaak: 2-5 seconden
- **Totaal: ~1 minuut!** ⚡

---

## 🎉 Success Criteria

Je weet dat alles werkt als:
- ✅ Alle dialogs tonen correcte data
- ✅ Buttons verschijnen en verdwijnen correct
- ✅ Terminal toont "FINAL STATE: done"
- ✅ Terminal toont "Auto-sent to shipper"
- ✅ Label download zonder errors
- ✅ Odoo toont "Shipment created in Sendcloud"
- ✅ **Geen duplicate labels in Sendcloud!**

---

**Bij de volgende nieuwe order, volg deze guide en laat me weten hoe het gaat!** 🚀

Als er problemen zijn, kopieer de terminal logs en ik fix het meteen.


