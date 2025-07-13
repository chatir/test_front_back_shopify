// index.js
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();

const allowedOrigins = [
  'https://zjnquw-ik.myshopify.com',
  'https://camyx.shop',
  'https://www.camyx.shop'
];

app.use(cors({
  origin: (origin, callback) => {
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
const SHOP_DOMAIN  = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.SHOPIFY_API_TOKEN;

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

  const total    = (unit * qty).toFixed(2);
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const title    = `ORDER N#${orderNum}`;

  try {
    // 🔒 Force currency to USD
    const currencyCode = 'USD';

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
        allowDiscountCodesInCheckout: true,
        lineItems: [{
          title: title,
          quantity: 1,
          originalUnitPriceWithCurrency: {
            amount: parseFloat(total),
            currencyCode
          },
          requiresShipping: false,
          taxable: false
        }]
      }
    };

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

    const top    = data.errors || [];
    const user   = data.data?.draftOrderCreate.userErrors || [];
    const allErr = [...top, ...user];
    if (allErr.length) {
      const msg = allErr.map(e => e.message || e).join('; ');
      return res.status(500).json({ success: false, error: msg });
    }

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
