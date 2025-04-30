// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();

// Only allow your front-store origin
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // e.g. "3ryvgw-yp.myshopify.com"
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // shpat_… token

app.post('/create-draft-order', async (req, res) => {
  const { title, price, quantity } = req.body;
  if (!title || !price || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'title, price & quantity are required'
    });
  }

  // Generate a random ORDER number
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const name     = `ORDER N#${orderNum}`;

  // Build payload with a custom line item
  const payload = {
    draft_order: {
      custom_line_items: [
        {
          title:    title,
          price:    price,     // exactly what you passed
          quantity: parseInt(quantity, 10)
        }
      ],
      name: name,
      use_customer_default_address: true
    }
  };

  try {
    // Call Shopify's REST Admin API
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

    const invoiceUrl = response.data.draft_order.invoice_url;
    return res.json({ success: true, url: invoiceUrl });

  } catch (err) {
    console.error('DraftOrder error:', err.response?.data || err.message);
    const e = err.response?.data?.errors || err.message;
    return res.status(500).json({ success: false, error: e });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
