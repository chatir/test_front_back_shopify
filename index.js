// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',   // your front-shop domain
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your back-store Admin token

if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('🚨 Missing SHOPIFY_STORE or SHOPIFY_API_TOKEN in env');
  process.exit(1);
}

app.post('/create-draft-order', async (req, res) => {
  const { price, quantity } = req.body;
  if (!price || !quantity) {
    return res.status(400).json({ success: false, error: 'price & quantity required' });
  }

  // 1) ORDER N#xxxx for line-item title
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const title    = `ORDER N#${orderNum}`;

  try {
    // 2) Grab shop currency
    const { data: shopData } = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/shop.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }}
    );
    const currencyCode = shopData.shop.currency; // e.g. "EUR"

    // 3) Prepare GraphQL mutation
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { invoiceUrl }
          userErrors { message }
        }
      }`;
    const variables = {
      input: {
        useCustomerDefaultAddress: true,
        presentmentCurrencyCode: currencyCode,
        lineItems: [
          {
            title:            title,
            quantity:         parseInt(quantity, 10),
            originalUnitPrice: { amount: price, currencyCode },
            requiresShipping: true,
            taxable:          true
          }
        ]
      }
    };

    // 4) Call GraphQL Admin API
    const { data: gqlRes } = await axios.post(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'Content-Type':         'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN
        }
      }
    );

    // 5) Handle any errors
    const topErrors = gqlRes.errors || [];
    const userErrors = gqlRes.data?.draftOrderCreate.userErrors || [];
    const allErrors = [...topErrors, ...userErrors];
    if (allErrors.length) {
      const msg = allErrors.map(e => e.message || e).join('; ');
      return res.status(500).json({ success: false, error: msg });
    }

    // 6) Return the invoice URL
    const invoiceUrl = gqlRes.data.draftOrderCreate.draftOrder.invoiceUrl;
    return res.json({ success: true, url: invoiceUrl });

  } catch (err) {
    console.error('❌ DraftOrder error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
