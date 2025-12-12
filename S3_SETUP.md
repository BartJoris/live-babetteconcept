# AWS S3 Setup voor Inventaris Opslag

Deze applicatie ondersteunt **hybride opslag**: zowel lokale opslag (localStorage) als AWS S3. Dit geeft je flexibiliteit om te kiezen waar je inventarissen wilt opslaan.

## 🚀 Setup Instructies

### 1. AWS S3 Bucket Aanmaken

1. **Ga naar AWS Console**
   - Log in op [aws.amazon.com](https://aws.amazon.com)
   - Ga naar **S3** service

2. **Maak een nieuwe bucket**
   - Klik op **Create bucket**
   - Geef het een naam (bijv. `babette-inventories`)
   - Kies een regio (bijv. `eu-central-1` voor Europa)
   - **Block Public Access**: Laat standaard instellingen staan (alles geblokkeerd)
   - Klik op **Create bucket**

3. **Configureer CORS** (optioneel, voor directe browser uploads)
   - Ga naar je bucket → **Permissions** → **CORS**
   - Voeg deze configuratie toe:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedOrigins": ["https://your-domain.vercel.app"],
       "ExposeHeaders": []
     }
   ]
   ```

### 2. IAM User en Credentials Aanmaken

1. **Ga naar IAM**
   - In AWS Console, ga naar **IAM** service
   - Klik op **Users** → **Create user**

2. **Configureer gebruiker**
   - Geef een naam (bijv. `babette-s3-user`)
   - Kies **Programmatic access** (niet console access)
   - Klik op **Next**

3. **Voeg permissions toe**
   - Kies **Attach policies directly**
   - Zoek en selecteer: **AmazonS3FullAccess** (of maak een custom policy met alleen je bucket)
   - Klik op **Next** → **Create user**

4. **Kopieer credentials**
   - Na het aanmaken zie je:
     - **Access Key ID**
     - **Secret Access Key** (alleen nu zichtbaar!)
   - **⚠️ BELANGRIJK**: Kopieer deze direct, de secret key is daarna niet meer zichtbaar

### 3. Custom IAM Policy (Aanbevolen voor Productie)

Voor betere security, maak een custom policy die alleen toegang geeft tot je specifieke bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::babette-inventories/*",
        "arn:aws:s3:::babette-inventories"
      ]
    }
  ]
}
```

### 4. Environment Variables Toevoegen

Voeg deze variabelen toe aan je Vercel project en `.env.local`:

```env
# AWS S3 Configuration
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME=babette-inventories
```

**Via Vercel Dashboard:**
- Ga naar je project → **Settings** → **Environment Variables**
- Voeg alle 4 variabelen toe
- Zorg dat ze beschikbaar zijn voor **Production**, **Preview**, en **Development**

**Voor lokale ontwikkeling:**
- Voeg ze toe aan `.env.local` (dit bestand staat al in `.gitignore`)

### 5. Deploy

Na het toevoegen van de environment variables:

```bash
# Push naar GitHub (als je CI/CD gebruikt)
git add .
git commit -m "Add S3 support for inventory storage"
git push

# Of deploy handmatig
vercel --prod
```

## 📊 Hoe het Werkt

### Data Structuur in S3

Inventarissen worden opgeslagen met de volgende structuur:

```
s3://your-bucket/
  └── inventories/
      └── {userId}/
          └── {inventory-name}-{timestamp}.json
```

Elke gebruiker heeft zijn eigen map, waardoor data geïsoleerd blijft.

### Opslag Opties

De applicatie ondersteunt twee opslagmethoden:

1. **💾 Lokaal (localStorage)**
   - Snel en direct beschikbaar
   - Geen server nodig
   - Beperkt tot ~5-10MB per browser
   - Data blijft alleen in die browser

2. **☁️ S3 Bucket**
   - Persistente opslag
   - Beschikbaar op alle apparaten
   - Onbeperkte opslag (binnen AWS limieten)
   - Vereist AWS credentials

### API Endpoints

- **GET** `/api/inventaris/s3/list` - Lijst alle S3 inventarissen voor de ingelogde gebruiker
- **POST** `/api/inventaris/s3/upload` - Upload een inventaris naar S3
- **GET** `/api/inventaris/s3/get?key={key}` - Haal een specifieke inventaris op
- **GET** `/api/inventaris/s3/download?key={key}` - Genereer een download URL
- **DELETE** `/api/inventaris/s3/delete?key={key}` - Verwijder een inventaris

Alle endpoints zijn beveiligd met `withAuth` middleware.

## 🔧 Troubleshooting

### "S3 bucket not configured"

**Oplossing:**
- Controleer of `AWS_S3_BUCKET_NAME` correct is ingesteld
- Zorg dat alle AWS environment variables aanwezig zijn
- Herstart je development server na het toevoegen van variabelen

### "Access Denied" errors

**Oplossing:**
- Controleer of je IAM user de juiste permissions heeft
- Verifieer dat `AWS_ACCESS_KEY_ID` en `AWS_SECRET_ACCESS_KEY` correct zijn
- Controleer of de bucket naam overeenkomt met `AWS_S3_BUCKET_NAME`

### "Failed to upload to S3"

**Oplossing:**
- Controleer of de bucket bestaat en toegankelijk is
- Verifieer de AWS regio (`AWS_REGION`) komt overeen met je bucket regio
- Controleer CORS instellingen als je directe browser uploads gebruikt

### S3 optie is grijs/uitgeschakeld

**Oplossing:**
- Dit betekent dat S3 niet correct is geconfigureerd
- Controleer alle environment variables
- Kijk in de browser console voor specifieke foutmeldingen

## 💰 Kosten

AWS S3 heeft een **gratis tier**:
- **Free Tier**: 5 GB storage, 20K GET requests, 2K PUT requests per maand (12 maanden)
- **Na free tier**: ~$0.023 per GB/maand storage, $0.0004 per 1K GET requests

Voor kleine JSON-bestanden (inventarissen) is de gratis tier meestal ruim voldoende.

## 🔐 Beveiliging

- Alle API endpoints zijn beschermd met `withAuth` middleware
- Alleen ingelogde gebruikers kunnen inventarissen opslaan/ophalen
- Inventarissen zijn per gebruiker geïsoleerd (via `userId` in de S3 key)
- S3 bucket heeft standaard geen publieke toegang
- Data wordt versleuteld in transit (HTTPS) en at rest (S3 encryption)

## 📝 Migratie tussen Opslagmethoden

Je kunt eenvoudig inventarissen migreren tussen lokale en S3 opslag:

1. **Van lokaal naar S3:**
   - Download de lokale inventaris
   - Upload het bestand via de upload knop
   - Kies "S3 Bucket" als opslag locatie

2. **Van S3 naar lokaal:**
   - Download de S3 inventaris
   - Upload het gedownloade bestand
   - Kies "Lokaal (localStorage)" als opslag locatie

## 🎯 Best Practices

1. **Gebruik S3 voor belangrijke inventarissen** die je niet wilt verliezen
2. **Gebruik lokaal voor tijdelijke/test inventarissen** voor snelle toegang
3. **Maak regelmatig backups** door belangrijke inventarissen te downloaden
4. **Monitor AWS kosten** via AWS Cost Explorer als je veel data opslaat
5. **Gebruik IAM policies** om toegang te beperken tot alleen je bucket

