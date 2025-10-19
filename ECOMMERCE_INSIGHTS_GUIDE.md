# 🛍️ E-commerce Insights Guide

## Overview

The **E-commerce Insights** page provides comprehensive analytics for your online store orders. This tool allows you to analyze e-commerce performance across multiple years, track customer behavior, and identify top-performing products.

## Features

### 📊 Multi-View Dashboard

The page includes 4 different view modes, each providing unique insights:

1. **Overview** - High-level metrics and trends
2. **Comparison** - Detailed monthly comparisons across years
3. **Products** - Top-selling product analysis
4. **Customers** - Customer behavior and payment methods

---

## View Modes

### 1. 📊 Overview Mode

**Key Metrics Cards:**
- **Total Revenue** - Total sales per year with year-over-year growth percentage
- **Number of Orders** - Total confirmed orders
- **Average Order Value** - Revenue divided by number of orders
- **Total Items** - Total quantity of products sold

**Charts:**
- **Monthly Revenue Trend** - Line chart showing revenue across all months
- **Orders per Month** - Bar chart comparing order counts
- **Average Order Value** - Line chart tracking AOV trends

**What You Can See:**
- Year-over-year revenue growth percentages
- Seasonal trends and patterns
- Monthly performance variations
- Average customer spending per order

---

### 2. 📈 Comparison Mode

**Detailed Monthly Table:**
- Side-by-side comparison of selected years
- Three metrics per year per month:
  - **Revenue** (Omzet)
  - **Order Count** (Orders)
  - **Average Order Value** (Gem.)
- **Total Row** - Yearly totals for each metric

**Use Cases:**
- Compare specific months across different years
- Identify growth or decline patterns
- Analyze seasonal performance differences
- Track year-over-year improvements

---

### 3. 🏆 Products Mode

**Top 10 Products Chart:**
- Horizontal bar chart showing revenue by product
- Color-coded for easy visualization
- Sorted by total revenue

**Product Details Table:**
- Top 20 products with rankings
- **Columns:**
  - Rank (#)
  - Product Name
  - Quantity Sold (Aantal)
  - Total Revenue (Omzet)
- Scrollable list for easy browsing

**Insights:**
- Best-selling products by revenue
- Product popularity by quantity
- Revenue concentration analysis

---

### 4. 👥 Customers Mode

**Customer Insights Panel:**
- **Total Customers** - Unique customers who placed orders
- **New Customers** - First-time buyers
- **Returning Customers** - Repeat purchasers
- **Avg Orders per Customer** - Customer engagement metric

**Payment Methods:**
- **Doughnut Chart** - Visual breakdown of payment method usage
- **Payment Details Table:**
  - Payment method name
  - Number of orders
  - Total revenue per payment method

**Use Cases:**
- Track customer retention
- Analyze payment preferences
- Measure customer loyalty
- Optimize payment options

---

## How to Use

### Selecting Years

1. Click the checkboxes next to years you want to compare
2. Select 1-5 years (default: current year + previous year)
3. Data loads automatically when years are selected
4. Charts and tables update in real-time

### Switching Views

- Click any of the 4 tab buttons at the top:
  - 📊 Overzicht
  - 📈 Vergelijking
  - 🏆 Top Producten
  - 👥 Klanten

### Refreshing Data

- Click the **🔄 Vernieuwen** button to reload data
- Useful after new orders are placed
- Maintains your current year selection

---

## Data Sources

The page fetches data from Odoo using the `sale.order` and `sale.order.line` models:

- **Orders:** Only confirmed e-commerce orders (state: 'sale' or 'done')
- **Website Orders Only:** Filters by `website_id != false`
- **Date Range:** Full calendar years (Jan 1 - Dec 31)
- **Line Items:** Product details, quantities, and revenue

---

## Key Metrics Explained

### Revenue (Omzet)
- Total sales amount including tax
- Based on `amount_total` from confirmed orders
- Grouped by month and year

### Order Count (Orders)
- Number of confirmed e-commerce orders
- Excludes cancelled or draft orders
- Only counts website/e-commerce orders

### Average Order Value (Gem.)
- **Formula:** Total Revenue ÷ Number of Orders
- Measures average customer spending per order
- Higher AOV indicates better customer value

### Items (Total Items)
- Sum of all product quantities sold
- Based on `product_uom_qty` from order lines
- Excludes service items and non-product lines

### New vs Returning Customers
- **New Customers:** Only one order in the selected period
- **Returning Customers:** Multiple orders in the period
- Based on unique partner IDs

---

## Tips & Best Practices

### 📈 Analysis Tips

1. **Compare Similar Periods:** Select consecutive years to track growth
2. **Identify Trends:** Look for seasonal patterns in monthly charts
3. **Monitor AOV:** Increasing AOV often indicates better product mix or pricing
4. **Track Customer Retention:** Higher returning customer rate = stronger business

### 🎯 Business Insights

- **Low AOV?** Consider upselling or bundling products
- **High New Customer Rate?** Focus on retention strategies
- **Seasonal Spikes?** Plan inventory and marketing accordingly
- **Top Products?** Ensure adequate stock and promotion

### 🔄 Regular Monitoring

- Check weekly for recent performance
- Monthly review of trends and patterns
- Quarterly comparison with previous years
- Annual analysis for strategic planning

---

## Technical Details

### API Endpoint
- **Route:** `/api/ecommerce-insights`
- **Method:** POST
- **Payload:** `{ uid, password, years: [2024, 2023] }`

### Data Processing
- Fetches all orders per selected year
- Groups revenue and orders by month
- Aggregates product sales across all years
- Calculates customer metrics and payment distributions

### Performance
- Optimized for up to 50,000 orders per year
- Uses Odoo's `search_read` with field filtering
- Client-side caching of fetched data
- Responsive charts with Chart.js

---

## Troubleshooting

### No Data Showing
- **Check:** Year selection (at least one year must be selected)
- **Verify:** Internet connection to Odoo server
- **Confirm:** You have e-commerce orders in the selected years

### Slow Loading
- **Reduce:** Number of years selected
- **Note:** First load may take longer (20-30 seconds for large datasets)
- **Optimize:** Odoo server performance if consistently slow

### Missing Products
- **Verify:** Products have `website_id` set (e-commerce products)
- **Check:** Orders are in 'sale' or 'done' state
- **Confirm:** Date range includes the orders

---

## Integration with Other Pages

This page complements other insights pages:

- **Sales Yearly Compare** - POS/retail sales comparison
- **Sales Products** - Detailed product performance
- **Brand Performance** - Brand-specific metrics

**Key Difference:** This page focuses exclusively on **e-commerce/website orders**, while other pages analyze **POS/retail sales**.

---

## Future Enhancements

Potential features for future versions:

- 📍 Geographic analysis (shipping locations)
- 📦 Shipping method breakdown
- 💳 Payment success/failure rates
- 🎁 Discount code effectiveness
- 📧 Customer segmentation by purchase behavior
- 🔔 Automated alerts for anomalies

---

## Support

For questions or issues:
1. Check this guide first
2. Review the sales-yearly-compare page for similar patterns
3. Contact your Odoo administrator for data access issues

---

**Last Updated:** October 2025  
**Version:** 1.0

