import { useMemo, useState } from "react";
import { useDatabase, useSession, useStore } from "../../app/store";
import { formatDateTime, formatMoney, formatShortDate, relativeTime } from "../../utils/format";
import { REPAIR_STATUSES, statusLabel, statusTone } from "../../domain/workflows";
import { repairTotalsCents } from "../../domain/calculations";
import { eventsForRepair, partsForRepair } from "../../services/repairService";
import { Badge, Button, Card, CardHead, EmptyState, Field, PageHeader, Tabs, TextArea } from "../../components/ui";
import { Icon } from "../../components/ui/Icon";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "repairs", label: "My Repairs" },
  { id: "invoices", label: "Invoices" },
  { id: "messages", label: "Messages" },
] as const;

export function PortalPage() {
  const db = useDatabase();
  const session = useSession();
  const { run, pushToast } = useStore();
  const [tab, setTab] = useState("overview");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const customerId = session?.scope?.customerId ?? session?.customerId ?? "";
  const customer = db.customers.find((item) => item.id === customerId);
  const symbol = db.business.currencySymbol;

  const repairs = useMemo(
    () => db.repairs.filter((repair) => repair.customerId === customerId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [db.repairs, customerId],
  );
  const messages = useMemo(
    () => (customerId ? db.messages.filter((message) => message.customerId === customerId) : []),
    [db.messages, customerId],
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
  const outstanding = repairs.reduce((total, repair) => {
    const totals = repairTotalsCents(repair);
    return total + Math.max(0, totals.totalCents - totals.paidCents);
  }, 0);

  const sendMessage = () => {
    if (!draft.trim()) return;
    run((draftDb) => {
      draftDb.messages.unshift({
        id: `msg-${Date.now().toString(36)}`,
        customerId: customer.id,
        author: "customer",
        authorName: customer.name,
        body: draft,
        createdAt: new Date().toISOString(),
        channel: "portal",
      });
      return { ok: true as const, value: undefined };
    });
    setDraft("");
    pushToast("success", "Message sent to the service team.");
  };

  return (
    <>
      <PageHeader
        title={`Hello, ${customer.name.split(" ")[0]}`}
        subtitle="Follow your repairs, review invoices and message the team — updated from the live service record."
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
            <Icon name="file" />
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

      <Tabs options={[...TABS]} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <Card>
          <CardHead title="Repair progress" subtitle="Live status of every device you have booked in." />
          {repairs.length === 0 ? (
            <EmptyState icon="tool" title="No repairs yet" message="When you book a device in, its progress appears here." />
          ) : (
            <div className="portal-repairs">
              {repairs.slice(0, 4).map((repair) => {
                const stageIndex = REPAIR_STATUSES.findIndex((item) => item.id === repair.status);
                return (
                  <button
                    key={repair.id}
                    type="button"
                    className="portal-repair"
                    onClick={() => {
                      setTab("repairs");
                      setExpanded(repair.id);
                    }}
                  >
                    <div className="portal-repair-head">
                      <div className="kpi-icon blue">
                        <Icon name="laptop" size={16} />
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
                      <span style={{ width: `${Math.max(6, ((stageIndex + 1) / REPAIR_STATUSES.length) * 100)}%` }} />
                    </div>
                    <div className="portal-repair-foot">
                      <span>{repair.expectedAt ? `Due ${formatShortDate(repair.expectedAt)}` : "No due date yet"}</span>
                      <strong>{formatMoney(repairTotalsCents(repair).totalCents, symbol)}</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "repairs" && (
        <Card>
          <CardHead title="My repairs" subtitle={`${repairs.length} booking${repairs.length === 1 ? "" : "s"} on record`} />
          {repairs.length === 0 ? (
            <EmptyState icon="tool" title="No repairs" message="Nothing has been booked under your account." />
          ) : (
            <div className="portal-repairs">
              {repairs.map((repair) => {
                const open = expanded === repair.id;
                const totals = repairTotalsCents(repair);
                const events = eventsForRepair(db, repair.id);
                const parts = partsForRepair(db, repair.id);
                const publicNotes = repair.notes.filter((note) => note.isCustomerVisible);
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
                      <Icon name={open ? "arrow" : "arrow"} size={16} />
                    </button>

                    {open && (
                      <div className="portal-detail-body">
                        <div className="info-list">
                          <div>
                            <span>Reported issue</span>
                            <strong>{repair.complaint}</strong>
                          </div>
                          {repair.diagnosis && (
                            <div>
                              <span>Findings</span>
                              <strong>{repair.diagnosis.notes}</strong>
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
                                    <td>{part.productName}</td>
                                    <td className="num">×{part.quantity}</td>
                                    <td className="num">{formatMoney(part.unitPriceCents * part.quantity, symbol)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}

                        <div className="portal-totals">
                          <div>
                            <span>Parts</span>
                            <strong>{formatMoney(totals.partsCents, symbol)}</strong>
                          </div>
                          <div>
                            <span>Labour</span>
                            <strong>{formatMoney(totals.labourCents, symbol)}</strong>
                          </div>
                          <div>
                            <span>Total</span>
                            <strong>{formatMoney(totals.totalCents, symbol)}</strong>
                          </div>
                          <div>
                            <span>Balance</span>
                            <strong>{formatMoney(Math.max(0, totals.totalCents - totals.paidCents), symbol)}</strong>
                          </div>
                        </div>

                        {publicNotes.length > 0 && (
                          <>
                            <h3>Updates from the workshop</h3>
                            <div className="note-box">
                              {publicNotes.map((note) => (
                                <div className="note" key={note.id}>
                                  <div className="note-head">
                                    <strong>{note.authorName}</strong>
                                    <span>{relativeTime(note.createdAt)}</span>
                                  </div>
                                  <p>{note.message}</p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <h3>History</h3>
                        <div className="timeline">
                          {events.map((event) => (
                            <div className="timeline-item" key={event.id}>
                              <span className="dot" />
                              <div>
                                <strong>{event.label}</strong>
                                <span>{formatDateTime(event.at)}</span>
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

      {tab === "invoices" && (
        <Card className="table-card">
          <CardHead title="Invoices" subtitle="Every sale and repair billed to your account." />
          {repairs.filter((repair) => repair.invoiceId).length === 0 ? (
            <EmptyState icon="file" title="No invoices yet" message="Invoices appear once a repair is completed and billed." />
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
                    const totals = repairTotalsCents(repair);
                    const balance = totals.totalCents - totals.paidCents;
                    return (
                      <tr key={repair.id}>
                        <td>
                          <strong>{repair.number}</strong>
                        </td>
                        <td>
                          {repair.device.brand} {repair.device.model}
                        </td>
                        <td className="num">{formatMoney(totals.totalCents, symbol)}</td>
                        <td className="num">{formatMoney(totals.paidCents, symbol)}</td>
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

      {tab === "messages" && (
        <Card>
          <CardHead title="Messages" subtitle="Conversation with the service team." />
          <div className="messages">
            {messages.map((message) => (
              <div className={`message ${message.author === "customer" ? "mine" : ""}`} key={message.id}>
                <strong>{message.authorName}</strong>
                <p>{message.body}</p>
                <span>{relativeTime(message.createdAt)}</span>
              </div>
            ))}
          </div>
          <Field label="Send a message">
            <TextArea value={draft} onChange={setDraft} rows={3} placeholder="Ask about your repair…" />
          </Field>
          <div className="form-actions">
            <Button onClick={sendMessage}>Send message</Button>
          </div>
        </Card>
      )}
    </>
  );
}
