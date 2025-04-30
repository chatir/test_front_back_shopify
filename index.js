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
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "r00r1r-nb.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // 
if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('🚨 Missing SHOPIFY_STORE or SHOPIFY_API_TOKEN');
  process.exit(1);
}

app.post('/create-draft-order', async (req, res) => {
  const { variant_id, quantity } = req.body;
  if (!variant_id || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'variant_id & quantity are required'
    });
  }

  // Build the GraphQL mutation
  const mutation = `
    mutation DraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { invoiceUrl }
        userErrors { message }
      }
    }
  `;
  const gid = `gid://shopify/ProductVariant/${variant_id}`;
  const variables = {
    input: {
      useCustomerDefaultAddress:    true,
      allowDiscountCodesInCheckout:  true,
      lineItems: [{
        variantId: gid,
        quantity:  parseInt(quantity, 10)
      }]
    }
  };

  try {
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

    // Collect any errors
    const errs = [
      ...(data.errors || []),
      ...(data.data.draftOrderCreate.userErrors || [])
    ];
    if (errs.length) {
      throw new Error(errs.map(e => e.message).join('; '));
    }

    // Success!
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
