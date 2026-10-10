import { useMemo } from "react";
import { useDatabase, useSession } from "../../app/store";
import { inBranchScope, scopeFor } from "../../domain/permissions";
import type { RepairJob } from "../../domain/types";

/**
 * Repairs visible to the signed-in user.
 *
 * Branch, technician and customer scoping happens once here so every repairs
 * screen shows the same records. This is the read-side counterpart to the
 * permission checks inside the repair service.
 */
export function useScopedRepairs(): RepairJob[] {
  const db = useDatabase();
  const session = useSession();
  const scope = scopeFor(session);

  return useMemo(
    () =>
      db.repairs.filter((repair) => {
        if (!inBranchScope(scope, repair.branchId)) return false;
        if (scope.technicianId && repair.technicianId !== scope.technicianId) return false;
        if (scope.customerId && repair.customerId !== scope.customerId) return false;
        return true;
      }),
    [db.repairs, scope],
  );
}

export function matchesRepairSearch(repair: RepairJob, term: string): boolean {
  if (!term) return true;
  const haystack = [
    repair.number,
    repair.customerName,
    repair.customerPhone,
    repair.device.brand,
    repair.device.model,
    repair.device.serial ?? "",
    repair.technicianName ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

export const PRIORITY_TONE: Record<string, string> = {
  urgent: "low-stock",
  high: "low-stock",
  normal: "in-stock",
  low: "slate",
};
