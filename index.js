// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();

// Only allow your front‐store domain
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "r00r1r-nb.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your shpat_… token

if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('🚨 Missing SHOPIFY_STORE or SHOPIFY_API_TOKEN in environment');
  process.exit(1);
}

app.post('/create-draft-order', async (req, res) => {
  const { price, quantity } = req.body;
  const unit = parseFloat(price);
  const qty  = parseInt(quantity, 10);

  if (!Number.isFinite(unit) || !Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({
      success: false,
      error: 'price & quantity required'
    });
  }

  // Compute total and ORDER title
  const total    = (unit * qty).toFixed(2);
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const title    = `ORDER N#${orderNum}`;

  try {
    // 1) Fetch shop currency
    const shopRes = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/shop.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }}
    );
    const currencyCode = shopRes.data.shop.currency; // e.g. "EUR"

    // 2) Build GraphQL mutation
    const mutation = `
      mutation createDraft($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { invoiceUrl }
          userErrors { message }
        }
      }
    `;
    const variables = {
      input: {
        useCustomerDefaultAddress:    true,
        allowDiscountCodesInCheckout:  true,
        presentmentCurrencyCode:       currencyCode,
        note:                          "Consult Services",
        tags:                          ["Consult Services"],
        customLineItems: [
          {
            title:            title,
            quantity:         1,
            requiresShipping: false,
            taxable:          true,
            price: {
              amount:       parseFloat(total),
              currencyCode
            }
          }
        ]
      }
    };

    // 3) Send to Shopify GraphQL Admin API
    const response = await axios.post(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'Content-Type':          'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN
        }
      }
    );

    // 4) Debug log the full response
    console.log('▶️ GraphQL response:', JSON.stringify(response.data, null, 2));

    // 5) Handle top-level and userErrors
    const topErrors = response.data.errors || [];
    const userErrs  = response.data.data?.draftOrderCreate?.userErrors || [];
    const allErrs   = [...topErrors, ...userErrs];
    if (allErrs.length) {
      const msg = allErrs.map(e => e.message || e).join('; ');
      return res.status(500).json({ success: false, error: msg });
    }

    // 6) Return the invoice URL
    const invoiceUrl = response.data.data.draftOrderCreate.draftOrder.invoiceUrl;
    return res.json({ success: true, url: invoiceUrl });

  } catch (err) {
    console.error('❌ DraftOrder error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
