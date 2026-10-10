import { useMemo, useState } from "react";
import { useCan, useDatabase, useStore } from "../../app/store";
import { navigate as go } from "../../app/router";
import { formatDateTime, formatMoney, formatShortDate, relativeTime } from "../../utils/format";
import {
  POST_APPROVAL_STATUSES,
  allowedNextStatuses,
  canTransition,
  statusLabel,
  statusTone,
} from "../../domain/workflows";
import {
  addRepairNote,
  addRepairPart,
  assignTechnician,
  changeStatus,
  eventsForRepair,
  partsForRepair,
  recordDiagnosis,
  setLabour,
  toggleChecklistItem,
} from "../../services/repairService";
import { inBranchScope, scopeFor } from "../../domain/permissions";
import { availableStock, paidCentsForInvoice } from "../../domain/calculations";
import type { Cents, RepairStatus } from "../../domain/types";
import {
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  Modal,
  PlannedModule,
  Select,
  Tabs,
  TextArea,
  TextInput,
} from "../../components/ui";
import { PageHeader } from "../../components/layout/AppShell";
import { Icon } from "../../components/ui/Icon";

const TABS = ["Overview", "Diagnosis", "Parts", "Testing", "Timeline", "Estimate & Invoice"];

export function RepairDetailPage({ repairId }: { repairId: string }) {
  const db = useDatabase();
  const can = useCan();
  const { run, pushToast, session } = useStore();
  const scope = scopeFor(session);

  const [tab, setTab] = useState(TABS[0]);
  const [statusDraft, setStatusDraft] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisText, setDiagnosisText] = useState("");
  const [recommended, setRecommended] = useState("");
  const [partOpen, setPartOpen] = useState(false);
  const [partId, setPartId] = useState("");
  const [partQty, setPartQty] = useState(1);
  const [labourOpen, setLabourOpen] = useState(false);
  const [labourAmount, setLabourAmount] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePublic, setNotePublic] = useState(false);

  const repair = db.repairs.find((item) => item.id === repairId);
  const parts = useMemo(() => (repair ? partsForRepair(db, repair.id) : []), [db, repairId]);
  const events = useMemo(() => (repair ? eventsForRepair(db, repair.id) : []), [db, repairId]);

  if (!repair || !inBranchScope(scope, repair.branchId)) {
    return (
      <Card>
        <EmptyState
          icon="alert"
          title="Repair not found"
          message="This job does not exist or is outside your branch scope."
          action={<Button onClick={() => go("/repairs")}>Back to repairs</Button>}
        />
      </Card>
    );
  }

  const nextStatuses = allowedNextStatuses(repair.status);
  const transitions = nextStatuses.filter((status) => canTransition(repair.status, status));
  const technicians = db.users.filter(
    (user) => user.role === "technician" && user.isActive && user.branchId === repair.branchId,
  );
  const symbol = db.business.currencySymbol;
  const branch = db.branches.find((item) => item.id === repair.branchId);
  const customer = db.customers.find((item) => item.id === repair.customerId);

  const partsTotal: Cents = parts.reduce((total, part) => total + part.lineTotalCents, 0);
  const total: Cents = partsTotal + repair.labourCents;
  const paid: Cents = repair.invoiceId ? paidCentsForInvoice(db.payments, repair.invoiceId) : 0;

  const history = db.repairs.filter(
    (item) => item.customerId === repair.customerId && item.id !== repair.id,
  );

  const notes = events.filter((event) => event.type === "note");

  /** Approval gates are enforced by validateTransition inside the service. */
  const submitStatus = (reason?: string) => {
    const result = run((draft, actor) =>
      changeStatus(draft, {
        repairId: repair.id,
        to: statusDraft as RepairStatus,
        actor,
        note: reason,
        policyException: reason ? { granted: true, reason } : undefined,
      }),
    );
    if (!result.ok) {
      pushToast("error", result.error);
      setOverrideOpen(false);
      return;
    }
    pushToast("success", `Status changed to ${statusLabel(statusDraft as RepairStatus)}.`);
    setOverrideOpen(false);
    setOverrideReason("");
    setStatusDraft("");
  };

  const requestStatusChange = () => {
    if (!statusDraft) return;
    const to = statusDraft as RepairStatus;
    if (POST_APPROVAL_STATUSES.includes(to) && !repair.approvalId) {
      setOverrideOpen(true);
      return;
    }
    submitStatus();
  };

  return (
    <>
      <PageHeader
        title={repair.number}
        subtitle={`${repair.customerName} · ${repair.device.brand} ${repair.device.model} · ${branch?.name ?? "—"}`}
        actions={
          <>
            <Button kind="secondary" onClick={() => go("/repairs")}>
              Back to repairs
            </Button>
            {can("repairs.assign") && (
              <Button kind="secondary" icon="users" onClick={() => setAssignOpen(true)}>
                {repair.technicianName ? "Reassign" : "Assign"}
              </Button>
            )}
            {statusDraft && <Button icon="check" onClick={requestStatusChange}>Confirm change</Button>}
          </>
        }
      />

      <Card className="repair-hero">
        <div className="hero-device">
          <div className="kpi-icon purple">
            <Icon name="tool" size={22} />
          </div>
          <div>
            <span className="job-id">{repair.number}</span>
            <h2>
              {repair.device.brand} {repair.device.model}
            </h2>
            <p>{repair.device.serial ? `Serial ${repair.device.serial} · ` : ""}{repair.intake.complaint}</p>
          </div>
        </div>
        <div className="hero-status">
          <Badge tone={statusTone(repair.status)}>{statusLabel(repair.status)}</Badge>
          <span className={`priority ${repair.priority}`}>{repair.priority}</span>
          {repair.expectedAt && (
            <span className="due">
              Due {formatShortDate(repair.expectedAt)}
              {new Date(repair.expectedAt).getTime() < Date.now() && repair.status !== "delivered"
                ? " · Overdue"
                : ""}
            </span>
          )}
        </div>
        <div className="hero-actions">
          {transitions.length > 0 && (
            <div className="status-inline">
              <Select
                value={statusDraft}
                onChange={setStatusDraft}
                options={[
                  { value: "", label: "Change status…" },
                  ...transitions.map((status) => ({ value: status, label: `Mark ${statusLabel(status).toLowerCase()}` })),
                ]}
              />
            </div>
          )}
          <Button kind="secondary" onClick={() => setNoteOpen(true)}>
            Add note
          </Button>
        </div>
      </Card>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Overview" && (
        <div className="detail-grid">
          <div className="detail-main">
            <Card>
              <CardHead title="Customer & device" />
              <div className="info-list">
                <div>
                  <span>Customer</span>
                  <strong>{repair.customerName}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{repair.customerPhone}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{customer?.email ?? "—"}</strong>
                </div>
                <div>
                  <span>Received</span>
                  <strong>{formatDateTime(repair.intake.receivedAt)}</strong>
                </div>
                <div>
                  <span>Expected</span>
                  <strong>{repair.expectedAt ? formatDateTime(repair.expectedAt) : "Not set"}</strong>
                </div>
                <div>
                  <span>Technician</span>
                  <strong>{repair.technicianName ?? "Unassigned"}</strong>
                </div>
              </div>
              <div className="issue">
                <h3>Reported issue</h3>
                <p>{repair.intake.complaint}</p>
                <h3>Intake notes</h3>
                <p>{repair.intake.notes ?? "—"}</p>
                <h3>Condition & accessories</h3>
                <p>
                  {repair.device.condition ?? "—"}
                  {repair.device.accessories ? ` · ${repair.device.accessories}` : ""}
                </p>
              </div>
            </Card>

            <Card>
              <CardHead title="Notes" subtitle={`${notes.length} recorded`} />
              {notes.length === 0 ? (
                <EmptyState icon="clock" title="No notes yet" message="Add internal findings or customer-visible updates." />
              ) : (
                <div className="note-box">
                  {notes.map((note) => (
                    <div className="note" key={note.id}>
                      <div className="note-head">
                        <strong>{note.actorName}</strong>
                        <span>{relativeTime(note.createdAt)}</span>
                        {note.visibility === "customer" && <Badge tone="in-stock">Customer visible</Badge>}
                      </div>
                      <p>{note.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="detail-side">
            <Card>
              <CardHead title="Customer" />
              <div className="profile">
                <div className="avatar">
                  {repair.customerName
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <strong>{repair.customerName}</strong>
                  <span>{repair.customerPhone}</span>
                </div>
              </div>
              {history.length > 0 && (
                <div className="history-mini">
                  <h3>Previous repairs</h3>
                  {history.slice(0, 5).map((item) => (
                    <button key={item.id} type="button" onClick={() => go(`/repairs/${item.id}`)}>
                      <strong>{item.number}</strong>
                      <span>
                        {item.device.brand} {item.device.model}
                      </span>
                      <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHead title="Cost summary" subtitle="Live totals from parts and labour" />
              <div className="info-list">
                <div>
                  <span>Parts</span>
                  <strong>{formatMoney(partsTotal, symbol)}</strong>
                </div>
                <div>
                  <span>Labour</span>
                  <strong>{formatMoney(repair.labourCents, symbol)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatMoney(total, symbol)}</strong>
                </div>
                <div>
                  <span>Paid</span>
                  <strong>{formatMoney(paid, symbol)}</strong>
                </div>
              </div>
              {can("repairs.view_financials") && (
                <div className="form-actions">
                  <Button kind="secondary" onClick={() => setLabourOpen(true)}>
                    Set labour
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "Diagnosis" && (
        <Card>
          <CardHead
            title="Diagnosis"
            subtitle="Technician findings and the recommended course of action."
            actions={
              can("repairs.diagnose") ? (
                <Button icon="brain" onClick={() => setDiagnosisOpen(true)}>
                  {repair.diagnosis ? "Update diagnosis" : "Add diagnosis"}
                </Button>
              ) : undefined
            }
          />
          {!repair.diagnosis ? (
            <EmptyState
              icon="brain"
              title="No diagnosis recorded"
              message="Inspect the device and record findings before recommending work."
            />
          ) : (
            <div className="diagnosis-card">
              <div className="diagnosis-head">
                <strong>Recommended: {repair.diagnosis.recommended}</strong>
                <span>
                  {db.users.find((user) => user.id === repair.diagnosis?.recordedByUserId)?.name ?? "Technician"}
                </span>
                <span>{formatDateTime(repair.diagnosis.recordedAt)}</span>
              </div>
              <p>{repair.diagnosis.findings}</p>
            </div>
          )}
        </Card>
      )}

      {tab === "Parts" && (
        <Card className="table-card">
          <div className="card-head table-title">
            <div>
              <h2>Parts used</h2>
              <p>Each line reduces branch stock and writes a stock movement.</p>
            </div>
            {can("repairs.add_parts") && (
              <Button icon="plus" onClick={() => setPartOpen(true)}>
                Add part
              </Button>
            )}
          </div>
          {parts.length === 0 ? (
            <EmptyState icon="package" title="No parts added" message="Parts fitted to this repair appear here." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>SKU</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit price</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <tr key={part.id}>
                    <td>
                      <strong>{part.name}</strong>
                    </td>
                    <td>{part.sku}</td>
                    <td className="num">{part.quantity}</td>
                    <td className="num">{formatMoney(part.unitPriceCents, symbol)}</td>
                    <td className="num">
                      <strong>{formatMoney(part.lineTotalCents, symbol)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="table-foot">
            <span>Parts total</span>
            <strong>{formatMoney(partsTotal, symbol)}</strong>
          </div>
        </Card>
      )}

      {tab === "Testing" && (
        <Card>
          <CardHead
            title="Testing checklist"
            subtitle={`${repair.testingChecklist.filter((item) => item.done).length} of ${repair.testingChecklist.length} complete`}
          />
          <div className="test-list">
            {repair.testingChecklist.map((item) => (
              <button
                key={item.id}
                type="button"
                className="check-label"
                onClick={() => {
                  if (!can("repairs.test")) {
                    pushToast("error", "You cannot update the test checklist.");
                    return;
                  }
                  const result = run((draft, actor) =>
                    toggleChecklistItem(
                      draft,
                      { repairId: repair.id, itemId: item.id, done: !item.done },
                      actor,
                    ),
                  );
                  if (!result.ok) pushToast("error", result.error);
                }}
              >
                <span className={`checkbox ${item.done ? "on" : ""}`}>
                  {item.done && <Icon name="check" size={12} />}
                </span>
                <span>{item.label}</span>
                <Badge tone={item.done ? "in-stock" : "slate"}>{item.done ? "Passed" : "Pending"}</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === "Timeline" && (
        <Card>
          <CardHead title="Repair timeline" subtitle="Every status change, note and part is recorded." />
          <div className="activity-log">
            {events.map((event) => (
              <div className="log-item" key={event.id}>
                <span className="dot" />
                <div>
                  <strong>{event.message}</strong>
                  <span>
                    {event.actorName} · {formatDateTime(event.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "Estimate & Invoice" && (
        <PlannedModule
          title="Estimate & invoice"
          phase={2}
          description="Estimates, customer approvals and invoicing are the next milestone after the core repair workflow."
        />
      )}

      <Modal
        open={overrideOpen}
        title="Approval required"
        subtitle={`Moving to ${statusLabel(statusDraft as RepairStatus)} normally needs a recorded customer decision.`}
        onClose={() => setOverrideOpen(false)}
        footer={
          <>
            <Button kind="secondary" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => submitStatus(overrideReason)}>Record exception & continue</Button>
          </>
        }
      >
        <p className="confirm-message">
          Record why you are overriding the policy. It is written to the audit trail.
        </p>
        <Field label="Reason for override" required>
          <TextArea
            value={overrideReason}
            onChange={setOverrideReason}
            rows={3}
            placeholder="Customer approved verbally at 14:20 on 2026-10-09."
          />
        </Field>
      </Modal>

      <Modal
        open={assignOpen}
        title="Assign technician"
        onClose={() => setAssignOpen(false)}
        footer={
          <>
            <Button kind="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              const result = run((draft, actor) =>
                assignTechnician(draft, repair.id, assignTo || undefined, actor),
              );
              setAssignOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", assignTo ? "Technician assigned." : "Technician unassigned.");
            }}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Technician" required>
          <Select
            value={assignTo}
            onChange={setAssignTo}
            options={[
              { value: "", label: "Unassigned" },
              ...technicians.map((user) => ({ value: user.id, label: user.name })),
            ]}
          />
        </Field>
      </Modal>

      <Modal
        open={diagnosisOpen}
        title="Record diagnosis"
        onClose={() => setDiagnosisOpen(false)}
        footer={
          <>
            <Button kind="secondary" onClick={() => setDiagnosisOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (!recommended || !diagnosisText.trim()) {
                pushToast("error", "Both the recommended action and findings are required.");
                return;
              }
              const result = run((draft, actor) =>
                recordDiagnosis(
                  draft,
                  { repairId: repair.id, findings: diagnosisText, recommended, technicianConfirmed: true },
                  actor,
                ),
              );
              setDiagnosisOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Diagnosis saved.");
            }}>
              Save diagnosis
            </Button>
          </>
        }
      >
        <Field label="Recommended action" required>
          <Select
            value={recommended}
            onChange={setRecommended}
            options={[
              { value: "", label: "Select…" },
              { value: "Replace battery and thermal service", label: "Replace battery and thermal service" },
              { value: "Component-level motherboard repair", label: "Component-level motherboard repair" },
              { value: "Data recovery only", label: "Data recovery only" },
              { value: "Software recovery", label: "Software recovery" },
              { value: "Beyond economical repair", label: "Beyond economical repair" },
            ]}
          />
        </Field>
        <Field label="Findings" required>
          <TextArea
            value={diagnosisText}
            onChange={setDiagnosisText}
            rows={4}
            placeholder="Measured results, faults identified and what still needs doing."
          />
        </Field>
      </Modal>

      <Modal
        open={partOpen}
        title="Add part"
        onClose={() => setPartOpen(false)}
        footer={
          <>
            <Button kind="secondary" onClick={() => setPartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              const result = run((draft, actor) =>
                addRepairPart(draft, { repairId: repair.id, productId: partId, quantity: partQty }, actor),
              );
              setPartOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Part added and stock reduced.");
            }}>
              Add part
            </Button>
          </>
        }
      >
        <Field label="Product" required>
          <Select
            value={partId}
            onChange={setPartId}
            options={db.products
              .filter((product) => product.isActive)
              .map((product) => {
                const balance = db.inventory.find(
                  (row) => row.productId === product.id && row.branchId === repair.branchId,
                );
                const available = balance ? availableStock(balance) : 0;
                return { value: product.id, label: `${product.name} — ${available} available` };
              })}
          />
        </Field>
        <Field label="Quantity" required>
          <TextInput
            value={String(partQty)}
            onChange={(value) => setPartQty(Number(value.replace(/\D/g, "")) || 1)}
            type="number"
          />
        </Field>
      </Modal>

      <Modal
        open={labourOpen}
        title="Set labour charge"
        onClose={() => setLabourOpen(false)}
        footer={
          <>
            <Button kind="secondary" onClick={() => setLabourOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              const result = run((draft, actor) =>
                setLabour(draft, { repairId: repair.id, labourCents: Math.round(Number(labourAmount || 0) * 100) }, actor),
              );
              setLabourOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Labour charge saved.");
            }}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Labour amount" required>
          <TextInput value={labourAmount} onChange={setLabourAmount} type="number" placeholder="0.00" />
        </Field>
      </Modal>

      <Modal
        open={noteOpen}
        title="Add note"
        onClose={() => setNoteOpen(false)}
        footer={
          <>
            <Button kind="secondary" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (!noteText.trim()) {
                pushToast("error", "Write something first.");
                return;
              }
              const result = run((draft, actor) =>
                addRepairNote(
                  draft,
                  {
                    repairId: repair.id,
                    message: noteText,
                    visibility: notePublic ? "customer" : "internal",
                  },
                  actor,
                ),
              );
              setNoteOpen(false);
              setNoteText("");
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Note added.");
            }}>
              Add note
            </Button>
          </>
        }
      >
        <Field label="Note" required>
          <TextArea value={noteText} onChange={setNoteText} rows={4} />
        </Field>
        <button type="button" className="check-label" onClick={() => setNotePublic(!notePublic)}>
          <span className={`checkbox ${notePublic ? "on" : ""}`}>
            {notePublic && <Icon name="check" size={12} />}
          </span>
          Show to customer in the portal
        </button>
      </Modal>
    </>
  );
}
