// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',   // your front-store domain
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your back-store Admin token

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

  // 1) Build total amount and a random ORDER N# title
  const total    = (unit * qty).toFixed(2);
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const title    = `ORDER N#${orderNum}`;

  try {
    // 2) Fetch shop currency (MoneyInput needs currencyCode)
    const shopRes = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/shop.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }}
    );
    const currencyCode = shopRes.data.shop.currency; // e.g. "EUR"

    // 3) Prepare GraphQL mutation with customLineItems
    const mutation = `
      mutation createDraft($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { invoiceUrl }
          userErrors   { message }
        }
      }
    `;
    const variables = {
      input: {
        useCustomerDefaultAddress: true,
        customLineItems: [
          {
            title,
            quantity: 1,                     // one line for the total
            price: {
              amount:       parseFloat(total),
              currencyCode
            },
            requiresShipping: true,
            taxable:          true
          }
        ]
      }
    };

    // 4) Call GraphQL Admin API
    const { data } = await axios.post(
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
    const topErrors  = data.errors || [];
    const userErrors = data.data.draftOrderCreate.userErrors || [];
    const allErrors  = [...topErrors, ...userErrors];
    if (allErrors.length) {
      const msg = allErrors.map(e => e.message || e).join('; ');
      return res.status(500).json({ success: false, error: msg });
    }

    // 6) Success → return the invoice URL
    const invoiceUrl = data.data.draftOrderCreate.draftOrder.invoiceUrl;
    return res.json({ success: true, url: invoiceUrl });

  } catch (err) {
    console.error('❌ DraftOrder error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
