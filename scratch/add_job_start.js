const fs = require('fs');
const path = require('path');
const workersDir = path.resolve(__dirname, '../src/workers');

const files = fs.readdirSync(workersDir).filter(f => f.endsWith('Worker.js'));

for (const file of files) {
  const filePath = path.join(workersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Match the require.main === module block that calls run...Worker
  const mainBlockRegex = /(if\s*\(\s*require\.main\s*===\s*module\s*\)\s*\{\n)(\s*run[A-Za-z]+Worker\(\))/;
  if (mainBlockRegex.test(content) && !content.includes('Job started at:')) {
    content = content.replace(mainBlockRegex, `$1  const t0 = require('perf_hooks').performance.now();\n  console.log(\`Job started at: \${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}\`);\n$2`);
  }

  // Update completion log to include duration
  const logRegex = /console\.log\(`Job completed at: \$\{time\}`\);/;
  if (logRegex.test(content)) {
    content = content.replace(
      logRegex,
      'console.log(`Job completed at: ${time} (Duration: ${((require(\'perf_hooks\').performance.now() - t0) / 1000).toFixed(2)}s)`);'
    );
  }

  fs.writeFileSync(filePath, content);
  console.log('Processed', file);
}
