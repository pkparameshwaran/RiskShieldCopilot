import React, { useMemo, useRef, useState } from "react";
import { answerRiskQuestion, buildAuditReport, createDemoDataset, getPolicyReferences } from "./services/riskEngine.js";

const riskData = createDemoDataset();

const navGroups = [
  {
    label: "WORKSPACE",
    items: [
      { id: "overview", label: "Overview", icon: "grid" },
      { id: "transactions", label: "Transactions", icon: "arrows" },
      { id: "alerts", label: "Risk alerts", icon: "bell", count: String(riskData.alerts.length) },
      { id: "customers", label: "Customers", icon: "users" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { id: "regulatory", label: "Regulatory", icon: "book" },
      { id: "reports", label: "Reports", icon: "chart" },
      { id: "agents", label: "Agent skills", icon: "sparkle" },
    ],
  },
];

const iconPaths = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  arrows: <><path d="M7 7h13l-3-3" /><path d="m20 7-3 3M17 17H4l3 3" /><path d="m4 17 3-3" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10h7" /></>,
  chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  down: <path d="m7 10 5 5 5-5" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2z" /><path d="m19 14 1.1 2.3L22 17l-1.9.7L19 20l-.9-2.3L16 17l2.1-.7z" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11" /><path d="m9 12 2 2 4-4" /></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  flag: <><path d="M5 21V5" /><path d="M5 5c6-5 9 5 15 0v10c-6 5-9-5-15 0" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  external: <><path d="M14 3h7v7M10 14 21 3" /><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name] || iconPaths.grid}
    </svg>
  );
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function RiskBadge({ risk }) {
  return <span className={`risk-badge risk-${risk.toLowerCase()}`}><span />{risk}</span>;
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("Last 7 days");
  const [riskFilter, setRiskFilter] = useState("All risk levels");
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [notice, setNotice] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState(null);
  const copilotInputRef = useRef(null);

  const searchedTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return riskData.transactions.filter((transaction) => {
      const matchesSearch = !normalizedSearch || [
        transaction.id,
        transaction.customer,
        transaction.type,
        transaction.location,
        transaction.status,
      ].some((field) => field.toLowerCase().includes(normalizedSearch));
      return matchesSearch;
    });
  }, [search]);

  const filteredTransactions = useMemo(() => (
    activePage !== "transactions" || riskFilter === "All risk levels"
      ? searchedTransactions
      : searchedTransactions.filter((transaction) => transaction.risk === riskFilter)
  ), [activePage, riskFilter, searchedTransactions]);

  const currentTitle = {
    overview: "Overview",
    transactions: "Transactions",
    alerts: "Risk alerts",
    customers: "Customers",
    regulatory: "Regulatory intelligence",
    reports: "Reports",
    agents: "Agent skills",
  }[activePage];

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  }

  function exportReport() {
    const report = {
      organization: riskData.organization,
      generatedAt: new Date().toISOString(),
      reportingPeriod: period,
      ...buildAuditReport(riskData),
      transactions: filteredTransactions,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "riskshield-audit-report.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showNotice("Your audit report has been downloaded.");
  }

  function askCopilot(question) {
    const text = question.trim();
    if (!text) return;
    setCopilotAnswer(answerRiskQuestion(text, riskData));
    setQuery("");
  }

  function submitQuery(event) {
    event.preventDefault();
    askCopilot(query);
  }

  function openCopilot() {
    setActivePage("overview");
    window.setTimeout(() => copilotInputRef.current?.focus(), 0);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage("overview"); }} aria-label="RiskShield home">
          <span className="brand-mark"><Icon name="shield" size={21} /></span>
          <span className="brand-name">risk<span>shield</span></span>
        </a>

        <button className="workspace-switcher" onClick={() => showNotice("Northstar Financial workspace selected.")}>
          <span className="workspace-avatar">N</span>
          <span className="workspace-copy"><strong>Northstar Financial</strong><small>Enterprise plan</small></span>
          <Icon name="down" size={15} />
        </button>

        <nav className="side-nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-link ${activePage === item.id ? "active" : ""}`}
                  onClick={() => setActivePage(item.id)}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {item.count && <span className="nav-count">{item.count}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><Icon name="sparkle" size={18} /></span>
            <strong>Need a hand?</strong>
            <p>Ask your risk intelligence copilot anything.</p>
            <button onClick={openCopilot}>Talk to copilot <span>↗</span></button>
          </div>
          <button className="profile-button" onClick={() => showNotice("Signed in as Parameshwaran KRISHNAMOORTHI · Risk analyst.")}>
            <span className="profile-avatar">PK</span>
            <span className="profile-copy"><strong>Parameshwaran KRISHNAMOORTHI</strong><small>Risk analyst</small></span>
            <Icon name="down" size={15} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{currentTitle}</strong></div>
          <div className="topbar-actions">
            <label className="global-search">
              <Icon name="search" size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search anything..." aria-label="Search transactions" />
              <kbd>⌘ K</kbd>
            </label>
            <button className="copilot-shortcut" onClick={openCopilot}><Icon name="sparkle" size={16} /><span>Ask copilot</span></button>
            <button className="icon-button notification-button" aria-label="View risk alerts" onClick={() => setActivePage("alerts")}><Icon name="bell" size={19} /><i /></button>
            <span className="topbar-divider" />
            <span className="today-label"><span className="live-dot" /> System operational</span>
          </div>
        </header>

        <div className="page-content">
          {activePage === "overview" && (
            <Overview
              filteredTransactions={searchedTransactions}
              period={period}
              onPeriodChange={setPeriod}
              onExport={exportReport}
              onSelectTransaction={setSelectedTransaction}
              onNavigate={setActivePage}
              query={query}
              onQueryChange={setQuery}
              onSubmitQuery={submitQuery}
              onAskCopilot={askCopilot}
              copilotInputRef={copilotInputRef}
              copilotAnswer={copilotAnswer}
            />
          )}
          {activePage === "transactions" && (
            <TransactionsPage
              transactions={filteredTransactions}
              riskFilter={riskFilter}
              onRiskFilterChange={setRiskFilter}
              onSelectTransaction={setSelectedTransaction}
              onExport={exportReport}
            />
          )}
          {activePage === "alerts" && <AlertsPage onNavigate={setActivePage} onSelectTransaction={setSelectedTransaction} />}
          {activePage === "reports" && <ReportsPage onExport={exportReport} />}
          {activePage === "customers" && <CustomersPage accounts={riskData.accounts} transactions={riskData.transactions} />}
          {activePage === "agents" && <AgentSkillsPage dataset={riskData} />}
          {activePage === "regulatory" && <RegulatoryPage onExport={exportReport} />}
        </div>
      </main>

      {selectedTransaction && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTransaction(null); }}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
            <div className="modal-header">
              <div><span className="eyebrow">TRANSACTION REVIEW</span><h2 id="transaction-detail-title">{selectedTransaction.id}</h2></div>
              <button className="icon-button" onClick={() => setSelectedTransaction(null)} aria-label="Close transaction details"><Icon name="close" /></button>
            </div>
            <div className="detail-amount">{formatMoney(selectedTransaction.amount)} <span>USD</span></div>
            <div className="detail-grid">
              <div><small>Customer</small><strong>{selectedTransaction.customer}</strong></div>
              <div><small>Risk score</small><strong>{selectedTransaction.score} / 100 · {selectedTransaction.risk}</strong></div>
              <div><small>Transaction type</small><strong>{selectedTransaction.type}</strong></div>
              <div><small>Location</small><strong>{selectedTransaction.location}</strong></div>
              <div><small>Account</small><strong>{selectedTransaction.account}</strong></div>
              <div><small>Status</small><strong>{selectedTransaction.status}</strong></div>
            </div>
            <div className="explanation-box"><span className="explanation-icon"><Icon name="sparkle" size={17} /></span><div><strong>Why this was flagged</strong><p>{selectedTransaction.reason}</p><a href="#policy" onClick={(event) => { event.preventDefault(); setSelectedTransaction(null); setActivePage("regulatory"); }}>{selectedTransaction.reference} <Icon name="external" size={13} /></a></div></div>
            <button className="button button-primary modal-done" onClick={() => setSelectedTransaction(null)}>Done</button>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15} /></span>{notice}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

function Overview({ filteredTransactions, period, onPeriodChange, onExport, onSelectTransaction, onNavigate, query, onQueryChange, onSubmitQuery, onAskCopilot, copilotInputRef, copilotAnswer }) {
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date()).toUpperCase();

  return (
    <>
      <PageHeading
        eyebrow={todayLabel}
        title="Good day, Parameshwaran"
        description="Here’s what’s happening across your risk landscape today."
        action={<button className="button button-secondary" onClick={onExport}><Icon name="download" size={16} /> Export report</button>}
      />
      <section className="metric-grid" aria-label="Risk overview metrics">
        {riskData.metrics.map((metric) => (
          <article className="metric-card" key={metric.id}>
            <div className="metric-top"><span className={`metric-icon tone-${metric.tone}`}><Icon name={metric.icon} size={18} /></span><button className="metric-menu" aria-label={`More about ${metric.label}`}>···</button></div>
            <p className="metric-label">{metric.label}</p>
            <div className="metric-value-row"><strong>{metric.value}</strong><span className={`metric-change ${metric.direction}`}>{metric.direction === "down" ? "↓" : "↑"} {metric.change}</span></div>
            <small>{metric.caption}</small>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div><h2>Risk activity</h2><p>Flagged activity across your portfolio</p></div>
            <select className="select-control" value={period} onChange={(event) => onPeriodChange(event.target.value)} aria-label="Risk activity reporting period">
              <option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option>
            </select>
          </div>
          <div className="chart-legend"><span><i className="legend-dot fraud-dot" /> Fraud signals</span><span><i className="legend-dot aml-dot" /> AML alerts</span></div>
          <div className="chart-area" role="img" aria-label={`Bar chart of fraud signals and AML alerts for ${period.toLowerCase()}`}>
            <div className="chart-y-labels"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
            <div className="chart-bars">
              {[...riskData.trend, ...riskData.trend].slice(0, period === "Last 7 days" ? 7 : period === "Last 30 days" ? 10 : 12).map((item, index) => (
                <div className="chart-column" key={`${item.day}-${index}`}>
                  <div className="bar-pair"><span className="bar bar-fraud" style={{ height: `${item.fraud}%` }} /><span className="bar bar-aml" style={{ height: `${item.aml}%` }} /></div>
                  <span className="chart-x-label">{item.day}</span>
                </div>
              ))}
            </div>
            <div className="chart-gridlines"><i /><i /><i /><i /><i /></div>
          </div>
          <div className="trend-foot"><span><span className="live-dot" /> Data refreshed 2 minutes ago</span><button className="text-button" onClick={() => onNavigate("transactions")}>View transactions <Icon name="chevron" size={14} /></button></div>
        </section>

        <section className="panel copilot-panel">
          <div className="copilot-heading"><span className="copilot-mark"><Icon name="sparkle" size={19} /></span><div><h2>Risk copilot</h2><p>Grounded answers, with evidence</p></div><span className="online-pill">Online</span></div>
          {copilotAnswer ? (
            <div className="copilot-answer">
              <div className="greeting-bubble"><p>{copilotAnswer.answer}</p><span>Grounded using local generated records · {new Date(copilotAnswer.generatedAt).toLocaleTimeString()}</span></div>
              {copilotAnswer.evidence.length > 0 && <div className="copilot-evidence"><strong>Evidence & citations</strong>{copilotAnswer.evidence.slice(0, 3).map((item) => <span key={`${item.type}-${item.id}`}><b>{item.id}</b> · {item.detail}</span>)}</div>}
            </div>
          ) : (
            <div className="copilot-greeting"><div className="mini-copilot"><Icon name="sparkle" size={16} /></div><div className="greeting-bubble"><p>Hi Alex! I’ve reviewed <strong>{riskData.transactions.length} generated transactions</strong>. There are <strong>{riskData.transactions.filter((item) => item.risk === "High").length} high-risk candidates</strong> for review.</p><span>Generated locally · synthetic demo records</span></div></div>
          )}
          <p className="prompt-label">SUGGESTED QUESTIONS</p>
          <div className="prompt-list">{riskData.quickPrompts.map((prompt) => <button key={prompt} onClick={() => onAskCopilot(prompt)}>{prompt}<Icon name="chevron" size={14} /></button>)}</div>
          <form className="copilot-input-wrap" onSubmit={onSubmitQuery}>
            <input ref={copilotInputRef} id="copilot-input" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Ask about risk, fraud, compliance..." aria-label="Ask the risk copilot" />
            <button type="submit" aria-label="Send question"><Icon name="send" size={16} /></button>
          </form>
          <p className="copilot-disclaimer">Rule-grounded synthetic demo. Review cited records; this is not a fraud determination.</p>
        </section>
      </div>

      <section className="panel transactions-panel">
        <div className="panel-heading transaction-panel-heading">
          <div><h2>Recent transactions</h2><p>Monitor and review suspicious activity</p></div>
          <button className="text-button" onClick={() => onNavigate("transactions")}>View all transactions <Icon name="chevron" size={14} /></button>
        </div>
        <TransactionsTable transactions={filteredTransactions.slice(0, 5)} onSelectTransaction={onSelectTransaction} />
      </section>
      <p className="data-note">Demo workspace · Synthetic data for illustrative purposes only</p>
    </>
  );
}

function TransactionsTable({ transactions, onSelectTransaction }) {
  if (transactions.length === 0) {
    return <div className="table-empty"><Icon name="search" size={20} /><strong>No transactions found</strong><span>Try changing your search or risk filter.</span></div>;
  }
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>TRANSACTION</th><th>TYPE</th><th>AMOUNT</th><th>RISK SCORE</th><th>STATUS</th><th><span className="sr-only">Open details</span></th></tr></thead>
        <tbody>{transactions.map((transaction) => (
          <tr key={transaction.id} onClick={() => onSelectTransaction(transaction)} tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter") onSelectTransaction(transaction); }}>
            <td><div className="transaction-person"><span className={`customer-avatar avatar-${transaction.initials.charCodeAt(0) % 5}`}>{transaction.initials}</span><span><strong>{transaction.customer}</strong><small>{transaction.id} · {transaction.time}</small></span></div></td>
            <td><span className="transaction-type">{transaction.type}</span><small className="location-label">{transaction.location}</small></td>
            <td className="amount-cell">{formatMoney(transaction.amount)}</td>
            <td><div className="score-cell"><RiskBadge risk={transaction.risk} /><span>{transaction.score}</span></div></td>
            <td><span className={`status status-${transaction.status.toLowerCase().replaceAll(" ", "-")}`}><i />{transaction.status}</span></td>
            <td><button className="row-more" aria-label={`View ${transaction.id} details`} onClick={(event) => { event.stopPropagation(); onSelectTransaction(transaction); }}><Icon name="chevron" size={16} /></button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TransactionsPage({ transactions, riskFilter, onRiskFilterChange, onSelectTransaction, onExport }) {
  return (
    <>
      <PageHeading eyebrow="MONITORING" title="Transactions" description="Review transaction activity and investigate risk signals." action={<button className="button button-secondary" onClick={onExport}><Icon name="download" size={16} /> Export report</button>} />
      <section className="panel full-table-panel">
        <div className="panel-heading transaction-panel-heading">
          <div><h2>All transactions <span className="heading-count">{transactions.length}</span></h2><p>Search transactions using the global search above</p></div>
          <select className="select-control" value={riskFilter} onChange={(event) => onRiskFilterChange(event.target.value)} aria-label="Filter by risk level"><option>All risk levels</option><option>High</option><option>Medium</option><option>Low</option></select>
        </div>
        <TransactionsTable transactions={transactions} onSelectTransaction={onSelectTransaction} />
      </section>
      <p className="data-note">Demo workspace · Synthetic data for illustrative purposes only</p>
    </>
  );
}

function AlertsPage({ onNavigate, onSelectTransaction }) {
  const highPriorityCount = riskData.alerts.filter((alert) => alert.severity === "High").length;
  return (
    <>
      <PageHeading eyebrow="INVESTIGATIONS" title="Risk alerts" description="Prioritize actionable signals with explainable evidence." action={<span className="alert-summary-pill"><span /> {highPriorityCount} high priority</span>} />
      <div className="alert-list">{riskData.alerts.map((alert) => {
        const transaction = riskData.transactions.find((item) => item.id === alert.transactionId);
        return (
          <article className="panel alert-card" key={alert.id}>
            <span className={`alert-severity-icon severity-${alert.severity.toLowerCase()}`}><Icon name={alert.category === "AML" ? "flag" : "activity"} size={18} /></span>
            <div className="alert-content"><div className="alert-title-line"><h2>{alert.title}</h2><RiskBadge risk={alert.severity} /></div><p>{alert.detail}</p><div className="alert-meta"><span>{alert.id}</span><span>{alert.category}</span><span><Icon name="clock" size={13} />{alert.time}</span><span className="alert-source">{alert.source}</span></div></div>
            <button className="button button-secondary alert-review" onClick={() => transaction ? onSelectTransaction(transaction) : onNavigate("customers")}>Review <Icon name="chevron" size={14} /></button>
          </article>
        );
      })}</div>
    </>
  );
}

function RegulatoryPage({ onExport }) {
  const policies = getPolicyReferences();
  return (
    <>
      <PageHeading eyebrow="POLICY & CONTROLS" title="Regulatory intelligence" description="Inspect rule evaluations and source citations; this demo does not certify regulatory compliance." action={<button className="button button-secondary" onClick={onExport}><Icon name="download" size={16} /> Export evidence</button>} />
      <div className="regulatory-intro"><div className="regulatory-intro-icon"><Icon name="book" size={21} /></div><div><strong>Policy sources are linked to risk signals</strong><p>Review control coverage and trace alert explanations to their source references.</p></div><span className="source-count">{policies.length} local references</span></div>
      <div className="regulation-grid">{riskData.regulations.map((regulation) => (
        <article className="panel regulation-card" key={regulation.id}>
          <div className="regulation-top"><span className={`regulation-icon regulation-${regulation.id}`}>{regulation.icon}</span><span className={`regulation-status ${regulation.status === "Minimums met" || regulation.status === "Evaluated" ? "compliant" : "review"}`}><i />{regulation.status}</span></div>
          <h2>{regulation.name}</h2><p>{regulation.subtitle}</p>
          <div className="coverage-label"><span>{regulation.coverageLabel}</span><strong>{regulation.coverage}%</strong></div>
          <div className="coverage-track"><span style={{ width: `${regulation.coverage}%` }} /></div>
          <div className="regulation-footer"><span>{regulation.updated}</span><button className="text-button" onClick={() => document.querySelector("#policy-evidence")?.scrollIntoView({ behavior: "smooth" })}>View controls <Icon name="chevron" size={14} /></button></div>
        </article>
      ))}</div>
      <section className="panel evidence-panel" id="policy-evidence"><div className="panel-heading"><div><h2>Evidence & source references</h2><p>Policy citations used in recent risk decisions</p></div><span className="verified-pill"><Icon name="book" size={13} /> Configured local sources</span></div>
        {policies.map((policy) => <div className="evidence-row" key={policy.id}><span className="evidence-icon"><Icon name="book" size={16} /></span><div><strong>{policy.reference}</strong><span>{policy.name} · {policy.text}</span></div><span className="policy-id">{policy.id}</span></div>)}
      </section>
      <LocalPolicySearch policies={policies} />
      <p className="data-note">Illustrative coverage only. Consult official regulatory publications for authoritative guidance.</p>
    </>
  );
}

function LocalPolicySearch({ policies }) {
  const [query, setQuery] = useState("");
  const terms = query.trim().toLowerCase().split(/[^a-z0-9§.]+/).filter((term) => term.length > 1);
  const matches = query.trim()
    ? policies.filter((policy) => terms.some((term) => `${policy.id} ${policy.name} ${policy.reference} ${policy.text}`.toLowerCase().includes(term)))
    : [];
  return (
    <section className="panel mcp-panel">
      <div className="panel-heading">
        <div><h2>Search local policy references</h2><p>Search the policy text bundled with this demo. No MCP server or external connection is required.</p></div>
        <span className="mcp-status mcp-connected">Local sources</span>
      </div>
      <form className="mcp-search-form" onSubmit={(event) => event.preventDefault()}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try AML, structuring, Basel, or CET1…" aria-label="Search bundled policy references" />
      </form>
      {query.trim() && <div className="local-policy-results" aria-live="polite">{matches.length ? matches.map((policy) => <article key={policy.id}><span>{policy.id}</span><div><strong>{policy.name} · {policy.reference}</strong><p>{policy.text}</p></div></article>) : <p>No matching bundled policy references. Try a broader search term.</p>}</div>}
    </section>
  );
}

function ReportsPage({ onExport }) {
  return (
    <>
      <PageHeading eyebrow="AUDIT & OVERSIGHT" title="Reports" description="Generate a traceable snapshot of risk signals and supporting evidence." />
      <section className="panel report-builder"><span className="report-builder-icon"><Icon name="chart" size={21} /></span><div><h2>Risk & compliance snapshot</h2><p>Export metrics, recent alerts, and matched transaction evidence as a structured JSON audit file.</p><div className="report-includes"><span><Icon name="check" size={14} /> Risk indicators</span><span><Icon name="check" size={14} /> Alert evidence</span><span><Icon name="check" size={14} /> Transaction references</span></div><button className="button button-primary" onClick={onExport}><Icon name="download" size={16} /> Generate JSON report</button></div></section>
      <div className="report-note"><Icon name="shield" size={17} /><span><strong>Designed for explainability</strong><br />Every included alert contains a source reference. Reports use synthetic demonstration data.</span></div>
    </>
  );
}

function AgentSkillsPage({ dataset }) {
  const skills = [
    { title: "Fraud signal detection", description: "Flags amounts above customer baselines and unfamiliar transaction countries.", count: dataset.alerts.filter((alert) => alert.category === "Fraud").length, source: "FRAUD-4.2 · FRAUD-2.8" },
    { title: "AML structuring review", description: "Groups wire transfers below the configured threshold over a rolling 24-hour window.", count: dataset.alerts.filter((alert) => alert.category === "AML").length, source: "AML-STR-01 · FATF Recommendation 20" },
    { title: "Transaction velocity", description: "Identifies repeated activity in a rolling 15-minute account window.", count: dataset.transactions.filter((item) => item.findings.some((finding) => finding.code === "FRAUD-3.1")).length, source: "Fraud policy §3.1" },
    { title: "Basel capital calculation", description: "Computes CET1, Tier 1, and total capital ratios from disclosed demo inputs.", count: 3, source: "BASEL-CET1 · BASEL-TIER1" },
  ];
  return (
    <>
      <PageHeading eyebrow="EXPLAINABLE RULE ENGINE" title="Agent skills" description="Local, deterministic demo skills run against the generated dataset and include their evidence." />
      <section className="panel skills-summary"><div><strong>{dataset.accounts.length}</strong><span>synthetic accounts</span></div><div><strong>{dataset.transactions.length}</strong><span>analyzed transactions</span></div><div><strong>{dataset.alerts.length}</strong><span>rule findings</span></div><div><strong>3</strong><span>Basel ratios calculated</span></div></section>
      <div className="skill-grid">{skills.map((skill) => <article className="panel skill-card" key={skill.title}><div className="skill-title"><span className="copilot-mark"><Icon name="sparkle" size={17} /></span><span className="online-pill">Executed</span></div><h2>{skill.title}</h2><p>{skill.description}</p><div className="skill-footer"><span>{skill.count} results</span><span>{skill.source}</span></div></article>)}</div>
      <section className="panel capital-panel"><div className="panel-heading"><div><h2>Basel III ratio calculations</h2><p>Derived directly from synthetic capital and RWA values</p></div></div><div className="capital-grid">{[["CET1", dataset.capitalMetrics.cet1Ratio, dataset.capitalMetrics.cet1Minimum], ["Tier 1", dataset.capitalMetrics.tier1Ratio, dataset.capitalMetrics.tier1Minimum], ["Total capital", dataset.capitalMetrics.totalCapitalRatio, dataset.capitalMetrics.totalCapitalMinimum]].map(([label, value, minimum]) => <div key={label}><strong>{value.toFixed(2)}%</strong><span>{label} ratio</span><small>Basel III minimum: {minimum}%</small></div>)}</div><p className="data-note">{dataset.capitalMetrics.source}</p></section>
    </>
  );
}

function CustomersPage({ accounts, transactions }) {
  return (
    <>
      <PageHeading eyebrow="CUSTOMER PROFILES" title="Customers" description="Generated account profiles are linked to transactions and explainable risk findings." />
      <section className="panel customers-panel"><div className="panel-heading"><div><h2>Generated customer accounts <span className="heading-count">{accounts.length}</span></h2><p>Synthetic demonstration records · no personal or production data</p></div></div><div className="customer-list">{accounts.map((account) => { const activity = transactions.filter((item) => item.accountId === account.id); const flagged = activity.filter((item) => item.findings.length); return <div className="customer-row" key={account.id}><span className="customer-avatar">{account.initials}</span><div><strong>{account.customer}</strong><small>{account.customerId} · {account.id} · {account.account}</small></div><span className="customer-country">{account.homeCountry}</span><span className="customer-activity">{activity.length} transactions</span><span className={`customer-risk risk-${account.riskRating.toLowerCase()}`}>{account.riskRating} profile</span><span className="customer-flagged">{flagged.length} findings</span></div>; })}</div></section>
    </>
  );
}

export default App;
