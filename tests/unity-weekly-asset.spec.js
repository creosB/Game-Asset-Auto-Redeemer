const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function loadModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'unity-weekly-asset.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

function nextFlightHtml(data) {
  const chunk = '7:' + JSON.stringify(['$', 'section', 'CalloutSlim-8', {
    'data-type': 'CalloutSlim',
    children: ['$', '$L1a', null, { data, position: 9 }]
  }]);
  return '<section data-type="CalloutSlim" class="mb-8"></section>' +
    '<script>self.__next_f.push(' + JSON.stringify([1, chunk]) + ')</script>';
}

test.describe('Unity weekly free asset parser', () => {
  test('reads CalloutSlim data from the current Next.js flight payload', async () => {
    const { parseHtml } = await loadModule();
    const result = parseHtml(nextFlightHtml({
      __typename: 'CalloutSlim',
      subheading: 'Publisher asset giveaway',
      heading: 'MK Puzzle Level Map Pack • 4 Themes Bundle',
      description: "Add this week's featured asset to your cart, then enter the coupon code MASTERKEY2026 at checkout to get it for free.",
      cta: { url: '/packages/templates/systems/mk-puzzle-level-map-pack-4-themes-bundle-93445' },
      legalDisclaimer: '* Promotion ends September 3.'
    }));

    expect(result.name).toBe('MK Puzzle Level Map Pack • 4 Themes Bundle');
    expect(result.couponCode).toBe('MASTERKEY2026');
    expect(result.url).toBe('https://assetstore.unity.com/packages/templates/systems/mk-puzzle-level-map-pack-4-themes-bundle-93445');
    expect(result.subheading).toBe('Publisher asset giveaway');
    expect(result.disclaimer).toBe('* Promotion ends September 3.');
  });

  test('keeps the rendered legacy callout fallback', async () => {
    const { parseHtml } = await loadModule();
    const result = parseHtml('<section data-type="CalloutSlim"><span class="caption">Giveaway</span><h2>Legacy Asset</h2><span class="body">Use code LEGACY1 at checkout</span><a href="/packages/tools/legacy-123">Get it</a><p>Terms apply</p></section>');
    expect(result.name).toBe('Legacy Asset');
    expect(result.couponCode).toBe('LEGACY1');
    expect(result.url).toBe('https://assetstore.unity.com/packages/tools/legacy-123');
  });

  test('returns null instead of manufacturing Unknown Asset', async () => {
    const { parseHtml } = await loadModule();
    expect(parseHtml('<section data-type="CalloutSlim"></section>')).toBeNull();
  });
});
