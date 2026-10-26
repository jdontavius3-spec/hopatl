const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  throw new Error('Set STRIPE_SECRET_KEY in your environment before running setup-hopatl-stripe.mjs');
}

const PRODUCTS = [
  {
    sku: 'hopatl-hop-15',
    tier: '15',
    name: 'TRICKHOPPER · 15-Min Curbside Hop Pass (Atlanta Round-Trip)',
    description:
      'Reserved Atlanta Wait-and-Return Hop Pass: includes 15-minute curbside pilot wait block + return leg & TH-15 Rider Passkey.',
    amountCents: 1999,
  },
  {
    sku: 'hopatl-hop-30',
    tier: '30',
    name: 'TRICKHOPPER · 30-Min Nightlife Bunny Hop Pass (Atlanta Round-Trip)',
    description:
      'Reserved Atlanta Wait-and-Return Hop Pass: includes 30-minute curbside pilot wait block + return leg & TH-30 Rider Passkey.',
    amountCents: 3499,
  },
  {
    sku: 'hopatl-hop-60',
    tier: '60',
    name: 'TRICKHOPPER · 60-Min VIP Wait-and-Return Block (Multi-Stop)',
    description:
      'VIP Multi-Hop Atlanta Wait-and-Return Block: includes 60-minute reserved curbside pilot wait + return leg & TH-60 VIP Passkey.',
    amountCents: 5999,
  },
  {
    sku: 'hopatl-allnight',
    tier: 'AN',
    name: 'TRICKHOPPER · All-Night Dedicated Bunny Reserve (Atlanta VIP)',
    description:
      'Dedicated All-Night Atlanta Chauffeur & Wait-and-Return Reserve (up to 3 stops, priority pilot pairing, Klarna/Affirm eligible) + TH-AN Passkey.',
    amountCents: 14900,
  },
];

async function stripePost(endpoint, params) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${endpoint} failed: ${JSON.stringify(data)}`);
  return data;
}

async function run() {
  const results = {};
  for (const p of PRODUCTS) {
    const prod = await stripePost('products', {
      name: p.name,
      description: p.description,
      statement_descriptor: 'HOPATL',
      'metadata[entity]': 'TRICKHOPPER_HOPATL',
      'metadata[sku]': p.sku,
      'metadata[tier]': p.tier,
    });

    const price = await stripePost('prices', {
      product: prod.id,
      unit_amount: String(p.amountCents),
      currency: 'usd',
      'metadata[sku]': p.sku,
    });

    const plink = await stripePost('payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'after_completion[type]': 'redirect',
      'after_completion[redirect][url]': `https://hopatl.com/?checkout=success&sku=${p.sku}&session_id={CHECKOUT_SESSION_ID}`,
      'payment_intent_data[statement_descriptor_suffix]': 'HOPATL',
      'metadata[entity]': 'TRICKHOPPER_HOPATL',
      'metadata[sku]': p.sku,
      'metadata[tier]': p.tier,
    });

    results[p.sku] = {
      sku: p.sku,
      tier: p.tier,
      name: p.name,
      amountCents: p.amountCents,
      productId: prod.id,
      priceId: price.id,
      testPaymentLinkId: plink.id,
      testUrl: plink.url,
    };
    console.log(`Created ${p.sku}: ${plink.id} -> ${plink.url}`);
  }
  console.log('\nFULL JSON:\n' + JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
