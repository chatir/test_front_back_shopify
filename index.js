// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();

// Allow only your front‐store to call this endpoint
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // your shpat_… Admin API token

app.post('/create-draft-order', async (req, res) => {
  const { variant_id, quantity, price } = req.body;
  if (!variant_id || !quantity || !price) {
    return res.status(400).json({
      success: false,
      error: 'variant_id, quantity & price required'
    });
  }

  // Generate a random 4-digit ORDER number
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const name     = `ORDER N#${orderNum}`;

  // Build the REST payload
  const payload = {
    draft_order: {
      line_items: [
        {
          variant_id: variant_id,
          quantity: quantity,
          price: price           // override with the front-end price
        }
      ],
      name: name,               // custom draft order title
      use_customer_default_address: true
    }
  };

  try {
    // Call Shopify's REST Admin API to create the draft order
    const response = await axios.post(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/draft_orders.json`,
      payload,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    // Pull out the invoice URL and return it
    const invoiceUrl = response.data.draft_order.invoice_url;
    return res.json({ success: true, url: invoiceUrl });

  } catch (error) {
    console.error('REST API error:', error.response?.data || error.message);
    const err = error.response?.data?.errors || error.message;
    return res.status(500).json({ success: false, error: err });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
