import { runTestsReporting } from './tests_reporting.js';
const results = runTestsReporting();
const failed = results.filter(r=>!r.passed);
if (failed.length>0) {
  console.log('FAILURES:');
  failed.forEach(f=>console.log(`- ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('ALL REPORTING TESTS PASS');
  process.exit(0);
}
