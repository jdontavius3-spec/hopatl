const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  throw new Error('Set STRIPE_SECRET_KEY in your environment before running setup-hopatl-stripe.mjs');
}

const PRODUCTS = [
  {
    sku: 'hopatl-hop-15',
    tier: '15',
    name: 'TRICKHOPPER · 15-Min Curbside Wait Lock (TH-15 Passkey)',
    description:
      'Upfront 15-Minute Curbside Wait Lock & TH-15 Rider Passkey on hopatl.com. Pilot route & driving fare is paid directly to your pilot at the curb.',
    amountCents: 599,
  },
  {
    sku: 'hopatl-hop-30',
    tier: '30',
    name: 'TRICKHOPPER · 30-Min Nightlife Bunny Lock (TH-30 Passkey)',
    description:
      'Upfront 30-Minute Curbside Wait Lock & TH-30 Rider Passkey on hopatl.com. Pilot route & driving fare is paid directly to your pilot at the curb.',
    amountCents: 999,
  },
  {
    sku: 'hopatl-hop-60',
    tier: '60',
    name: 'TRICKHOPPER · 60-Min VIP Wait-and-Return Lock (TH-60 Passkey)',
    description:
      'Upfront 60-Minute VIP Curbside Wait Lock & TH-60 Passkey on hopatl.com. Pilot route & driving fare is paid directly to your pilot at the curb.',
    amountCents: 1499,
  },
  {
    sku: 'hopatl-allnight',
    tier: 'AN',
    name: 'TRICKHOPPER · All-Night Dedicated Bunny Reserve (Atlanta VIP)',
    description:
      'All-In Dedicated All-Night Atlanta Chauffeur & Wait-and-Return Reserve (up to 3 stops, priority pilot pairing, Klarna/Affirm eligible) + TH-AN Passkey.',
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
