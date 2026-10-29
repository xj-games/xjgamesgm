/**
 * Node test runner for XJ search logic (run: node js/test-search.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const catalogSrc = fs.readFileSync(path.join(__dirname, 'xj-catalog.js'), 'utf8');
const searchSrc = fs.readFileSync(path.join(__dirname, 'xj-search.js'), 'utf8');

const searchContext = vm.createContext({
  console: console,
  document: {},
  window: {},
  location: { hash: '' },
  history: {}
});
vm.runInContext(
  catalogSrc + '\n' + searchSrc + '\nglobalThis.XJ_PRODUCT_CATALOG_FOR_TEST = XJ_PRODUCT_CATALOG;',
  searchContext
);

const TESTS = [
  { query: 'PS4', expect: ['ps4-slim', 'ps4-fat'] },
  { query: 'PS 4', expect: ['ps4-slim', 'ps4-fat'] },
  { query: 'PlayStation 4', expect: ['ps4-slim', 'ps4-fat'] },
  { query: 'PS', expect: ['ps4-slim', 'ps4-fat'] },
  { query: 'controller', expect: ['ps4-controller', 'ps5-controller'] },
  { query: 'controllers', expect: ['ps4-controller', 'ps5-controller'] },
  { query: 'PS4 controller', expect: ['ps4-controller'] },
  { query: 'PS5 controller', expect: ['ps5-controller'] },
  { query: 'Nintendo Switch', expect: ['nintendo-switch'] },
  { query: 'Switch', expect: ['nintendo-switch'] },
  { query: 'PS5', expect: ['ps5'] },
  { query: 'PS3', expect: ['ps3'] },
  { query: 'PS2', expect: ['ps2'] },
  { query: 'Nintendo Switch Lite', expect: ['nintendo-switch-lite'] },
  { query: 'Switch Lite', expect: ['nintendo-switch-lite'] }
];

let passed = 0;
let failed = 0;

TESTS.forEach(function(test) {
  const results = searchContext.xjSearchProducts(test.query);
  const topResults = test.expect.filter(function(id) {
    return results.indexOf(id) !== -1;
  });

  const ok = test.expect.every(function(id) {
    return results.indexOf(id) !== -1;
  }) && (test.query === 'PS' ? results.indexOf('ps5-controller') === -1 || results.indexOf('ps4-slim') < results.indexOf('ps5-controller') : true);

  if (ok) {
    passed++;
    console.log('PASS:', test.query, '->', results.slice(0, 4).join(', '));
  } else {
    failed++;
    console.log('FAIL:', test.query);
    console.log('  Expected includes:', test.expect.join(', '));
    console.log('  Got:', results.join(', '));
  }
});

const catalog = searchContext.XJ_PRODUCT_CATALOG_FOR_TEST;
const requiredHomepageIds = [
  'ps4-slim',
  'ps4-fat',
  'ps4-pro',
  'ps2',
  'ps3',
  'nintendo-switch',
  'nintendo-switch-lite',
  'nintendo-switch-oled',
  'ps4-controller',
  'ps5-controller'
];
const defaultHomepageIds = Object.keys(catalog).filter(function(id) {
  return searchContext.xjIsHomepageProduct(catalog[id]);
});
const remotePs4Pro = {
  id: 'ps4-pro',
  name: 'PlayStation 4 Pro',
  displayCategory: 'playstation-consoles',
  categories: ['ps4', 'consoles', 'playstation']
};
if (!requiredHomepageIds.every(function(id) { return defaultHomepageIds.indexOf(id) !== -1; }) ||
    !searchContext.xjIsHomepageProduct(remotePs4Pro) ||
    searchContext.xjIsHomepageProduct({
      id: 'custom-racing-ps2-cd',
      name: 'Racing Game (PS2 CD)',
      category: 'accessories',
      displayCategory: 'playstation-consoles',
      categories: ['accessories'],
      type: 'standalone'
    }) ||
    defaultHomepageIds.indexOf('ps5') !== -1 ||
    defaultHomepageIds.some(function(id) {
      return searchContext.xjGetProductDisplayCategory(catalog[id]) === 'games';
    })) {
  console.error('FAIL: homepage product eligibility does not match the curated catalog');
  failed++;
} else {
  console.log('PASS: curated homepage products exclude non-featured consoles and games');
}

if (!searchContext.xjIsHomepageProduct(catalog['nintendo-switch-lite']) ||
    !searchContext.xjIsHomepageProduct(catalog['nintendo-switch-oled']) ||
    searchContext.xjIsHomepageProduct(catalog['ps5'])) {
  console.error('FAIL: homepage should show Switch family and hide PS5');
  failed++;
} else {
  console.log('PASS: homepage shows curated consoles/controllers and hides PS5');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
