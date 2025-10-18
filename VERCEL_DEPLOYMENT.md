# Vercel Deployment Configuration

## Timeout Settings

The HVID Import API (`/api/check-duplicate-barcodes`) can take 15-30 seconds to process large invoices because it:
- Checks 30+ barcodes against Odoo
- Fetches attribute information for base products
- Makes multiple API calls to Odoo

### Configuration

`vercel.json` sets all API functions to **30 seconds maximum**:
```json
{
  "functions": {
    "pages/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

### Vercel Plan Requirements

- **Hobby (Free) Plan**: Maximum 10 seconds per function
- **Pro Plan**: Maximum 60 seconds per function
- **Enterprise Plan**: Maximum 900 seconds per function

**If you're on the Hobby plan**, you'll need to either:
1. Upgrade to Pro plan ($20/month)
2. Or reduce the number of products processed at once (upload in smaller batches)

### Performance Optimizations

The API includes several optimizations:
- ✅ **Attribute caching**: Fetches each base product's attributes once, reuses for all variants
- ✅ **Sequential processing with error handling**: One product fails ≠ entire batch fails
- ✅ **Batch Odoo calls**: Minimizes round-trips where possible

### Typical Processing Times

- **15 products**: ~5-8 seconds
- **30 products**: ~12-20 seconds  
- **50+ products**: ~25-30 seconds (may timeout on Hobby plan)

### Troubleshooting Timeouts

If you experience timeouts:

1. **Check Vercel plan**: Hobby = 10s limit, Pro = 60s limit
2. **Process in batches**: Upload smaller CSVs (15-20 products at a time)
3. **Check Vercel logs**: See exactly where it's timing out
4. **Upgrade to Pro**: Most reliable solution for large invoices

### Alternative: Split Large Invoices

For large supplier invoices (50+ products):
1. Split CSV into multiple files
2. Process 20 products at a time
3. Or use the manual barcode input for specific products

## Environment Variables

Make sure these are set in Vercel:
- `ODOO_URL` - Your Odoo instance URL
- `ODOO_DB` - Your Odoo database name

## Build Configuration

TypeScript target is set to **ES2020** in `tsconfig.json` to support:
- Modern JavaScript features
- Regex `/s` flag (dotall)
- Optional chaining and nullish coalescing

## Deployment Checklist

Before deploying:
- [ ] Verify Vercel plan supports required timeout (30s = Pro plan needed)
- [ ] Set environment variables in Vercel dashboard
- [ ] Test with small batch first (5-10 products)
- [ ] Monitor Vercel function logs for performance
- [ ] Consider caching strategy for production use

## Support

For deployment issues, check:
1. Vercel function logs (see exact error messages)
2. Build logs (TypeScript compilation errors)
3. Runtime logs (API execution errors)

