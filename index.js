// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
// index.js (at the very top)
const allowedOrigins = [
  'https://hzy0h0-u6.myshopify.com',
  'https://becam.shop',             // ← your new custom domain
  'https://www.becam.shop'          // ← and if you also use the www version
];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl/Postman) or from our list
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your shpat_… token

if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('🚨 Missing SHOPIFY_STORE or SHOPIFY_API_TOKEN');
  process.exit(1);
}

app.post('/create-draft-order', async (req, res) => {
  const { price, quantity } = req.body;
  const unit = parseFloat(price);
  const qty  = parseInt(quantity, 10);

  if (isNaN(unit) || isNaN(qty)) {
    return res.status(400).json({ success: false, error: 'Invalid price or quantity' });
  }

  // 1️⃣ Compute total and ORDER N# title
  const total    = (unit * qty).toFixed(2);
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const title    = `ORDER N#${orderNum}`;

  try {
    // 2️⃣ Fetch shop currency
    const shopRes = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/shop.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }}
    );
    const currencyCode = shopRes.data.shop.currency;  // e.g. "EUR"

    // 3️⃣ Build GraphQL mutation
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { invoiceUrl }
          userErrors { message }
        }
      }
    `;
    const variables = {
      input: {
        useCustomerDefaultAddress: true,
        presentmentCurrencyCode: currencyCode,
        allowDiscountCodesInCheckout: true,    // ← enable the “Enter discount code” field
          note:  "Consult Services",
          tags:  ["Consult Services"],
        lineItems: [{
          title:                     title,
          quantity:                  1,                     // single line
          originalUnitPriceWithCurrency: {
            amount:       parseFloat(total),
            currencyCode
          },
          requiresShipping:          false,
          taxable:                   false
        }]
      }
    };

    // 4️⃣ Send to Shopify
    const { data } = await axios.post(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'Content-Type':          'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN
        }
      }
    );

    // 5️⃣ Handle errors
    const top    = data.errors || [];
    const user   = data.data?.draftOrderCreate.userErrors || [];
    const allErr = [...top, ...user];
    if (allErr.length) {
      const msg = allErr.map(e => e.message || e).join('; ');
      return res.status(500).json({ success: false, error: msg });
    }

    // 6️⃣ Success!
    const url = data.data.draftOrderCreate.draftOrder.invoiceUrl;
    res.json({ success: true, url });

  } catch (err) {
    console.error('❌ DraftOrder error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
