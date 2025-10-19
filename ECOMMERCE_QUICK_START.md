# 🛍️ E-commerce Insights - Quick Start

## What Was Created

A comprehensive e-commerce analytics page that provides deep insights into your online store performance.

## Access

**Navigation:** Dashboard → Inzichten → 🛍️ E-commerce Inzichten

**Direct URL:** `/ecommerce-insights`

---

## 5 View Modes

### 📊 Overview
- Year-over-year comparison cards with growth %
- Monthly revenue trend chart
- Orders per month bar chart
- Average order value line chart

### 📈 Comparison
- Detailed monthly comparison table
- Side-by-side metrics for all selected years
- Revenue, orders, and AOV for each month
- Yearly totals row

### 🏆 Top Producten
- Top 10 products bar chart (by revenue)
- Top 20 products table with details
- Quantity sold and revenue per product

### 👥 Klanten
- Customer insights: total, new, returning
- Average orders per customer
- Payment methods doughnut chart
- Payment method breakdown table

### ↩️ Retourzendingen
- Total cancelled orders and revenue
- Cancellation rate percentage
- Monthly returns breakdown table
- Information about cancelled orders

---

## Quick Actions

1. **Select Years:** Check/uncheck years at the top (default: current + previous year)
2. **Select Website:** Choose website from dropdown (default: Babette.)
3. **Switch Views:** Click the 5 tab buttons (Overview, Comparison, Products, Customers, Returns)
4. **Refresh:** Click 🔄 Vernieuwen to reload data

---

## Key Metrics

- **Omzet** = Total Revenue (including tax)
- **Orders** = Confirmed e-commerce orders only
- **Gem.** = Average Order Value (Revenue ÷ Orders)
- **Items** = Total quantity of products sold

---

## Data Source

- **Model:** `sale.order` and `sale.order.line`
- **Filter:** Website orders only (`website_id != false`)
- **Website Filter:** Can filter by specific website (default: Babette.)
- **Status:** Confirmed orders (state: 'sale' or 'done') + cancelled for return analysis
- **Years:** Select up to 5 years

---

## Files Created

1. **Frontend:** `/pages/ecommerce-insights.tsx`
   - React component with 4 view modes
   - Chart.js integration for visualizations
   - Responsive design (mobile & desktop)

2. **API:** `/pages/api/ecommerce-insights.ts`
   - Fetches sale orders from Odoo
   - Processes order lines
   - Calculates customer & payment metrics

3. **Navigation:** Updated `/components/Navigation.tsx`
   - Added link to Inzichten dropdown
   - Desktop and mobile menu support

4. **Documentation:**
   - `ECOMMERCE_INSIGHTS_GUIDE.md` - Comprehensive guide
   - `ECOMMERCE_QUICK_START.md` - This file

---

## Comparison with Other Pages

| Feature | E-commerce Insights | Sales Yearly Compare |
|---------|-------------------|---------------------|
| Data Source | `sale.order` (E-commerce) | `pos.order` (POS/Retail) |
| Orders | Website orders only | Point of Sale orders |
| Website Filter | ✅ Yes (filter by website) | ❌ No |
| Views | 5 modes (Overview, Comparison, Products, Customers, Returns) | 1 mode (Monthly comparison) |
| Charts | Line, Bar, Doughnut | Line only |
| Customer Insights | ✅ Yes | ❌ No |
| Payment Methods | ✅ Yes | ❌ No |
| Top Products | ✅ Yes (Top 20) | ❌ No |
| Return/Cancellation Tracking | ✅ Yes | ❌ No |

---

## Example Use Cases

### 📊 Monthly Performance Review
1. Select current year + previous year
2. Go to **Comparison** view
3. Compare same months year-over-year
4. Identify trends and patterns

### 🏆 Product Analysis
1. Select multiple years
2. Go to **Products** view
3. See top-selling products
4. Plan inventory and promotions

### 👥 Customer Behavior
1. Select recent years
2. Go to **Customers** view
3. Check new vs returning ratio
4. Optimize retention strategies

### ↩️ Return Analysis
1. Select recent years
2. Go to **Returns** view
3. Check cancellation rate
4. Identify months with high returns
5. Investigate causes and improve processes

### 📈 Growth Tracking
1. Select all available years
2. Go to **Overview** view
3. Check growth percentages
4. Review monthly trend charts

---

## Tips

✅ **Default website is Babette.** - Change if you want to see other websites  
✅ **Select 2-3 years** for best comparison visualization  
✅ **Use Overview** for high-level trends  
✅ **Use Comparison** for detailed month-by-month analysis  
✅ **Check Top Products** to guide inventory decisions  
✅ **Monitor Customer metrics** for retention insights  
✅ **Track Returns** to identify quality or process issues

❌ **Don't select too many years** (makes charts crowded)  
❌ **Don't compare incomplete years** (current year in progress)

---

## Next Steps

1. Visit `/ecommerce-insights` to see your data
2. Experiment with different year selections
3. Explore all 4 view modes
4. Export insights for business planning

For detailed information, see **ECOMMERCE_INSIGHTS_GUIDE.md**

---

**Created:** October 2025  
**Based on:** sales-yearly-compare page pattern  
**Technology:** Next.js, React, Chart.js, TypeScript, Odoo API

