require("dotenv").config();

const mongoose = require("mongoose");

async function connectMongo() {
  const uri = process.env.MONGODB_CONNECTION_STRING;
  const dbName = process.env.MONGODB_DATABASE;

  if (!uri) {
    throw new Error("MONGODB_CONNECTION_STRING is not set");
  }

  if (!dbName) {
    throw new Error("MONGODB_DATABASE is not set");
  }

  await mongoose.connect(uri, { dbName });
  return mongoose;
}

module.exports = {
  connectMongo,
};

