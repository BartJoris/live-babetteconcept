# Product Import Setup Instructions

## 🔧 Quick Setup (2 Steps)

### Step 1: Ensure Environment Variables

Make sure your `.env.local` file contains these variables:

```bash
ODOO_URL=https://www.exampleodoo.com/jsonrpc
ODOO_DB=exampleodoo.com
ODOO_USERNAME=admin@exampleodoo.com
ODOO_PASSWORD=adminpassword
```

**Note:** You already have this file with these credentials based on your chat history.

### Step 2: Restart Development Server

The new `callOdooMethod` function needs a server restart to work:

```bash
# Stop your current server (Ctrl+C if running)
# Then restart:
npm run dev
```

---

## ✅ Testing

Once the server restarts:

1. **Visit**: http://localhost:3000/product-import
2. **Upload** your `leverancier.csv`
3. **Go to Step 4** (Categorieën)
4. **Click** "🔄 Vernieuw Data" button
5. **You should see**:
   - 57 merken
   - 227 interne categorieën  
   - 6 eCommerce categorieën
   - 1 productlabels

If you see `0` for all, check:
- Browser console for errors
- Terminal for API errors
- Ensure server was restarted

---

## 🧪 Test Database (Optional)

To test on your test database first, temporarily change `.env.local`:

```bash
ODOO_URL=https://YOUR-TEST-DB.odoo.com/jsonrpc
ODOO_DB=your-test-db-name
```

Then restart the server.

---

## 🐛 If Categories Still Show 0

1. **Check** `/categories-explorer` - Does this page load categories?
2. **If yes**: The API is working, just needs page refresh
3. **If no**: Check terminal for authentication errors

---

## 📊 What Should Load

When clicking "🔄 Vernieuw Data" you should see in browser console:

```
✅ Fetched 57 brands
✅ Loaded 227 internal categories
✅ Loaded 6 public categories
✅ Loaded 1 product tags
```

Then all dropdowns will populate automatically!

---

Ready to test! 🚀

