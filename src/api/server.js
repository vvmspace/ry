require('dotenv').config();
const http = require('http');
const { connectMongo } = require('../db/mongoose');
const { initMetrics } = require('../metrics/jobMetrics');
const { handleRequest } = require('./router');

const PORT = Number(process.env.PORT) || 4040;

async function main() {
  await connectMongo();
  initMetrics();
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
