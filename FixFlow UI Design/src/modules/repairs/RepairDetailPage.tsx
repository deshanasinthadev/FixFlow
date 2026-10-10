import { useMemo, useState } from "react";
import { useActor, useCan, useDatabase, useStore } from "../../app/store";
import { navigate as go } from "../../app/router";
import { formatDateTime, formatMoney, formatShortDate, relativeTime } from "../../utils/format";
import {
  REPAIR_STATUSES,
  allowedTransitions,
  statusLabel,
  statusTone,
  transitionRequiresApproval,
  transitionLabel,
  TEST_TEMPLATES,
} from "../../domain/workflows";
import {
  assignTechnician,
  changeStatus,
  partsForRepair,
  eventsForRepair,
  recordDiagnosis,
  addRepairPart,
  setLabour,
  toggleChecklistItem,
  addRepairNote,
  startRepairWork,
} from "../../services/repairService";
import { inBranchScope, scopeFor } from "../../domain/permissions";
import { availableStock, repairTotalsCents } from "../../domain/calculations";
import type { RepairJob } from "../../domain/types";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PlannedModule,
  Select,
  Tabs,
  TextArea,
  TextInput,
} from "../../components/ui";
import { Icon } from "../../components/ui/Icon";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "parts", label: "Parts" },
  { id: "testing", label: "Testing" },
  { id: "timeline", label: "Timeline" },
  { id: "documents", label: "Estimate & Invoice" },
] as const;

export function RepairDetailPage({ repairId }: { repairId: string }) {
  const db = useDatabase();
  const actor = useActor();
  const can = useCan();
  const { run, pushToast, session } = useStore();
  const scope = scopeFor(session);

  const [tab, setTab] = useState("overview");
  const [statusDraft, setStatusDraft] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisText, setDiagnosisText] = useState("");
  const [recommended, setRecommended] = useState("");
  const [partOpen, setPartOpen] = useState(false);
  const [partId, setPartId] = useState("");
  const [partQty, setPartQty] = useState(1);
  const [labourOpen, setLabourOpen] = useState(false);
  const [labourDesc, setLabourDesc] = useState("");
  const [labourAmount, setLabourAmount] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePublic, setNotePublic] = useState(false);

  const repair = db.repairs.find((item) => item.id === repairId);
  const parts = useMemo(() => (repair ? partsForRepair(db, repair.id) : []), [db, repairId]);
  const events = useMemo(() => (repair ? eventsForRepair(db, repair.id) : []), [db, repairId]);
  const history = useMemo(
    () =>
      repair
        ? db.repairs
            .filter((item) => item.customerId === repair.customerId && item.id !== repair.id)
            .slice(0, 5)
        : [],
    [db.repairs, repairId],
  );

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

  const transitions = allowedTransitions(repair.status);
  const technicians = db.users.filter((user) => user.role === "technician" && user.isActive && user.branchId === repair.branchId);
  const totals = repairTotalsCents(repair);
  const symbol = db.business.currencySymbol;
  const branch = db.branches.find((item) => item.id === repair.branchId);

  const submitStatus = (overrideReasonValue?: string) => {
    const result = run((draft, act) =>
      changeStatus(
        draft,
        {
          repairId: repair.id,
          toStatus: pendingStatus as RepairJob["status"],
          note: overrideReasonValue,
          policyException: overrideReasonValue ? { granted: true, reason: overrideReasonValue } : undefined,
        },
        act,
      ),
    );
    setOverrideOpen(false);
    setOverrideReason("");
    setStatusDraft("");
    setPendingStatus("");
    if (!result.ok) {
      pushToast("error", result.error);
      return;
    }
    pushToast("success", `Status changed to ${statusLabel(pendingStatus as RepairJob["status"])}.`);
  };

  const requestStatusChange = () => {
    if (!statusDraft) return;
    if (transitionRequiresApproval(repair.status, statusDraft as RepairJob["status"])) {
      setPendingStatus(statusDraft);
      setOverrideOpen(true);
      return;
    }
    setPendingStatus(statusDraft);
    submitStatus();
  };

  return (
    <>
      <PageHeader
        title={`${repair.number}`}
        subtitle={`${repair.customerName} · ${repair.device.brand} ${repair.device.model} · ${branch?.name ?? "—"}`}
        back="/repairs"
        actions={
          <>
            {can("repairs.assign") && (
              <Button kind="secondary" icon="users" onClick={() => setAssignOpen(true)}>
                {repair.technicianName ? "Reassign" : "Assign"}
              </Button>
            )}
            {statusDraft && (
              <Button icon="check" onClick={requestStatusChange}>
                {transitionLabel(repair.status, statusDraft as RepairJob["status"])}
              </Button>
            )}
          </>
        }
      />

      <Card className="repair-hero">
        <div className="hero-device">
          <div className="kpi-icon purple">
            <Icon name="laptop" size={22} />
          </div>
          <div>
            <span className="job-id">{repair.number}</span>
            <h2>
              {repair.device.brand} {repair.device.model}
            </h2>
            <p>
              {repair.device.serial ? `Serial ${repair.device.serial} · ` : ""}
              {repair.complaint}
            </p>
          </div>
        </div>
        <div className="hero-status">
          <Badge tone={statusTone(repair.status)}>{statusLabel(repair.status)}</Badge>
          <span className={`priority ${repair.priority}`}>{repair.priority}</span>
          {repair.expectedAt && (
            <span className="due">
              Due {formatShortDate(repair.expectedAt)}
              {new Date(repair.expectedAt).getTime() < Date.now() && repair.status !== "delivered" ? " · Overdue" : ""}
            </span>
          )}
        </div>
        <div className="hero-actions">
          {transitions.length > 0 && can("repairs.transition") && (
            <div className="status-inline">
              <Select
                value={statusDraft}
                onChange={setStatusDraft}
                options={[{ value: "", label: "Change status…" }, ...transitions.map((status) => ({ value: status, label: transitionLabel(repair.status, status) }))]}
              />
            </div>
          )}
          <Button kind="secondary" onClick={() => setNoteOpen(true)}>
            Add note
          </Button>
        </div>
      </Card>

      <Tabs options={[...TABS]} value={tab} onChange={setTab} />

      {tab === "overview" && (
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
                <p>{repair.complaint}</p>
                <h3>Intake condition</h3>
                <p>{repair.intake.conditionNotes}</p>
                <h3>Accessories</h3>
                <p>{repair.intake.accessories}</p>
              </div>
            </Card>

            <Card>
              <CardHead title="Notes" subtitle={`${repair.notes.length} recorded`} />
              {repair.notes.length === 0 ? (
                <EmptyState icon="note" title="No notes yet" message="Add internal findings or customer-visible updates." />
              ) : (
                <div className="note-box">
                  {repair.notes.map((note) => (
                    <div className="note" key={note.id}>
                      <div className="note-head">
                        <strong>{note.authorName}</strong>
                        <span>{relativeTime(note.createdAt)}</span>
                        {note.isCustomerVisible && <Badge tone="in-stock">Customer visible</Badge>}
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
              <div className="info-list">
                <div>
                  <span>Total repairs</span>
                  <strong>{history.length + 1}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{repair.customerEmail ?? "—"}</strong>
                </div>
              </div>
              {history.length > 0 && (
                <div className="history-mini">
                  <h3>Previous repairs</h3>
                  {history.map((item) => (
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
                  <span>Paid</span>
                  <strong>{formatMoney(totals.paidCents, symbol)}</strong>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "diagnosis" && (
        <Card>
          <CardHead
            title="Diagnosis"
            subtitle="Technician findings and recommended work."
            action={
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
              action={
                can("repairs.diagnose") ? (
                  <Button icon="brain" onClick={() => setDiagnosisOpen(true)}>
                    Add diagnosis
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="diagnosis-card">
              <div className="diagnosis-head">
                <strong>Recommended: {repair.diagnosis.recommendedAction}</strong>
                <span>{repair.diagnosis.technicianName}</span>
                <span>{formatDateTime(repair.diagnosis.diagnosedAt)}</span>
              </div>
              <p>{repair.diagnosis.notes}</p>
            </div>
          )}

          {can("repairs.transition") && repair.status === "pending_diagnosis" && (
            <div className="form-actions">
              <Button
                onClick={() => {
                  const result = run((draft, act) => startRepairWork(draft, { repairId: repair.id }, act));
                  if (!result.ok) pushToast("error", result.error);
                  else pushToast("success", "Diagnosis started.");
                }}
              >
                Start diagnosis
              </Button>
            </div>
          )}
        </Card>
      )}

      {tab === "parts" && (
        <Card className="table-card">
          <div className="card-head table-title">
            <div>
              <h2>Parts used</h2>
              <p>Reserved from stock at the branch. Each line writes a stock movement.</p>
            </div>
            {can("repairs.addPart") && (
              <Button icon="plus" onClick={() => setPartOpen(true)}>
                Add part
              </Button>
            )}
          </div>
          {parts.length === 0 ? (
            <EmptyState icon="package" title="No parts added" message="Parts consumed by this repair will appear here." />
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
                      <strong>{part.productName}</strong>
                    </td>
                    <td>{part.sku ?? "—"}</td>
                    <td className="num">{part.quantity}</td>
                    <td className="num">{formatMoney(part.unitPriceCents, symbol)}</td>
                    <td className="num">
                      <strong>{formatMoney(part.unitPriceCents * part.quantity, symbol)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="table-foot">
            <span>Parts total</span>
            <strong>{formatMoney(totals.partsCents, symbol)}</strong>
          </div>
        </Card>
      )}

      {tab === "testing" && (
        <Card>
          <CardHead
            title="Testing"
            subtitle="Checklist items are derived from the device template and stored with the job."
          />
          <div className="test-list">
            {repair.testChecklist.map((item) => (
              <button
                key={item.id}
                type="button"
                className="check-label"
                onClick={() => {
                  const result = run((draft, act) =>
                    toggleChecklistItem(draft, { repairId: repair.id, itemId: item.id }, act),
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
          <p className="table-footnote">
            {TEST_TEMPLATES[repair.device.category]?.name ?? "General"} template ·{" "}
            {repair.testChecklist.filter((item) => item.done).length}/{repair.testChecklist.length} complete
          </p>
        </Card>
      )}

      {tab === "timeline" && (
        <Card>
          <CardHead title="Repair timeline" subtitle="Every status change, assignment and note is recorded." />
          <div className="timeline">
            {events.map((event) => (
              <div className="timeline-item" key={event.id}>
                <span className="dot" />
                <div>
                  <strong>{event.label}</strong>
                  <span>
                    {event.actorName} · {formatDateTime(event.at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "documents" && <PlannedModule title="Estimate & invoice" phase={2} />}

      <Modal open={overrideOpen} title="Approval required" onClose={() => setOverrideOpen(false)}>
        <p className="confirm-message">
          Moving this job to <strong>{statusLabel(pendingStatus as RepairJob["status"])}</strong> requires a customer
          decision in normal operation. Record the reason you are overriding the policy — it is written to the audit
          trail.
        </p>
        <Field label="Reason for override" required>
          <TextArea
            value={overrideReason}
            onChange={setOverrideReason}
            rows={3}
            placeholder="Customer approved verbally at 14:20 on 2026-10-09."
          />
        </Field>
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setOverrideOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!overrideReason.trim()) {
                pushToast("error", "A reason is required to override the policy.");
                return;
              }
              submitStatus(overrideReason);
            }}
          >
            Record exception & continue
          </Button>
        </div>
      </Modal>

      <Modal open={assignOpen} title="Assign technician" onClose={() => setAssignOpen(false)}>
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
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setAssignOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const result = run((draft, act) =>
                assignTechnician(draft, { repairId: repair.id, technicianId: assignTo }, act),
              );
              setAssignOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", assignTo ? "Technician assigned." : "Technician unassigned.");
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={diagnosisOpen} title="Record diagnosis" onClose={() => setDiagnosisOpen(false)}>
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
            placeholder="Measured results, faults identified, and what still needs doing."
          />
        </Field>
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setDiagnosisOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!recommended || !diagnosisText.trim()) {
                pushToast("error", "Both the recommended action and findings are required.");
                return;
              }
              const result = run((draft, act) =>
                recordDiagnosis(
                  draft,
                  { repairId: repair.id, notes: diagnosisText, recommendedAction: recommended },
                  act,
                ),
              );
              setDiagnosisOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Diagnosis saved.");
            }}
          >
            Save diagnosis
          </Button>
        </div>
      </Modal>

      <Modal open={partOpen} title="Add part" onClose={() => setPartOpen(false)}>
        <Field label="Product" required>
          <Select
            value={partId}
            onChange={setPartId}
            options={db.products.map((product) => {
              const balance = db.inventory.find(
                (row) => row.productId === product.id && row.branchId === repair.branchId,
              );
              const available = balance ? availableStock(balance) : 0;
              return {
                value: product.id,
                label: `${product.name} — ${available} available${product.isService ? " (service)" : ""}`,
              };
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
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setPartOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const result = run((draft, act) =>
                addRepairPart(draft, { repairId: repair.id, productId: partId, quantity: partQty }, act),
              );
              setPartOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Part added and stock reduced.");
            }}
          >
            Add part
          </Button>
        </div>
      </Modal>

      <Modal open={labourOpen} title="Set labour charge" onClose={() => setLabourOpen(false)}>
        <Field label="Description">
          <TextInput value={labourDesc} onChange={setLabourDesc} placeholder="Diagnostic + board-level repair" />
        </Field>
        <Field label="Amount" required>
          <TextInput value={labourAmount} onChange={setLabourAmount} type="number" placeholder="0.00" />
        </Field>
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setLabourOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const result = run((draft, act) =>
                setLabour(draft, { repairId: repair.id, description: labourDesc, amountCents: Math.round(Number(labourAmount || 0) * 100) }, act),
              );
              setLabourOpen(false);
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Labour charge saved.");
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={noteOpen} title="Add note" onClose={() => setNoteOpen(false)}>
        <Field label="Note" required>
          <TextArea value={noteText} onChange={setNoteText} rows={4} />
        </Field>
        <label className="check-label">
          <span className={`checkbox ${notePublic ? "on" : ""}`}>
            {notePublic && <Icon name="check" size={12} />}
          </span>
          <input type="checkbox" checked={notePublic} onChange={(event) => setNotePublic(event.target.checked)} hidden />
          Show to customer in the portal
        </label>
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setNoteOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!noteText.trim()) {
                pushToast("error", "Write something first.");
                return;
              }
              const result = run((draft, act) =>
                addRepairNote(draft, { repairId: repair.id, message: noteText, isCustomerVisible: notePublic }, act),
              );
              setNoteOpen(false);
              setNoteText("");
              if (!result.ok) pushToast("error", result.error);
              else pushToast("success", "Note added.");
            }}
          >
            Add note
          </Button>
        </div>
      </Modal>

      {can("repairs.setLabour") && (
        <ConfirmDialog
          open={false}
          title="Labour"
          message=""
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      )}
    </>
  );
}

export { REPAIR_STATUSES };
