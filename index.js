const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Ascend Backend attivo!' });
});

// Cerca un'immagine pertinente su Unsplash (gratuito, no API key richiesta per source.unsplash.com)
function getProductImageUrl(productName) {
  const query = encodeURIComponent(productName.split(' ').slice(0, 3).join(' '));
  return `https://source.unsplash.com/800x800/?${query}`;
}

async function attachImageToProduct(cleanUrl, shopifyKey, productId, productName) {
  try {
    const imageUrl = getProductImageUrl(productName);
    const response = await fetch(`https://${cleanUrl}/admin/api/2024-01/products/${productId}/images.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyKey
      },
      body: JSON.stringify({
        image: { src: imageUrl }
      })
    });
    const data = await response.json();
    return !!data.image;
  } catch (err) {
    return false;
  }
}

app.post('/create-store', async (req, res) => {
  const { shopifyKey, storeUrl, niche, products } = req.body;
  if (!shopifyKey || !storeUrl) {
    return res.status(400).json({ error: 'shopifyKey e storeUrl sono obbligatori' });
  }
  const cleanUrl = storeUrl.replace('https://','').replace('http://','').replace(/\/$/,'');
  try {
    const created = [];
    const errors = [];
    for (const product of products) {
      try {
        const response = await fetch(`https://${cleanUrl}/admin/api/2024-01/products.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopifyKey
          },
          body: JSON.stringify({
            product: {
              title: product.name,
              body_html: `<p><strong>${product.name}</strong> — Prodotto selezionato per te, qualità garantita.</p><p>✅ Spedizione rapida<br>✅ Soddisfatti o rimborsati<br>✅ Assistenza dedicata</p>`,
              vendor: 'Ascend Store',
              product_type: product.collection || 'Generale',
              status: 'active',
              variants: [{
                price: product.price.toString(),
                inventory_management: null,
                fulfillment_service: 'manual',
                inventory_policy: 'continue',
                requires_shipping: true,
                taxable: true
              }],
              tags: `dropshipping, ${niche}, ascend`
            }
          })
        });
        const data = await response.json();
        if (data.product) {
          // Aggiungi immagine in background (non blocca la risposta)
          const imageAdded = await attachImageToProduct(cleanUrl, shopifyKey, data.product.id, product.name);
          created.push({
            id: data.product.id,
            name: data.product.title,
            price: product.price,
            collection: product.collection,
            hasImage: imageAdded
          });
        } else {
          errors.push({ product: product.name, error: JSON.stringify(data.errors || data) });
        }
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        errors.push({ product: product.name, error: err.message });
      }
    }
    res.json({ success: true, created, errors, message: `${created.length} prodotti creati su ${cleanUrl}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Elimina prodotti demo/test (per pulizia store)
app.post('/cleanup-products', async (req, res) => {
  const { shopifyKey, storeUrl, keepTags } = req.body;
  const cleanUrl = storeUrl.replace('https://','').replace('http://','').replace(/\/$/,'');
  try {
    const listRes = await fetch(`https://${cleanUrl}/admin/api/2024-01/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': shopifyKey }
    });
    const listData = await listRes.json();
    const products = listData.products || [];
    const deleted = [];
    for (const p of products) {
      const isAscend = (p.tags || '').includes('ascend');
      if (!isAscend) {
        await fetch(`https://${cleanUrl}/admin/api/2024-01/products/${p.id}.json`, {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': shopifyKey }
        });
        deleted.push(p.title);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    res.json({ success: true, deleted, count: deleted.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/test-connection', async (req, res) => {
  const { shopifyKey, storeUrl } = req.body;
  const cleanUrl = storeUrl.replace('https://','').replace('http://','').replace(/\/$/,'');
  try {
    const response = await fetch(`https://${cleanUrl}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': shopifyKey }
    });
    const data = await response.json();
    if (data.shop) {
      res.json({ success: true, shop: { name: data.shop.name, email: data.shop.email, domain: data.shop.domain } });
    } else {
      res.status(401).json({ error: 'Token non valido', details: data });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/trends/:niche', (req, res) => {
  res.json({ niche: req.params.niche, trending: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ascend Backend attivo su porta ${PORT}`));
