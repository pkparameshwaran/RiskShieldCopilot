# RiskShield Copilot

RiskShield is a React dashboard and Node.js service for a synthetic financial-risk demo. It generates linked account and transaction records, runs explainable fraud/AML rules and Basel capital calculations, grounds copilot answers in those records, and generates an evidence-linked JSON audit report.

All included records and capital inputs are synthetic. Rule alerts are investigation leads—not determinations of fraud, legal advice, or regulatory filings.

## Requirements and startup

Use Node.js 20 or later and npm.

```sh
npm install
npm run dev
```

The development server serves the React app and its API at `http://localhost:5173`. For a production build and run:

```sh
npm run build
npm start
```

## Implemented capabilities

- Reproducible synthetic accounts and transaction generation with referentially consistent customer/account IDs and seeded review scenarios.
- Explainable transaction rules for unusual amounts, unfamiliar countries, transaction velocity, and potential below-threshold transfer structuring.
- Basel III CET1, Tier 1, and total capital ratios computed from disclosed synthetic capital and risk-weighted-asset inputs.
- Local rule-grounded copilot questions for transaction IDs, fraud, AML, and Basel topics. Answers include supporting records and policy citations; this is not a generative AI model.
- Audit workflow output covering signal detection, cited evidence, capital calculations, and a JSON report.
- Interactive dashboard, customer and transaction views, risk alerts, regulatory controls, and report download.

The demo's deterministic local skills are not a deployed Snowflake Cortex Agent. Live Cortex execution requires a Snowflake account and service credentials, which are not included. The app labels all generated data and calculations as synthetic and does not claim regulatory compliance.

## Local policy search

The Regulatory page searches bundled synthetic policy references locally. No MCP server, credentials, external service, or extra setup is required. The optional MCP API can be enabled later by configuring an administrator-managed remote server; it is not used by the current UI or needed to run the project.

## Command-line audit report

Generate a report from freshly generated synthetic data:

```sh
npm run report
```

Choose an output path if desired:

```sh
npm run report -- .\reports\sample-audit.json
```

## Tests

```sh
npm test
npm run build
```
