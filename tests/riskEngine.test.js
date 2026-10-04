import test from "node:test";
import assert from "node:assert/strict";
import {
  answerRiskQuestion,
  buildAuditReport,
  createDemoDataset,
} from "../src/services/riskEngine.js";

test("generated transactions reference valid synthetic accounts", () => {
  const dataset = createDemoDataset();
  const accountIds = new Set(dataset.accounts.map((account) => account.id));
  assert.equal(dataset.transactions.length, 120);
  assert.equal(dataset.accounts.length, 24);
  assert.ok(dataset.transactions.every((transaction) => accountIds.has(transaction.accountId)));
  assert.ok(dataset.transactions.every((transaction) => transaction.customerId.startsWith("CIF-")));
});

test("deterministic scenarios produce explainable fraud and AML findings", () => {
  const dataset = createDemoDataset();
  const crossBorder = dataset.transactions.find((transaction) => transaction.id === "TXN-847291");
  const structuring = dataset.transactions.filter((transaction) => transaction.id.startsWith("TXN-84726"));
  assert.ok(crossBorder.findings.some((finding) => finding.code.startsWith("FRAUD")));
  assert.equal(structuring.length, 3);
  assert.ok(structuring.every((transaction) => transaction.findings.some((finding) => finding.code === "AML-STR-01")));
  const velocityTransactions = dataset.transactions.filter((transaction) => transaction.findings.some((finding) => finding.code === "FRAUD-3.1"));
  assert.equal(velocityTransactions.length, 5);
  assert.ok(dataset.alerts.every((alert) => alert.source && alert.transactionId));
});

test("Basel ratios are calculated from the declared synthetic inputs", () => {
  const { capitalMetrics } = createDemoDataset();
  assert.equal(Number(capitalMetrics.cet1Ratio.toFixed(2)), 12.61);
  assert.equal(Number(capitalMetrics.tier1Ratio.toFixed(2)), 14.57);
  assert.equal(Number(capitalMetrics.totalCapitalRatio.toFixed(2)), 17.28);
});

test("copilot answers use matching dataset evidence and citations", () => {
  const dataset = createDemoDataset();
  const answer = answerRiskQuestion("Why was TXN-847291 flagged?", dataset);
  assert.match(answer.answer, /TXN-847291 was flagged/);
  assert.ok(answer.evidence.some((item) => item.id === "FRAUD-4.2"));
  const highestRiskAnswer = answerRiskQuestion("Why was the highest-risk transaction flagged?", dataset);
  assert.match(highestRiskAnswer.answer, /highest-risk transaction is TXN-/);
  assert.ok(highestRiskAnswer.evidence.some((item) => item.type === "Rule finding"));
  assert.match(answerRiskQuestion("Show Basel III capital ratios", dataset).answer, /CET1 is/);
  const policyAnswer = answerRiskQuestion("What does AML policy say about structuring?", dataset);
  assert.match(policyAnswer.answer, /Potential transaction structuring/);
  assert.ok(policyAnswer.evidence.some((item) => item.id === "AML-STR-01"));
  assert.throws(() => answerRiskQuestion("  ", dataset), /Enter a question/);
});

test("audit report records completed signal-evidence-capital-report workflow", () => {
  const report = buildAuditReport(createDemoDataset());
  assert.equal(report.dataClassification, "synthetic-demo-data");
  assert.deepEqual(report.workflow.map((item) => item.id), ["signal", "evidence", "capital", "report"]);
  assert.ok(report.alerts.length > 0);
  assert.ok(report.policies.length > 0);
});
