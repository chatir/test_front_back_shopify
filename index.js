// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',  // your front-store domain
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

  // 1) Compute total = price * quantity
  const unit   = parseFloat(price);
  const qty    = parseInt(quantity, 10);
  if (isNaN(unit) || isNaN(qty)) {
    return res.status(400).json({ success: false, error: 'Invalid price or quantity' });
  }
  const totalAmount = (unit * qty).toFixed(2);

  // 2) Generate ORDER N#xxxx for the line‐item title
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const title    = `ORDER N#${orderNum}`;

  try {
    // 3) Fetch shop currency (required by GraphQL MoneyInput)
    const shopRes = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/shop.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN } }
    );
    const currencyCode = shopRes.data.shop.currency; // e.g. "EUR"

    // 4) Build the GraphQL mutation
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
        lineItems: [{
          title,                               // "ORDER N#xxxx"
          quantity: 1,                         // always 1 since total embedded
          originalUnitPrice: {
            amount: totalAmount,              // price * quantity
            currencyCode
          },
          requiresShipping: true,
          taxable:          true
        }]
      }
    };

    // 5) Call Shopify's GraphQL Admin API
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

    // 6) Gather errors (top‐level + userErrors)
    const top = gqlRes.errors || [];
    const user = gqlRes.data?.draftOrderCreate.userErrors || [];
    const allErrors = [...top, ...user];
    if (allErrors.length) {
      const msg = allErrors.map(e => e.message || e).join('; ');
      return res.status(500).json({ success: false, error: msg });
    }

    // 7) Return the invoice URL
    const invoiceUrl = gqlRes.data.draftOrderCreate.draftOrder.invoiceUrl;
    return res.json({ success: true, url: invoiceUrl });

  } catch (err) {
    console.error('❌ DraftOrder error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
