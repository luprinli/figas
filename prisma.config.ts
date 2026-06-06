import { defineConfig, env } from "@prisma/config";
import { config } from "dotenv";

// Load .env file so Prisma can resolve DATABASE_URL
config();

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
