/**
 * Node test runner for XJ search logic (run: node js/test-search.js)
 */
const fs = require('fs');
const path = require('path');

const catalogSrc = fs.readFileSync(path.join(__dirname, 'xj-catalog.js'), 'utf8');
const searchSrc = fs.readFileSync(path.join(__dirname, 'xj-search.js'), 'utf8');

eval(catalogSrc);
eval(searchSrc.replace(/document\./g, '({}).'));

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
  const results = xjSearchProducts(test.query);
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
