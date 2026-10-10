import { useMemo, useState } from "react";
import { useDatabase, useSession } from "../../app/store";
import { formatDateTime, formatMoney, formatShortDate, relativeTime } from "../../utils/format";
import { PORTAL_TIMELINE, portalProgress, statusLabel, statusTone } from "../../domain/workflows";
import { paidCentsForInvoice, repairValueCents } from "../../domain/calculations";
import { eventsForRepair, partsForRepair } from "../../services/repairService";
import { Badge, Card, CardHead, EmptyState, PlannedModule, Tabs } from "../../components/ui";
import { PageHeader } from "../../components/layout/AppShell";
import { Icon } from "../../components/ui/Icon";
import type { Cents } from "../../domain/types";

const TABS = ["Overview", "My Repairs", "Invoices", "Messages"];

export function PortalPage() {
  const db = useDatabase();
  const session = useSession();
  const [tab, setTab] = useState(TABS[0]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const customerId = session?.customerId ?? "";
  const customer = db.customers.find((item) => item.id === customerId);
  const symbol = db.business.currencySymbol;

  const repairs = useMemo(
    () =>
      db.repairs
        .filter((repair) => repair.customerId === customerId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [db.repairs, customerId],
  );

  if (!customer) {
    return (
      <Card>
        <EmptyState
          icon="users"
          title="No customer profile linked"
          message="Sign in with a customer account to view the portal."
        />
      </Card>
    );
  }

  const active = repairs.filter((repair) => repair.status !== "delivered" && repair.status !== "cancelled");
  const ready = repairs.filter((repair) => repair.status === "ready_for_collection");
  const pendingApproval = repairs.filter((repair) => repair.status === "waiting_approval");
  const outstanding: Cents = repairs.reduce((total, repair) => {
    const value = repairValueCents(db, repair);
    const paid = repair.invoiceId ? paidCentsForInvoice(db.payments, repair.invoiceId) : 0;
    return total + Math.max(0, value - paid);
  }, 0);

  return (
    <>
      <PageHeader
        title={`Hello, ${customer.name.split(" ")[0]}`}
        subtitle="Follow your repairs, review invoices and see every update the workshop has shared."
      />

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-icon purple">
            <Icon name="tool" />
          </div>
          <span className="kpi-label">Active repairs</span>
          <strong className="kpi-value">{active.length}</strong>
        </div>
        <div className="kpi">
          <div className="kpi-icon green">
            <Icon name="check" />
          </div>
          <span className="kpi-label">Ready for collection</span>
          <strong className="kpi-value">{ready.length}</strong>
        </div>
        <div className="kpi">
          <div className="kpi-icon orange">
            <Icon name="clock" />
          </div>
          <span className="kpi-label">Your approval needed</span>
          <strong className="kpi-value">{pendingApproval.length}</strong>
        </div>
        <div className="kpi">
          <div className="kpi-icon blue">
            <Icon name="wallet" />
          </div>
          <span className="kpi-label">Outstanding balance</span>
          <strong className="kpi-value">{formatMoney(outstanding, symbol, 0)}</strong>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Overview" && (
        <Card>
          <CardHead title="Repair progress" subtitle="Live status of every device you have booked in." />
          {repairs.length === 0 ? (
            <EmptyState icon="tool" title="No repairs yet" message="When you book a device in, its progress appears here." />
          ) : (
            <div className="portal-repairs">
              {repairs.slice(0, 4).map((repair) => (
                <button
                  key={repair.id}
                  type="button"
                  className="portal-repair"
                  onClick={() => {
                    setTab("My Repairs");
                    setExpanded(repair.id);
                  }}
                >
                  <div className="portal-repair-head">
                    <div className="kpi-icon blue">
                      <Icon name="tool" size={16} />
                    </div>
                    <div>
                      <strong>
                        {repair.device.brand} {repair.device.model}
                      </strong>
                      <span>
                        {repair.number} · Updated {relativeTime(repair.updatedAt)}
                      </span>
                    </div>
                    <Badge tone={statusTone(repair.status)}>{statusLabel(repair.status)}</Badge>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.max(6, portalProgress(repair.status) * 100)}%` }} />
                  </div>
                  <div className="portal-repair-foot">
                    <span>{repair.expectedAt ? `Due ${formatShortDate(repair.expectedAt)}` : "No due date yet"}</span>
                    <strong>{formatMoney(repairValueCents(db, repair), symbol)}</strong>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "My Repairs" && (
        <Card>
          <CardHead title="My repairs" subtitle={`${repairs.length} booking${repairs.length === 1 ? "" : "s"} on record`} />
          {repairs.length === 0 ? (
            <EmptyState icon="tool" title="No repairs" message="Nothing has been booked under your account." />
          ) : (
            <div className="portal-repairs">
              {repairs.map((repair) => {
                const open = expanded === repair.id;
                const value = repairValueCents(db, repair);
                const paid = repair.invoiceId ? paidCentsForInvoice(db.payments, repair.invoiceId) : 0;
                const events = eventsForRepair(db, repair.id);
                const parts = partsForRepair(db, repair.id);
                const updates = events.filter((event) => event.visibility === "customer");
                return (
                  <div className={`portal-detail ${open ? "open" : ""}`} key={repair.id}>
                    <button type="button" onClick={() => setExpanded(open ? null : repair.id)}>
                      <div className="kpi-icon purple">
                        <Icon name="tool" size={16} />
                      </div>
                      <div>
                        <strong>
                          {repair.device.brand} {repair.device.model}
                        </strong>
                        <span>
                          {repair.number} · {formatShortDate(repair.intake.receivedAt)}
                        </span>
                      </div>
                      <Badge tone={statusTone(repair.status)}>{statusLabel(repair.status)}</Badge>
                      <Icon name="arrow" size={16} />
                    </button>

                    {open && (
                      <div className="portal-detail-body">
                        <div className="info-list">
                          <div>
                            <span>Reported issue</span>
                            <strong>{repair.intake.complaint}</strong>
                          </div>
                          {repair.diagnosis && (
                            <div>
                              <span>Findings</span>
                              <strong>{repair.diagnosis.findings}</strong>
                            </div>
                          )}
                          <div>
                            <span>Technician</span>
                            <strong>{repair.technicianName ?? "Not assigned yet"}</strong>
                          </div>
                          <div>
                            <span>Expected</span>
                            <strong>{repair.expectedAt ? formatShortDate(repair.expectedAt) : "To be confirmed"}</strong>
                          </div>
                        </div>

                        {parts.length > 0 && (
                          <>
                            <h3>Parts used</h3>
                            <table>
                              <tbody>
                                {parts.map((part) => (
                                  <tr key={part.id}>
                                    <td>{part.name}</td>
                                    <td className="num">×{part.quantity}</td>
                                    <td className="num">{formatMoney(part.lineTotalCents, symbol)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}

                        <div className="portal-totals">
                          <div>
                            <span>Labour</span>
                            <strong>{formatMoney(repair.labourCents, symbol)}</strong>
                          </div>
                          <div>
                            <span>Total</span>
                            <strong>{formatMoney(value, symbol)}</strong>
                          </div>
                          <div>
                            <span>Paid</span>
                            <strong>{formatMoney(paid, symbol)}</strong>
                          </div>
                          <div>
                            <span>Balance</span>
                            <strong>{formatMoney(Math.max(0, value - paid), symbol)}</strong>
                          </div>
                        </div>

                        {updates.length > 0 && (
                          <>
                            <h3>Updates from the workshop</h3>
                            <div className="note-box">
                              {updates.map((event) => (
                                <div className="note" key={event.id}>
                                  <div className="note-head">
                                    <strong>{event.actorName}</strong>
                                    <span>{relativeTime(event.createdAt)}</span>
                                  </div>
                                  <p>{event.message}</p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <h3>History</h3>
                        <div className="activity-log">
                          {events
                            .filter((event) => event.visibility === "customer")
                            .map((event) => (
                              <div className="log-item" key={event.id}>
                                <span className="dot" />
                                <div>
                                  <strong>{event.message}</strong>
                                  <span>{formatDateTime(event.createdAt)}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "Invoices" && (
        <Card className="table-card">
          <CardHead title="Invoices" subtitle="Every repair billed to your account." />
          {repairs.filter((repair) => repair.invoiceId).length === 0 ? (
            <EmptyState
              icon="file"
              title="No invoices yet"
              message="Invoices appear once a repair is completed and billed."
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Repair</th>
                  <th>Device</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {repairs
                  .filter((repair) => repair.invoiceId)
                  .map((repair) => {
                    const value = repairValueCents(db, repair);
                    const paid = paidCentsForInvoice(db.payments, repair.invoiceId!);
                    const balance = value - paid;
                    return (
                      <tr key={repair.id}>
                        <td>
                          <strong>{repair.number}</strong>
                        </td>
                        <td>
                          {repair.device.brand} {repair.device.model}
                        </td>
                        <td className="num">{formatMoney(value, symbol)}</td>
                        <td className="num">{formatMoney(paid, symbol)}</td>
                        <td>
                          <Badge tone={balance > 0 ? "low-stock" : "in-stock"}>
                            {balance > 0 ? `${formatMoney(balance, symbol)} due` : "Paid"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "Messages" && (
        <PlannedModule
          title="Messages"
          phase={3}
          description="Two-way messaging needs a notification and delivery layer, so it is not simulated here."
        />
      )}

      <p className="table-footnote">
        Portal progress is derived from the live repair status ({PORTAL_TIMELINE.length} stages tracked).
      </p>
    </>
  );
}
