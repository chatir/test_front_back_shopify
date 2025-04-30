// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();

// Allow only your front-store domain
app.use(cors({
  origin: 'https://sxnav0-cj.myshopify.com',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;      // back-store domain
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;  // back-store Admin token

app.post('/create-draft-order', async (req, res) => {
  const { product_handle, quantity, price } = req.body;
  if (!product_handle || !quantity || !price) {
    return res.status(400).json({
      success: false,
      error: 'product_handle, quantity & price required'
    });
  }

  // 1) Lookup the product by handle on your back-store
  let variantId;
  try {
    const prodRes = await axios.get(
      `https://${SHOP_DOMAIN}/admin/api/2025-04/products.json?handle=${product_handle}`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }}
    );
    const products = prodRes.data.products;
    if (!products.length) {
      return res.status(404).json({ success:false, error:'Product not found in back-store' });
    }
    variantId = products[0].variants[0].id;
  } catch (e) {
    console.error('Product lookup error:', e.response?.data || e.message);
    return res.status(500).json({ success:false, error:'Failed to lookup product' });
  }

  // 2) Generate a random ORDER number
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const name     = `ORDER N#${orderNum}`;

  // 3) Build draft_order payload
  const payload = {
    draft_order: {
      line_items: [{
        variant_id: variantId,
        quantity:  parseInt(quantity, 10),
        price:     price
      }],
      name: name,
      use_customer_default_address: true
    }
  };

  // 4) Create the draft order
  try {
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
    console.error('Draft order error:', err.response?.data || err.message);
    const e = err.response?.data?.errors || err.message;
    return res.status(500).json({ success:false, error: e });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
