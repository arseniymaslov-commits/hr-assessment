import { spawnSync } from "node:child_process";

if (process.env.SEED_DATABASE !== "true") {
  console.log("Database seed skipped.");
  process.exit(0);
}

console.log("Database seed enabled. Running prisma seed...");
const result = spawnSync("npm", ["run", "prisma:seed"], {
  shell: true,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
