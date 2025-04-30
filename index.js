// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',   // your front-store
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your shpat_… token

if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('🚨 Missing SHOPIFY_STORE or SHOPIFY_API_TOKEN in env');
  process.exit(1);
}

app.post('/create-draft-order', async (req, res) => {
  const { price, quantity } = req.body;
  if (!price || !quantity) {
    return res.status(400).json({ success:false, error:'price & quantity required' });
  }

  // 1) Build a random ORDER N#XXXX
  const orderNum = Math.floor(1000 + Math.random()*9000);
  const name     = `ORDER N#${orderNum}`;

  try {
    // 2) Get shop currency
    const shopRes = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/shop.json`,
      { headers:{ 'X-Shopify-Access-Token': ACCESS_TOKEN }}
    );
    const currencyCode = shopRes.data.shop.currency; // e.g. "EUR"

    // 3) Prepare GraphQL mutation
    const mutation = `
      mutation createDraft($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { invoiceUrl }
          userErrors { field message }
        }
      }
    `;
    const variables = {
      input: {
        name,
        useCustomerDefaultAddress: true,
        lineItems: [{
          title:            name,
          quantity:         parseInt(quantity, 10),
          priceOverride:    { amount: price, currencyCode },
          requiresShipping: true,
          taxable:          true
        }]
      }
    };

    // 4) Call Shopify GraphQL
    const gqlRes = await axios.post(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/graphql.json`,
      { query: mutation, variables },
      { headers:{
          'Content-Type':         'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN
      }}
    );

    // 5) Check for top-level GraphQL errors
    if (gqlRes.data.errors && gqlRes.data.errors.length) {
      const msg = gqlRes.data.errors.map(e=>e.message).join('; ');
      return res.status(500).json({ success:false, error:msg });
    }

    // 6) Extract payload
    const payload = gqlRes.data.data?.draftOrderCreate;
    if (!payload) {
      console.error('❌ Unexpected GraphQL payload:', gqlRes.data);
      return res.status(500).json({ success:false, error:'Unexpected GraphQL response' });
    }

    // 7) Handle userErrors
    if (payload.userErrors.length) {
      const msg = payload.userErrors.map(e=>e.message).join('; ');
      return res.status(500).json({ success:false, error:msg });
    }

    // 8) Success!
    const invoiceUrl = payload.draftOrder.invoiceUrl;
    return res.json({ success:true, url:invoiceUrl });

  } catch (err) {
    console.error('❌ DraftOrder error:', err.response?.data || err.message);
    const e = err.response?.data?.errors || err.message;
    return res.status(500).json({ success:false, error: e });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
