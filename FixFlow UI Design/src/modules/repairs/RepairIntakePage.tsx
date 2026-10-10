import { useMemo, useState } from "react";
import { useDatabase, useSession, useStore } from "../../app/store";
import { navigate as go } from "../../app/router";
import { inBranchScope, scopeFor } from "../../domain/permissions";
import { DEVICE_CATEGORIES, PRIORITIES } from "../../domain/workflows";
import { createRepair } from "../../services/repairService";
import type { DeviceCategory, RepairPriority } from "../../domain/types";
import { Button, Card, Field, Select, TextArea, TextInput } from "../../components/ui";
import { PageHeader } from "../../components/layout/AppShell";
import { Icon } from "../../components/ui/Icon";

const STEPS = ["Customer", "Device", "Problem", "Review"] as const;

type Errors = Partial<Record<"name" | "phone" | "brand" | "model" | "complaint" | "branch", string>>;

export function RepairIntakePage() {
  const db = useDatabase();
  const session = useSession();
  const { run, pushToast } = useStore();
  const scope = scopeFor(session);

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [branchId, setBranchId] = useState(
    scope.branchId === "all" ? (db.branches[0]?.id ?? "") : scope.branchId,
  );
  const [category, setCategory] = useState<DeviceCategory>("laptop");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState("Good — minor wear");
  const [accessories, setAccessories] = useState("");
  const [complaint, setComplaint] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<RepairPriority>("normal");
  const [technicianId, setTechnicianId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");

  const branches = useMemo(() => db.branches.filter((branch) => branch.isActive && inBranchScope(scope, branch.id)), [db.branches, scope]);
  const technicians = useMemo(
    () => db.users.filter((user) => user.role === "technician" && user.isActive && user.branchId === branchId),
    [db.users, branchId],
  );
  const customers = useMemo(() => db.customers.slice().sort((a, b) => a.name.localeCompare(b.name)), [db.customers]);

  const applyCustomer = (id: string) => {
    setCustomerId(id);
    const customer = db.customers.find((item) => item.id === id);
    if (customer) {
      setName(customer.name);
      setPhone(customer.phone);
      setEmail(customer.email ?? "");
      setAddress(customer.address ?? "");
    }
  };

  const validateStep = (index: number): boolean => {
    const next: Errors = {};
    if (index === 0) {
      if (!name.trim()) next.name = "Customer name is required.";
      if (!phone.trim()) next.phone = "Phone number is required.";
      if (!branchId) next.branch = "Select a branch.";
    }
    if (index === 1) {
      if (!brand.trim()) next.brand = "Brand is required.";
      if (!model.trim()) next.model = "Model is required.";
    }
    if (index === 2 && !complaint.trim()) {
      next.complaint = "Describe the issue the customer reported.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const submit = () => {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) {
      setStep(0);
      pushToast("error", "Some required fields are missing.");
      return;
    }
    setSaving(true);
    const result = run((draft, actor) =>
      createRepair(
        draft,
        {
          branchId,
          customerId: customerId || undefined,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          customerAddress: address,
          category,
          brand,
          model,
          serial,
          condition,
          accessories,
          complaint,
          notes,
          priority,
          technicianId: technicianId || undefined,
          expectedAt: expectedAt ? new Date(`${expectedAt}T17:00:00`).toISOString() : undefined,
        },
        actor,
      ),
    );
    setSaving(false);
    if (!result.ok) {
      pushToast("error", result.error);
      return;
    }
    pushToast("success", `Repair ${result.value.number} created.`);
    go(`/repairs/${result.value.id}`);
  };

  return (
    <>
      <PageHeader
        title="New Repair"
        subtitle="Register a customer, device and reported fault. A unique job number is generated on save."
        actions={
          <Button kind="secondary" onClick={() => go("/repairs")}>
            Cancel
          </Button>
        }
      />

      <div className="form-layout">
        <Card className="step-card">
          <div className="steps">
            {STEPS.map((label, index) => (
              <div className={step === index ? "active" : step > index ? "done" : ""} key={label}>
                <span>{step > index ? <Icon name="check" size={14} /> : index + 1}</span>
                <div>
                  <strong>{label}</strong>
                  <small>Step {index + 1}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="form-card">
          <div className="form-title">
            <div className="kpi-icon purple">
              <Icon name={step === 0 ? "users" : step === 1 ? "laptop" : "tool"} />
            </div>
            <div>
              <h2>{STEPS[step]}</h2>
              <p>
                {step === 0 && "Select an existing customer or create a new one."}
                {step === 1 && "Identify the device being repaired."}
                {step === 2 && "Record what the customer reported and the device condition."}
                {step === 3 && "Set priority, assign a technician and confirm."}
              </p>
            </div>
          </div>

          {step === 0 && (
            <>
              <Field label="Existing customer" hint="Choosing a customer fills the fields below.">
                <Select
                  value={customerId}
                  onChange={applyCustomer}
                  options={[{ value: "", label: "New customer" }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.name} · ${customer.phone}` }))]}
                />
              </Field>
              <div className="form-grid">
                <Field label="Customer name" required error={errors.name}>
                  <TextInput value={name} onChange={setName} placeholder="Full name" />
                </Field>
                <Field label="Phone number" required error={errors.phone}>
                  <TextInput value={phone} onChange={setPhone} placeholder="+94 7X XXX XXXX" type="tel" />
                </Field>
                <Field label="Email">
                  <TextInput value={email} onChange={setEmail} placeholder="name@email.lk" type="email" />
                </Field>
                <Field label="Branch" required error={errors.branch}>
                  <Select
                    value={branchId}
                    onChange={setBranchId}
                    options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                  />
                </Field>
              </div>
              <Field label="Address">
                <TextInput value={address} onChange={setAddress} placeholder="Optional" />
              </Field>
            </>
          )}

          {step === 1 && (
            <div className="form-grid">
              <Field label="Device category">
                <Select
                  value={category}
                  onChange={(value) => setCategory(value as DeviceCategory)}
                  options={DEVICE_CATEGORIES.map((item) => ({ value: item.id, label: item.label }))}
                />
              </Field>
              <Field label="Serial / IMEI" hint="Used to look up previous repairs for this device.">
                <TextInput value={serial} onChange={setSerial} placeholder="Optional" />
              </Field>
              <Field label="Brand" required error={errors.brand}>
                <TextInput value={brand} onChange={setBrand} placeholder="Dell, Apple, HP…" />
              </Field>
              <Field label="Model" required error={errors.model}>
                <TextInput value={model} onChange={setModel} placeholder="Latitude 5420" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <>
              <Field label="Customer-reported issue" required error={errors.complaint}>
                <TextArea
                  value={complaint}
                  onChange={setComplaint}
                  rows={4}
                  placeholder="Describe the fault in the customer's own words."
                />
              </Field>
              <div className="form-grid">
                <Field label="Device condition">
                  <TextInput value={condition} onChange={setCondition} placeholder="Good — minor wear" />
                </Field>
                <Field label="Accessories received">
                  <TextInput value={accessories} onChange={setAccessories} placeholder="Charger, bag, SIM tray tool…" />
                </Field>
              </div>
              <Field label="Intake notes" hint="Internal notes are not shown to the customer.">
                <TextArea value={notes} onChange={setNotes} rows={3} placeholder="Optional" />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <div className="form-grid">
                <Field label="Priority">
                  <Select
                    value={priority}
                    onChange={(value) => setPriority(value as RepairPriority)}
                    options={PRIORITIES.map((item) => ({ value: item.id, label: item.label }))}
                  />
                </Field>
                <Field label="Assign technician" hint={technicians.length === 0 ? "No technicians at this branch." : undefined}>
                  <Select
                    value={technicianId}
                    onChange={setTechnicianId}
                    options={[{ value: "", label: "Unassigned" }, ...technicians.map((user) => ({ value: user.id, label: user.name }))]}
                  />
                </Field>
                <Field label="Expected completion">
                  <TextInput value={expectedAt} onChange={setExpectedAt} type="date" />
                </Field>
              </div>

              <div className="review-summary">
                <h3>Review</h3>
                <div>
                  <span>Customer</span>
                  <strong>
                    {name} · {phone}
                  </strong>
                </div>
                <div>
                  <span>Device</span>
                  <strong>
                    {brand} {model}
                    {serial ? ` · ${serial}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Issue</span>
                  <strong>{complaint}</strong>
                </div>
                <div>
                  <span>Branch</span>
                  <strong>{db.branches.find((branch) => branch.id === branchId)?.name}</strong>
                </div>
                <div>
                  <span>Priority</span>
                  <strong>{priority}</strong>
                </div>
              </div>
            </>
          )}

          <div className="form-actions">
            <Button kind="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>
                Continue <Icon name="arrow" size={15} />
              </Button>
            ) : (
              <Button onClick={submit} disabled={saving}>
                {saving ? "Creating…" : "Create repair"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
