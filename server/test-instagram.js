require('dotenv').config({ path: '../.env' });
const axios = require('axios');

async function run(actorId, input, limit) {
  console.log(`\nActor: ${actorId}`);
  console.log('Input:', JSON.stringify(input));
  const res = await axios.post(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${process.env.APIFY_API_KEY}`,
    input, { headers: { 'Content-Type': 'application/json' } }
  );
  const runId = res.data.data.id;
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 3000));
    const s = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${process.env.APIFY_API_KEY}`).catch(() => null);
    if (s) status = s.data.data.status;
    process.stdout.write('.');
  }
  console.log('\nStatus:', status);
  const items = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${process.env.APIFY_API_KEY}&limit=${limit}`
  );
  return items.data;
}

(async () => {
  const base = 'https://www.instagram.com/soulfulsouthvlogss';

  // Try actor 1
  let items = await run('apify~instagram-scraper',
    { directUrls: [base + '/reels/'], resultsType: 'posts', resultsLimit: 3 }, 3);
  console.log('Items:', items.length);
  console.log('First item:', JSON.stringify(items[0], null, 2).slice(0, 500));

  // Try actor 2
  items = await run('apify~instagram-scraper',
    { directUrls: [base], resultsType: 'posts', resultsLimit: 3 }, 3);
  console.log('Items:', items.length);
  console.log('First item:', JSON.stringify(items[0], null, 2).slice(0, 500));
})();
