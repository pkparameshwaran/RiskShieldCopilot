# RiskShield Application Runbook

## 1. Purpose and scope

RiskShield is a React and Node.js prototype for exploring financial risk, fraud, AML, and regulatory-intelligence workflows. It generates synthetic account and transaction data, evaluates explainable local rules, answers supported copilot questions from the generated records and bundled policy references, computes illustrative Basel III capital ratios, and exports a JSON audit report.

This runbook covers local development, production builds, verification, report generation, and basic troubleshooting.

## 2. Important operating limits

- All account, transaction, capital, alert, and policy data included with the application is synthetic.
- Rule matches are investigation leads, not confirmed fraud or money laundering.
- Basel ratios are calculated from synthetic inputs and are not a compliance determination.
- The copilot is a deterministic local rule-and-search helper, not a generative AI model or deployed Snowflake Cortex Agent.
- The Regulatory page searches policy references bundled with the project. **No MCP server, external connection, or credentials are needed to run the application.**
- The prototype is not a production banking system and must not be used to make real customer decisions, file regulatory reports, or represent regulatory compliance.

## 3. Prerequisites

- Windows, macOS, or Linux.
- Node.js 20 or later, with npm available in the terminal.
- Network access for the initial npm dependency installation.

Verify the tools before continuing:

```powershell
node --version
npm.cmd --version
```

In Windows PowerShell, use `npm.cmd` if PowerShell cannot run `npm.ps1` because of its execution policy.

## 4. Start the development application

Open a terminal in the project folder:

```powershell
Set-Location C:\Projects\RiskShieldCopilot
```

Install dependencies once (or after dependency changes), then start the development server:

```powershell
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:5173](http://localhost:5173). Keep the terminal open while using the application. Stop the server with `Ctrl+C`.

If `npm` is not recognized, install Node.js 20 or later, make sure the installer adds Node to `PATH`, then fully close and reopen VS Code. Verify again with `node --version` and `npm.cmd --version`.

## 5. Build and run production mode

From the project folder:

```powershell
npm.cmd run build
npm.cmd start
```

The production server serves the built frontend and its API at `http://localhost:5173` by default. Use `Ctrl+C` in that terminal to stop it. Do not run the development and production servers simultaneously on the same port. Set a different `PORT` in the server environment if another application already uses port 5173.

## 6. Application features

### Overview

- Displays risk metrics, recent synthetic activity, and fraud/AML trend visualization.
- Offers suggested questions and a copilot question field.
- Exports an audit-report JSON snapshot.

### Transactions

- Search generated transactions from the top search field.
- Filter by High, Medium, or Low risk.
- Open a transaction to see its synthetic customer/account context, rule findings, risk score, and source references.

### Risk alerts

- Lists rule-derived alerts and associated evidence.
- Opens the related transaction when one is available.

### Customers

- Lists generated synthetic accounts and their linked transaction and finding counts.

### Regulatory intelligence

- Shows local policy references and rule evaluation summaries.
- Searches the bundled policy text locally. This feature works without an MCP server.
- Displays computed Basel capital ratios using clearly labeled synthetic inputs.

### Agent skills

- Summarizes local deterministic skills for fraud signals, AML structuring, transaction velocity, and Basel calculations.
- Shows generated result counts and calculation inputs/results.

### Reports

- Downloads a JSON report containing synthetic accounts, transactions, alerts, evidence, policy references, capital metrics, and workflow stages.

## 7. Copilot usage

1. Open Overview.
2. Select a suggested prompt or type a supported question and submit it.
3. Review the answer and its evidence/policy references.

Questions can cover a transaction ID (for example `TXN-847291`), the highest-risk transaction, fraud signals, AML/structuring, local policy references, or Basel capital ratios. The result is grounded in the current generated dataset and is not a live external lookup.

The sidebar's **Talk to copilot** action and the top-bar **Ask copilot** shortcut navigate to Overview and focus the question field.

## 8. Generate a command-line audit report

Generate the default report in the project folder:

```powershell
npm.cmd run report
```

Provide an alternate output path:

```powershell
npm.cmd run report -- .\reports\sample-audit.json
```

The report generator creates parent directories as needed and prints the account, transaction, and alert counts.

## 9. Verification commands

Run all automated tests:

```powershell
npm.cmd test
```

Create the production frontend build:

```powershell
npm.cmd run build
```

Review dependency advisories:

```powershell
npm.cmd audit
```

The test suite verifies account/transaction links, explainable fraud and AML/velocity scenarios, Basel calculations, copilot evidence, report workflow content, and optional MCP protocol integration against a local mock server. The MCP test fixture does not mean a real MCP service is installed or required.

## 10. Configuration

The application uses port 5173 by default. To use a different port, set `PORT` in the environment before starting the Node server. No `.env` file is required for local-only use.

`.env.example` describes optional server-side settings for a future MCP Streamable HTTP integration. Do not populate those settings unless an MCP server is available and intentionally being connected. Never expose credentials through `VITE_`-prefixed variables or commit secrets to source control.

## 11. Troubleshooting

### `npm` is not recognized

1. Install Node.js 20 or later from the official Node.js distribution.
2. Confirm the installer adds Node.js to the Windows `PATH`.
3. Close all VS Code windows and start VS Code again so its integrated terminal reloads the environment.
4. In a new PowerShell terminal run:

   ```powershell
   node --version
   npm.cmd --version
   ```

5. If PowerShell script execution blocks `npm`, run `npm.cmd` instead of `npm`.

### Port 5173 is already in use

Stop the other development/production server with `Ctrl+C`, or choose another free port in the server environment before starting RiskShield.

### The page does not load or reflects an older build

Confirm the server terminal reports that it is listening, open the exact local URL shown there, and refresh the browser. For production mode, rebuild with `npm.cmd run build` before `npm.cmd start`.

### A copilot answer has no matching evidence

Try an existing transaction ID or a supported topic such as `fraud`, `AML structuring`, `policy`, or `Basel capital ratios`. Answers only use the currently generated synthetic records and bundled policy references.

### External policy lookup is unavailable

This is expected in local-only operation: no MCP server is configured or required. Use the Regulatory page's local policy search instead.

## 12. Data handling

Do not replace synthetic fixtures with real personal, account, or transaction data without a separate security, privacy, access-control, retention, and regulatory review. Generated JSON reports may contain all synthetic demo records; treat exported files as application artifacts and remove them when no longer needed.
