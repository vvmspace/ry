require("dotenv").config();

const dns = require("node:dns");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const DEFAULT_DB_NAME = "remoteyeah";
const DEFAULT_CONNECT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeMongoUri(uri) {
  if (!uri) return "";
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}

function isSrvDnsError(err) {
  if (!err) return false;
  const message = String(err.message || "");
  return (
    err.syscall === "querySrv" ||
    message.includes("querySrv") ||
    err.code === "ENOTFOUND" ||
    err.code === "EAI_AGAIN" ||
    err.code === "ECONNREFUSED"
  );
}

function getConnectOptions(dbName) {
  return {
    dbName,
    serverSelectionTimeoutMS: Number.parseInt(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || String(DEFAULT_SERVER_SELECTION_TIMEOUT_MS),
      10
    ),
    connectTimeoutMS: Number.parseInt(
      process.env.MONGODB_CONNECT_TIMEOUT_MS || String(DEFAULT_CONNECT_TIMEOUT_MS),
      10
    ),
  };
}

function configureDns() {
  const customServersRaw = process.env.MONGODB_DNS_SERVERS;
  if (customServersRaw) {
    const servers = customServersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (servers.length) {
      dns.setServers(servers);
      // console.log(`[mongo] custom DNS servers configured: ${servers.join(", ")}`);
    }
  }

  dns.setDefaultResultOrder("ipv4first");
}

function warnIfShellEnvOverridesDotenv(primaryUri) {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;

    const raw = fs.readFileSync(envPath, "utf8");
    const parsed = dotenv.parse(raw);
    const dotenvUri = parsed.MONGODB_CONNECTION_STRING;
    if (!dotenvUri) return;

    if (primaryUri && primaryUri !== dotenvUri) {
      console.warn(
        "[mongo] MONGODB_CONNECTION_STRING from shell overrides .env value. " +
        `shell=${sanitizeMongoUri(primaryUri)} .env=${sanitizeMongoUri(dotenvUri)}`
      );
    }
  } catch (_) {
    // no-op; diagnostics helper only
  }
}

function getDotenvValue(key) {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return undefined;
    const raw = fs.readFileSync(envPath, "utf8");
    const parsed = dotenv.parse(raw);
    const value = parsed[key];
    return typeof value === "string" && value.length ? value : undefined;
  } catch (_) {
    return undefined;
  }
}

async function connectWithRetries(uri, options, retries, retryDelayMs, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      // console.log(`[mongo] ${label}: connect attempt ${attempt}/${retries} ${sanitizeMongoUri(uri)}`);
      await mongoose.connect(uri, options);
      // console.log(`[mongo] ${label}: connected`);
      return mongoose;
    } catch (err) {
      lastError = err;
      console.error(`[mongo] ${label}: connect failed on attempt ${attempt}/${retries}: ${err.message}`);
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError;
}

async function connectMongo() {
  const primaryUri =
    getDotenvValue("MONGODB_CONNECTION_STRING") || process.env.MONGODB_CONNECTION_STRING;
  const fallbackDirectUri =
    getDotenvValue("MONGODB_CONNECTION_STRING_DIRECT") || process.env.MONGODB_CONNECTION_STRING_DIRECT;
  const dbName = getDotenvValue("MONGODB_DATABASE") || process.env.MONGODB_DATABASE || DEFAULT_DB_NAME;
  const retries = Number.parseInt(
    process.env.MONGODB_CONNECT_RETRIES || String(DEFAULT_CONNECT_RETRIES),
    10
  );
  const retryDelayMs = Number.parseInt(
    process.env.MONGODB_CONNECT_RETRY_DELAY_MS || String(DEFAULT_RETRY_DELAY_MS),
    10
  );
  const options = getConnectOptions(dbName);
  configureDns();
  warnIfShellEnvOverridesDotenv(primaryUri);

  if (!primaryUri) {
    throw new Error("MONGODB_CONNECTION_STRING is not set");
  }

  try {
    return await connectWithRetries(primaryUri, options, retries, retryDelayMs, "primary");
  } catch (err) {
    const canFallbackToDirect =
      Boolean(fallbackDirectUri) && primaryUri.startsWith("mongodb+srv://") && isSrvDnsError(err);

    if (!canFallbackToDirect) {
      if (primaryUri.startsWith("mongodb+srv://") && isSrvDnsError(err) && !fallbackDirectUri) {
        console.error(
          "[mongo] SRV DNS lookup failed and MONGODB_CONNECTION_STRING_DIRECT is not set. " +
          "Set direct URI from Atlas (without +srv), or set MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1."
        );
      }
      throw err;
    }

    console.warn(
      "[mongo] primary SRV URI failed due DNS/SRV resolution. Trying MONGODB_CONNECTION_STRING_DIRECT..."
    );
    return connectWithRetries(fallbackDirectUri, options, retries, retryDelayMs, "direct");
  }
}

module.exports = {
  connectMongo,
  isSrvDnsError,
  sanitizeMongoUri,
};
