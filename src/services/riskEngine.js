import config from "../data/riskConfig.json" with { type: "json" };

const CUSTOMER_NAMES = [
  "Olivia Rhye", "Phoenix Baker", "Lana Steiner", "Demi Wilkinson",
  "Candice Wu", "Natali Craig", "Drew Cano", "Orlando Diggs",
  "Andi Lane", "Kate Morrison", "Riley Cooper", "Alex Morgan",
  "Jordan Lee", "Morgan Chen", "Sam Patel", "Taylor Brooks",
  "Jamie Rivera", "Avery Kim", "Casey Morgan", "Robin Singh",
  "Cameron Diaz", "Quinn Parker", "Reese Bennett", "Skyler James",
];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Germany", "Singapore", "United Arab Emirates"];
const PAYMENT_TYPES = ["Wire transfer", "Card payment", "ACH transfer"];
const POLICY_BY_ID = Object.fromEntries(config.policies.map((policy) => [policy.id, policy]));

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.reportingCurrency,
    maximumFractionDigits: 0,
  }).format(value);
}

function makeAccount(index, random) {
  const number = String(index + 1).padStart(4, "0");
  return {
    id: `ACC-${number}`,
    customerId: `CIF-${String(index + 1).padStart(5, "0")}`,
    customer: CUSTOMER_NAMES[index % CUSTOMER_NAMES.length],
    initials: CUSTOMER_NAMES[index % CUSTOMER_NAMES.length].split(" ").map((part) => part[0]).join(""),
    account: `•••• ${String(1000 + Math.floor(random() * 8999))}`,
    averageTransactionAmount: 1500 + Math.floor(random() * 4000),
    homeCountry: COUNTRIES[index % 4],
    expectedCountries: [COUNTRIES[index % 4], COUNTRIES[(index + 1) % 4]],
    riskRating: index % 7 === 0 ? "High" : index % 3 === 0 ? "Medium" : "Low",
  };
}

function makeTransaction({ id, account, amount, type, country, createdAt, device, random }) {
  return {
    id,
    accountId: account.id,
    customerId: account.customerId,
    customer: account.customer,
    initials: account.initials,
    account: account.account,
    type,
    amount,
    currency: config.reportingCurrency,
    location: country,
    time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(createdAt),
    createdAt: createdAt.toISOString(),
    device,
    reason: "No rule-based risk signal detected.",
    reference: "Synthetic customer baseline · generated account history",
    findings: [],
    score: Math.floor(random() * 21),
    risk: "Low",
    status: "Cleared",
  };
}

function addFinding(transaction, finding) {
  if (!transaction.findings.some((item) => item.code === finding.code)) {
    transaction.findings.push(finding);
  }
}

function analyzeTransactions(accounts, transactions) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const ordered = [...transactions].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  for (const transaction of ordered) {
    const account = accountById.get(transaction.accountId);
    if (!account) throw new Error(`Transaction ${transaction.id} has no matching account.`);
    if (transaction.amount > account.averageTransactionAmount * 3) {
      addFinding(transaction, {
        code: "FRAUD-4.2",
        title: "Amount exceeds customer baseline",
        detail: `${money(transaction.amount)} is more than 3× the account's synthetic average transaction amount of ${money(account.averageTransactionAmount)}.`,
        source: POLICY_BY_ID["FRAUD-4.2"].reference,
        points: 45,
      });
    }
    if (!account.expectedCountries.includes(transaction.location)) {
      addFinding(transaction, {
        code: "FRAUD-2.8",
        title: "Unfamiliar transaction country",
        detail: `${transaction.location} is outside the expected countries for ${account.customer}'s synthetic account profile.`,
        source: POLICY_BY_ID["FRAUD-2.8"].reference,
        points: 24,
      });
    }
  }

  const byAccount = new Map();
  for (const transaction of ordered) {
    if (!byAccount.has(transaction.accountId)) byAccount.set(transaction.accountId, []);
    byAccount.get(transaction.accountId).push(transaction);
  }
  for (const accountTransactions of byAccount.values()) {
    const transfers = accountTransactions.filter((item) => item.type === "Wire transfer");
    for (let index = 0; index < transfers.length; index += 1) {
      const current = transfers[index];
      const currentTime = Date.parse(current.createdAt);
      const group = transfers.filter((item) => {
        const delta = Date.parse(item.createdAt) - currentTime;
        return delta >= 0 && delta <= 24 * 60 * 60 * 1000 &&
          item.amount >= config.amlReportingThreshold * 0.8 &&
          item.amount < config.amlReportingThreshold;
      });
      const groupTotal = group.reduce((sum, item) => sum + item.amount, 0);
      if (group.length >= 2 && groupTotal >= config.amlReportingThreshold) {
        for (const transaction of group) {
          addFinding(transaction, {
            code: "AML-STR-01",
            title: "Repeated transfers below reporting threshold",
            detail: `${group.length} transfers total ${money(groupTotal)} in a 24-hour window; each is below the configured ${money(config.amlReportingThreshold)} demo threshold.`,
            source: POLICY_BY_ID["AML-STR-01"].reference,
            points: 55,
          });
        }
      }
    }
  }

  const recentByAccount = new Map();
  for (const transaction of ordered) {
    const timestamp = Date.parse(transaction.createdAt);
    const previous = recentByAccount.get(transaction.accountId) || [];
    const recent = previous.filter((item) => timestamp - Date.parse(item.createdAt) <= 15 * 60 * 1000);
    recent.push(transaction);
    recentByAccount.set(transaction.accountId, recent);
    if (recent.length >= 5) {
      for (const item of recent) {
        addFinding(item, {
          code: "FRAUD-3.1",
          title: "High transaction velocity",
          detail: `${recent.length} transactions occurred within a rolling 15-minute window for this account.`,
          source: "Fraud policy §3.1 · transaction velocity",
          points: 35,
        });
      }
    }
  }

  for (const transaction of ordered) {
    transaction.findings.sort((left, right) => right.points - left.points);
    transaction.score = Math.min(99, transaction.findings.reduce((sum, item) => sum + item.points, 0));
    transaction.risk = transaction.score >= 70 ? "High" : transaction.score >= 35 ? "Medium" : "Low";
    transaction.reason = transaction.findings.length
      ? transaction.findings.map((item) => item.title).join("; ")
      : "No rule-based risk signal detected; activity is within generated customer-profile bounds.";
    transaction.reference = transaction.findings.length
      ? transaction.findings.map((item) => item.source).join(" · ")
      : "Synthetic customer baseline · generated account history";
    transaction.status = transaction.score >= 80 ? "Escalated" : transaction.score >= 35 ? "Under review" : "Cleared";
  }
  return ordered;
}

function buildAlerts(transactions) {
  return transactions.flatMap((transaction) => transaction.findings.map((finding, index) => ({
    id: `ALT-${transaction.id.slice(-6)}-${index + 1}`,
    title: finding.title,
    detail: finding.detail,
    transactionId: transaction.id,
    accountId: transaction.accountId,
    category: finding.code.startsWith("AML") ? "AML" : "Fraud",
    severity: transaction.risk,
    time: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(transaction.createdAt)),
    source: finding.source,
    evidence: finding,
  })));
}

function buildCapitalMetrics() {
  const capital = config.capital;
  const cet1Ratio = capital.cet1Capital / capital.riskWeightedAssets * 100;
  const tier1Capital = capital.cet1Capital + capital.additionalTier1Capital;
  const totalCapital = tier1Capital + capital.tier2Capital;
  return {
    cet1Capital: capital.cet1Capital,
    tier1Capital,
    totalCapital,
    riskWeightedAssets: capital.riskWeightedAssets,
    cet1Ratio,
    tier1Ratio: tier1Capital / capital.riskWeightedAssets * 100,
    totalCapitalRatio: totalCapital / capital.riskWeightedAssets * 100,
    cet1Minimum: 4.5,
    tier1Minimum: 6,
    totalCapitalMinimum: 8,
    source: "Synthetic capital and risk-weighted asset inputs; Basel III minimum ratios exclude institution-specific buffers.",
  };
}

function buildMetrics(transactions, alerts, capitalMetrics) {
  const fraudAlerts = alerts.filter((alert) => alert.category === "Fraud");
  const amlAlerts = alerts.filter((alert) => alert.category === "AML");
  const exposure = transactions.filter((transaction) => transaction.risk === "High")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const highCount = transactions.filter((transaction) => transaction.risk === "High").length;
  const metrics = [
    { id: "fraud-exposure", label: "Fraud exposure", value: money(exposure), change: "Rule-derived", direction: "down", caption: "high-risk synthetic transaction value", icon: "shield", tone: "blue" },
    { id: "flagged-transactions", label: "Flagged transactions", value: String(new Set(alerts.map((alert) => alert.transactionId)).size), change: `${transactions.length} generated`, direction: "up", caption: "unique transactions with a rule match", icon: "activity", tone: "amber" },
    { id: "aml-alerts", label: "Open AML alerts", value: String(amlAlerts.length), change: `${fraudAlerts.length} fraud signals`, direction: "down", caption: "rule-based signals · synthetic data", icon: "flag", tone: "violet" },
    { id: "compliance-score", label: "CET1 capital ratio", value: `${capitalMetrics.cet1Ratio.toFixed(1)}%`, change: `min. ${capitalMetrics.cet1Minimum}%`, direction: "up", caption: "computed from synthetic capital / RWA", icon: "check", tone: "green" },
  ];
  if (highCount === 0) metrics[0].value = money(0);
  return metrics;
}

function buildRegulations(capitalMetrics, alerts, transactionCount) {
  const amlAlertCount = alerts.filter((alert) => alert.category === "AML").length;
  const baselMinimumsMet =
    capitalMetrics.cet1Ratio >= capitalMetrics.cet1Minimum &&
    capitalMetrics.tier1Ratio >= capitalMetrics.tier1Minimum &&
    capitalMetrics.totalCapitalRatio >= capitalMetrics.totalCapitalMinimum;
  return [
    { id: "basel-iii", name: "Basel III", subtitle: "Capital adequacy framework", status: baselMinimumsMet ? "Minimums met" : "Review required", coverage: baselMinimumsMet ? 100 : Math.min(100, Math.round(Math.min(capitalMetrics.cet1Ratio / capitalMetrics.cet1Minimum, capitalMetrics.tier1Ratio / capitalMetrics.tier1Minimum, capitalMetrics.totalCapitalRatio / capitalMetrics.totalCapitalMinimum) * 100)), coverageLabel: "Minimum ratio checks", updated: "Calculated from demo inputs", icon: "B" },
    { id: "aml-kyc", name: "AML / KYC", subtitle: "Anti-money laundering controls", status: amlAlertCount ? "Signals to review" : "Evaluated", coverage: 100, coverageLabel: "Records evaluated", updated: `${amlAlertCount} generated alerts · ${transactionCount} records evaluated`, icon: "A" },
    { id: "fatf", name: "FATF Recommendations", subtitle: "International AML standards", status: amlAlertCount ? "Signals to review" : "Evaluated", coverage: 100, coverageLabel: "Records evaluated", updated: "AML rules executed on synthetic records", icon: "F" },
  ];
}

function buildTrend(transactions, alerts) {
  const days = [];
  const now = Date.now();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const start = new Date(now);
    start.setDate(start.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dayTransactions = transactions.filter((item) => {
      const time = Date.parse(item.createdAt);
      return time >= start.getTime() && time < end.getTime();
    });
    const dayAlerts = alerts.filter((alert) => {
      const time = Date.parse(alert.time);
      return time >= start.getTime() && time < end.getTime();
    });
    days.push({
      day: start.toLocaleDateString("en-US", { weekday: "short" }),
      fraud: Math.min(100, dayTransactions.filter((item) => item.findings.length).length * 12),
      aml: Math.min(100, dayAlerts.filter((item) => item.category === "AML").length * 18),
    });
  }
  return days;
}

export function createDemoDataset({ seed = 20261004, transactionCount = config.syntheticTransactionCount, now = new Date() } = {}) {
  if (!Number.isInteger(transactionCount) || transactionCount < 12) {
    throw new RangeError("transactionCount must be an integer of at least 12.");
  }
  const random = createRandom(seed);
  const accounts = Array.from({ length: config.syntheticAccountCount }, (_, index) => makeAccount(index, random));
  const transactions = [];
  const generatedCount = Math.max(0, transactionCount - 9);
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (let index = 0; index < generatedCount; index += 1) {
    const account = accounts[Math.floor(random() * accounts.length)];
    const createdAt = new Date(start.getTime() + random() * 30 * 24 * 60 * 60 * 1000);
    const type = PAYMENT_TYPES[Math.floor(random() * PAYMENT_TYPES.length)];
    const amount = type === "Wire transfer" ? 300 + Math.floor(random() * 7300) : 20 + Math.floor(random() * 4800);
    const country = random() < 0.12 ? COUNTRIES[Math.floor(random() * COUNTRIES.length)] : account.homeCountry;
    transactions.push(makeTransaction({
      id: `TXN-${String(900000 + index).padStart(6, "0")}`,
      account, amount, type, country, createdAt,
      device: `DEV-${Math.floor(random() * 8) + 1}`,
      random,
    }));
  }

  const scenarioTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const crossBorderAccount = accounts[0];
  transactions.push(makeTransaction({
    id: "TXN-847291", account: crossBorderAccount, amount: 12850,
    type: "Wire transfer", country: "Singapore", createdAt: scenarioTime,
    device: "DEV-NEW-91", random,
  }));
  const structuringAccount = accounts[1];
  for (let index = 0; index < 3; index += 1) {
    transactions.push(makeTransaction({
      id: `TXN-84726${index}`, account: structuringAccount,
      amount: [9500, 9700, 9800][index], type: "Wire transfer",
      country: structuringAccount.homeCountry,
      createdAt: new Date(scenarioTime.getTime() + index * 4 * 60 * 60 * 1000),
      device: `DEV-${index + 2}`, random,
    }));
  }
  const velocityAccount = accounts[2];
  for (let index = 0; index < 5; index += 1) {
    transactions.push(makeTransaction({
      id: `TXN-84725${index}`,
      account: velocityAccount,
      amount: 75 + index * 15,
      type: "Card payment",
      country: velocityAccount.homeCountry,
      createdAt: new Date(scenarioTime.getTime() + index * 2 * 60 * 1000),
      device: "DEV-VELOCITY-1",
      random,
    }));
  }
  const analyzedTransactions = analyzeTransactions(accounts, transactions);
  const alerts = buildAlerts(analyzedTransactions);
  const capitalMetrics = buildCapitalMetrics();
  return {
    organization: config.organization,
    generatedAt: now.toISOString(),
    dataset: { seed, accountCount: accounts.length, transactionCount: analyzedTransactions.length, synthetic: true },
    config,
    accounts,
    transactions: analyzedTransactions,
    alerts,
    metrics: buildMetrics(analyzedTransactions, alerts, capitalMetrics),
    trend: buildTrend(analyzedTransactions, alerts),
    regulations: buildRegulations(capitalMetrics, alerts, analyzedTransactions.length),
    capitalMetrics,
    quickPrompts: config.quickPrompts,
  };
}

export function getPolicyReferences() {
  return config.policies;
}

export function answerRiskQuestion(question, dataset) {
  const query = question.trim();
  if (!query) throw new Error("Enter a question to analyze.");
  const normalized = query.toLowerCase();
  const transactionMatch = query.match(/TXN-\d{6}/i);
  let evidence = [];
  let answer = "";

  if (transactionMatch) {
    const transaction = dataset.transactions.find((item) => item.id.toLowerCase() === transactionMatch[0].toLowerCase());
    if (transaction) {
      evidence = [
        { type: "Transaction", id: transaction.id, detail: `${transaction.customer} · ${money(transaction.amount)} · risk ${transaction.score}/100 (${transaction.risk})` },
        ...transaction.findings.map((finding) => ({ type: "Rule finding", id: finding.code, detail: finding.detail })),
      ];
      answer = transaction.findings.length
        ? `${transaction.id} was flagged because ${transaction.findings.map((finding) => finding.detail).join(" ")}`
        : `${transaction.id} has no matching rule-based risk finding in the generated dataset.`;
    }
  } else if (/highest.?risk|highest.?scor|most.?risky/.test(normalized)) {
    const transaction = [...dataset.transactions].sort((left, right) => right.score - left.score)[0];
    evidence = [
      { type: "Transaction", id: transaction.id, detail: `${transaction.customer} · ${money(transaction.amount)} · risk ${transaction.score}/100 (${transaction.risk})` },
      ...transaction.findings.map((finding) => ({ type: "Rule finding", id: finding.code, detail: finding.detail })),
    ];
    answer = transaction.findings.length
      ? `The highest-risk transaction is ${transaction.id} (${transaction.customer}), scored ${transaction.score}/100. It was flagged because ${transaction.findings.map((finding) => finding.detail).join(" ")}`
      : `The highest-risk transaction is ${transaction.id} (${transaction.customer}), scored ${transaction.score}/100. No rule findings are attached.`;
  } else if (/policy|regulation|recommendation|control|section|§/.test(normalized)) {
    const terms = normalized
      .replace(/[^a-z0-9.]+/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !["policy", "regulation", "recommendation", "control", "section", "what", "does", "require", "about", "explain", "show", "tell", "the"].includes(term));
    const matchingPolicies = getPolicyReferences()
      .map((policy) => ({
        policy,
        score: terms.filter((term) => `${policy.id} ${policy.name} ${policy.reference} ${policy.text}`.toLowerCase().includes(term)).length,
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);
    evidence = matchingPolicies.map(({ policy }) => ({
      type: "Policy",
      id: policy.id,
      detail: `${policy.name} · ${policy.reference} · ${policy.text}`,
    }));
    answer = matchingPolicies.length
      ? `According to the configured local policy references: ${matchingPolicies.map(({ policy }) => `${policy.name} (${policy.reference}): ${policy.text}`).join(" ")}`
      : "I could not find a matching policy passage in the local policy set. Configure an MCP regulatory source for external policy lookup.";
  } else if (/basel|capital|cet1|tier.?1|risk.weighted|rwa/.test(normalized)) {
    const capital = dataset.capitalMetrics;
    answer = `From the synthetic inputs, CET1 is ${capital.cet1Ratio.toFixed(2)}% (${money(capital.cet1Capital)} / ${money(capital.riskWeightedAssets)}), Tier 1 is ${capital.tier1Ratio.toFixed(2)}%, and total capital is ${capital.totalCapitalRatio.toFixed(2)}%. The demo compares these with Basel III minima of ${capital.cet1Minimum}%, ${capital.tier1Minimum}%, and ${capital.totalCapitalMinimum}%, respectively; institution-specific buffers are not included.`;
    evidence = [
      { type: "Capital calculation", id: "CET1", detail: `${money(capital.cet1Capital)} ÷ ${money(capital.riskWeightedAssets)} = ${capital.cet1Ratio.toFixed(2)}%` },
      { type: "Policy", id: "BASEL-CET1", detail: POLICY_BY_ID["BASEL-CET1"].reference },
      { type: "Policy", id: "BASEL-TIER1", detail: POLICY_BY_ID["BASEL-TIER1"].reference },
    ];
  } else if (/aml|structur|launder|fatf|money.?launder/.test(normalized)) {
    const alerts = dataset.alerts.filter((item) => item.category === "AML");
    evidence = alerts.slice(0, 6).map((item) => ({ type: "AML alert", id: item.id, detail: `${item.transactionId} · ${item.detail} · ${item.source}` }));
    answer = alerts.length
      ? `The rule engine found ${alerts.length} AML alert(s) on ${new Set(alerts.map((item) => item.transactionId)).size} transaction(s). Repeated sub-threshold transfers are review leads, not a determination of misconduct.`
      : "No AML alerts were generated by the current demo rules.";
  } else if (/fraud|flag|risk|suspicious|signal/.test(normalized)) {
    const alerts = dataset.alerts.filter((item) => item.category === "Fraud");
    evidence = alerts.slice(0, 6).map((item) => ({ type: "Fraud alert", id: item.id, detail: `${item.transactionId} · ${item.detail} · ${item.source}` }));
    answer = `The rule engine found ${alerts.length} fraud signal(s) in the synthetic dataset. These are review candidates, not confirmed fraud.`;
  } else {
    const terms = normalized.split(/[^a-z0-9-]+/).filter((term) => term.length > 2);
    const matchingTransactions = dataset.transactions.filter((transaction) =>
      terms.some((term) => `${transaction.id} ${transaction.customer} ${transaction.type} ${transaction.location} ${transaction.reason}`.toLowerCase().includes(term)),
    ).slice(0, 5);
    evidence = matchingTransactions.map((transaction) => ({
      type: "Transaction",
      id: transaction.id,
      detail: `${transaction.customer} · ${transaction.reason} · ${transaction.reference}`,
    }));
    answer = matchingTransactions.length
      ? `I found ${matchingTransactions.length} matching transaction record(s) in the synthetic dataset. Findings below are linked to their rule and source references.`
      : "I could not find matching evidence in this synthetic dataset. Try a transaction ID, 'fraud', 'AML', or 'Basel capital'.";
  }

  return {
    question: query,
    answer: answer || "That transaction ID is not present in the generated dataset.",
    evidence,
    generatedAt: new Date().toISOString(),
    mode: "local-rule-grounded",
  };
}

export function buildAuditReport(dataset) {
  const steps = [
    { id: "signal", status: "complete", output: `${dataset.alerts.length} rule-based alert(s) from ${dataset.transactions.length} transactions` },
    { id: "evidence", status: "complete", output: `${dataset.alerts.filter((alert) => alert.source).length} alert(s) have policy references` },
    { id: "capital", status: "complete", output: `CET1 ${dataset.capitalMetrics.cet1Ratio.toFixed(2)}%; Tier 1 ${dataset.capitalMetrics.tier1Ratio.toFixed(2)}%; total ${dataset.capitalMetrics.totalCapitalRatio.toFixed(2)}%` },
    { id: "report", status: "complete", output: "JSON audit report generated from synthetic data" },
  ];
  return {
    reportType: "risk-fraud-regulatory-intelligence",
    schemaVersion: "1.0.0",
    organization: dataset.organization,
    generatedAt: new Date().toISOString(),
    dataClassification: "synthetic-demo-data",
    disclaimer: "Illustrative rule-based output only; not a fraud determination, regulatory filing, or compliance advice.",
    workflow: steps,
    dataset: dataset.dataset,
    metrics: dataset.metrics,
    capitalMetrics: dataset.capitalMetrics,
    regulations: dataset.regulations,
    accounts: dataset.accounts,
    transactions: dataset.transactions,
    alerts: dataset.alerts,
    policies: getPolicyReferences(),
  };
}
