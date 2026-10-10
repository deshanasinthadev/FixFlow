import { useMemo, useState } from "react";
import { useCan, useDatabase } from "../../app/store";
import { navigate as go } from "../../app/router";
import { REPAIR_STATUSES, statusLabel, statusTone } from "../../domain/workflows";
import { isDelayed } from "../../domain/calculations";
import { formatDateTime, formatShortDate, relativeTime } from "../../utils/format";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  useDebounced,
  usePaged,
} from "../../components/ui";
import { matchesRepairSearch, PRIORITY_TONE, useScopedRepairs } from "./shared";
import { Icon } from "../../components/ui/Icon";

export function RepairsPage() {
  const db = useDatabase();
  const can = useCan();
  const repairs = useScopedRepairs();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [technician, setTechnician] = useState("all");
  const debouncedSearch = useDebounced(search);

  const filtered = useMemo(
    () =>
      repairs
        .filter((repair) => (status === "all" ? true : repair.status === status))
        .filter((repair) => (priority === "all" ? true : repair.priority === priority))
        .filter((repair) => (technician === "all" ? true : repair.technicianId === technician))
        .filter((repair) => matchesRepairSearch(repair, debouncedSearch))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [repairs, status, priority, technician, debouncedSearch],
  );

  const paged = usePaged(filtered, 20);

  const counts = useMemo(
    () => ({
      total: filtered.length,
      active: filtered.filter((repair) => repair.status !== "delivered" && repair.status !== "cancelled").length,
      waiting: filtered.filter((repair) => repair.status === "waiting_parts" || repair.status === "waiting_approval").length,
      ready: filtered.filter((repair) => repair.status === "ready_for_collection").length,
      delayed: filtered.filter((repair) => isDelayed(repair)).length,
    }),
    [filtered],
  );

  const technicians = db.users.filter((user) => user.role === "technician" && user.isActive);

  return (
    <>
      <PageHeader
        title="Repairs"
        subtitle="Every repair job you are authorized to see, with status, ownership and due dates."
        actions={
          can("repairs.create") ? (
            <Button icon="plus" onClick={() => go("/repairs/new")}>
              New Repair
            </Button>
          ) : undefined
        }
      />

      <Card className="filter-card">
        <SearchInput value={search} onChange={setSearch} placeholder="Search repair no, customer, device or serial…" />
        <Select
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "Status: All" }, ...REPAIR_STATUSES.map((s) => ({ value: s.id, label: s.label }))]}
        />
        <Select
          value={priority}
          onChange={setPriority}
          options={[
            { value: "all", label: "Priority: All" },
            { value: "urgent", label: "Urgent" },
            { value: "high", label: "High" },
            { value: "normal", label: "Normal" },
            { value: "low", label: "Low" },
          ]}
        />
        {technicians.length > 0 && (
          <Select
            value={technician}
            onChange={setTechnician}
            options={[
              { value: "all", label: "Technician: All" },
              ...technicians.map((user) => ({ value: user.id, label: user.name })),
            ]}
          />
        )}
      </Card>

      <div className="summary-strip">
        <div>
          <span>Showing</span>
          <strong>{counts.total}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{counts.active}</strong>
        </div>
        <div>
          <span>Waiting</span>
          <strong>{counts.waiting}</strong>
        </div>
        <div>
          <span>Ready</span>
          <strong>{counts.ready}</strong>
        </div>
        <div>
          <span>Past due</span>
          <strong className={counts.delayed > 0 ? "danger-text" : ""}>{counts.delayed}</strong>
        </div>
      </div>

      <Card className="table-card">
        {filtered.length === 0 ? (
          <EmptyState
            icon="tool"
            title="No repairs match these filters"
            message="Clear the filters or create a new repair job."
            action={
              can("repairs.create") ? (
                <Button icon="plus" onClick={() => go("/repairs/new")}>
                  New Repair
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable
              rows={paged.rows}
              rowKey={(repair) => repair.id}
              onRowClick={(repair) => go(`/repairs/${repair.id}`)}
              columns={[
                {
                  key: "number",
                  header: "Repair",
                  render: (repair) => (
                    <>
                      <strong className="id-link">{repair.number}</strong>
                      <span className="row-sub">
                        Received {formatShortDate(repair.intake.receivedAt)}
                        {isDelayed(repair) && <em className="delayed-flag"> · Overdue</em>}
                      </span>
                    </>
                  ),
                },
                {
                  key: "device",
                  header: "Device",
                  render: (repair) => (
                    <>
                      <strong>
                        {repair.device.brand} {repair.device.model}
                      </strong>
                      <span className="row-sub">{repair.device.serial ?? "No serial"}</span>
                    </>
                  ),
                },
                {
                  key: "customer",
                  header: "Customer",
                  render: (repair) => (
                    <>
                      <strong>{repair.customerName}</strong>
                      <span className="row-sub">{repair.customerPhone}</span>
                    </>
                  ),
                },
                {
                  key: "technician",
                  header: "Technician",
                  render: (repair) => (
                    <span className="tech">
                      <span>{repair.technicianName ? repair.technicianName.split(" ").map((p) => p[0]).join("") : "—"}</span>
                      {repair.technicianName ?? "Unassigned"}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (repair) => <Badge tone={statusTone(repair.status)}>{statusLabel(repair.status)}</Badge>,
                },
                {
                  key: "priority",
                  header: "Priority",
                  render: (repair) => <span className={`priority ${repair.priority}`}>{repair.priority}</span>,
                },
                {
                  key: "eta",
                  header: "Due",
                  align: "right",
                  render: (repair) => (
                    <>
                      <strong>{repair.expectedAt ? formatShortDate(repair.expectedAt) : "—"}</strong>
                      <span className="row-sub">{relativeTime(repair.updatedAt)}</span>
                    </>
                  ),
                },
              ]}
            />
            <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} />
          </>
        )}
      </Card>

      <p className="table-footnote">
        Showing {filtered.length} authorized repair{filtered.length === 1 ? "" : "s"} · Last updated{" "}
        {formatDateTime(new Date())}
      </p>
    </>
  );
}

/** Badge helper exported for the board and detail pages. */
export function RepairPriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority ${priority}`}>{priority}</span>;
}

export { PRIORITY_TONE, Icon };
