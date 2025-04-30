// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();

// Allow your front‐store origin
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your shpat_… token

app.post('/create-draft-order', async (req, res) => {
  const { title, price, quantity } = req.body;
  if (!title || !price || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'title, price & quantity are required'
    });
  }

  // Generate ORDER N#xxxx
  const orderNum = Math.floor(1000 + Math.random()*9000);
  const name     = `ORDER N#${orderNum}`;

  // GraphQL mutation
  const mutation = `
    mutation DraftOrder($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { invoiceUrl }
        userErrors { message }
      }
    }
  `;
  const variables = {
    input: {
      name,
      useCustomerDefaultAddress: true,
      customLineItems: [
        {
          title,
          price,
          quantity: parseInt(quantity, 10)
        }
      ]
    }
  };

  try {
    const { data } = await axios.post(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN
        }
      }
    );

    // GraphQL errors?
    if (data.errors?.length) {
      const msgs = data.errors.map(e => e.message).join('; ');
      throw new Error(msgs);
    }
    const errs = data.data.draftOrderCreate.userErrors;
    if (errs?.length) {
      throw new Error(errs.map(e => e.message).join('; '));
    }

    const url = data.data.draftOrderCreate.draftOrder.invoiceUrl;
    return res.json({ success: true, url });

  } catch (err) {
    console.error('⚠️ GraphQL error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
