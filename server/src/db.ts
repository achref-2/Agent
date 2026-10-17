import mongoose from "mongoose";
import { logger } from "./lib/logger.js";

export async function connectDb(uri: string) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info("MongoDB connected", { db: mongoose.connection.name });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
