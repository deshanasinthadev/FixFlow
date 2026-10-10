import { useMemo } from "react";
import { navigate as go } from "../../app/router";
import { REPAIR_STATUSES } from "../../domain/workflows";
import { isDelayed } from "../../domain/calculations";
import { formatShortDate } from "../../utils/format";
import { Badge, Card, EmptyState, PageHeader } from "../../components/ui";
import { useScopedRepairs } from "./shared";

/**
 * Kanban board. Columns come from the workflow definition and each card is
 * placed by its real status, so a column count always matches what you see.
 */
export function RepairBoardPage() {
  const repairs = useScopedRepairs();

  const columns = useMemo(
    () =>
      REPAIR_STATUSES.map((status) => ({
        status,
        cards: repairs
          .filter((repair) => repair.status === status.id)
          .sort((a, b) => new Date(a.expectedAt ?? a.createdAt).getTime() - new Date(b.expectedAt ?? b.createdAt).getTime()),
      })),
    [repairs],
  );

  const total = repairs.length;

  return (
    <>
      <PageHeader
        title="Repair Board"
        subtitle={`${total} authorized repair${total === 1 ? "" : "s"} across ${columns.filter((column) => column.cards.length > 0).length} active stages.`}
      />

      {total === 0 ? (
        <Card>
          <EmptyState icon="board" title="No repairs in your scope" message="Repairs assigned to you will appear here." />
        </Card>
      ) : (
        <div className="kanban">
          {columns.map((column) => (
            <div className="kanban-col" key={column.status.id}>
              <div className="kanban-head">
                <Badge tone={column.status.tone}>{column.status.label}</Badge>
                <span>{column.cards.length}</span>
              </div>
              {column.cards.length === 0 ? (
                <p className="kanban-empty">No jobs</p>
              ) : (
                column.cards.map((repair) => (
                  <Card className="repair-card" key={repair.id} >
                    <button type="button" className="repair-card-button" onClick={() => go(`/repairs/${repair.id}`)}>
                      <div>
                        <strong>{repair.number}</strong>
                        <span className={`priority ${repair.priority}`}>{repair.priority}</span>
                      </div>
                      <h3>
                        {repair.device.brand} {repair.device.model}
                      </h3>
                      <p>{repair.customerName}</p>
                      <div className="repair-card-foot">
                        <span className={isDelayed(repair) ? "danger-text" : ""}>
                          {repair.expectedAt ? formatShortDate(repair.expectedAt) : "No due date"}
                        </span>
                        <div className="avatar tiny">
                          {repair.technicianName ? repair.technicianName.split(" ").map((part) => part[0]).join("") : "—"}
                        </div>
                      </div>
                    </button>
                  </Card>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
