const fs = require('fs');
const path = require('path');
const workersDir = path.resolve(__dirname, '../src/workers');

const files = fs.readdirSync(workersDir).filter(f => f.endsWith('Worker.js'));
let updatedCount = 0;

for (const file of files) {
  const filePath = path.join(workersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('Job completed at:')) continue;

  const replaceRegex = /(process\.exitCode\s*=\s*1;\s*\})\);/g;
  
  if (replaceRegex.test(content)) {
    content = content.replace(replaceRegex, `$1).finally(() => {\n    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());\n    console.log(\`Job completed at: \${time}\`);\n  });`);
    fs.writeFileSync(filePath, content);
    console.log('Updated', file);
    updatedCount++;
  } else {
    console.log('Skipped or regex not matched:', file);
  }
}

console.log(`Total files updated: ${updatedCount}`);
