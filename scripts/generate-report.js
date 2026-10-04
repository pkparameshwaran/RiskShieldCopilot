import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuditReport, createDemoDataset } from "../src/services/riskEngine.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.resolve(process.argv[2] || path.join(projectRoot, "riskshield-audit-report.json"));

async function main() {
  const dataset = createDemoDataset();
  const report = buildAuditReport(dataset);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Generated ${outputPath}\n`);
  process.stdout.write(`Signals: ${dataset.alerts.length} | Transactions: ${dataset.transactions.length} | Accounts: ${dataset.accounts.length}\n`);
}

main().catch((error) => {
  process.stderr.write(`Report generation failed: ${error.message}\n`);
  process.exitCode = 1;
});

