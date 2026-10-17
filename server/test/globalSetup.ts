import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

let mongod: MongoMemoryServer | undefined;

// Uses MONGOMS_SYSTEM_BINARY if set (a local mongod), otherwise mongodb-memory-server downloads one.
export async function setup(project: TestProject) {
  mongod = await MongoMemoryServer.create();
  project.provide("mongoUri", mongod.getUri());
}

export async function teardown() {
  await mongod?.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
