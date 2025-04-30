// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',   // your front shop domain
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your back-shop Admin token

app.post('/create-draft-order', async (req, res) => {
  const { price, quantity } = req.body;
  if (!price || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'Missing price or quantity'
    });
  }

  // 1) Generate ORDER N#xxxx
  const orderNum = Math.floor(1000 + Math.random()*9000);
  const name     = `ORDER N#${orderNum}`;

  // 2) GraphQL mutation for custom line-item
  const mutation = `
    mutation DraftOrderCreate($input: DraftOrderInput!) {
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
          title:    name,           // we don't care about product title
          price:    price,          // exactly the front-end price
          quantity: parseInt(quantity, 10)
        }
      ]
    }
  };

  try {
    // 3) Call Shopify Admin GraphQL
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

    // 4) Handle errors
    if (data.errors?.length) {
      throw new Error(data.errors.map(e=>e.message).join('; '));
    }
    const errs = data.data.draftOrderCreate.userErrors;
    if (errs.length) {
      throw new Error(errs.map(e=>e.message).join('; '));
    }

    // 5) Return invoice URL
    const invoiceUrl = data.data.draftOrderCreate.draftOrder.invoiceUrl;
    return res.json({ success: true, url: invoiceUrl });

  } catch (err) {
    console.error('GraphQL error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
