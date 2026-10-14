import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, CallContext, ErrorCode, throwError, serverTimestamp } from "./types.js";

function getContext(auth: any): CallContext {
  if (!auth) throwError(ErrorCode.UNAUTHENTICATED, "You must be signed in");
  const claims = (auth.token ?? {}) as any;
  return {
    uid: auth.uid,
    claims,
    isAdmin: claims.role === "admin",
    isStaff: ["admin", "manager", "technician", "cashier"].includes(claims.role),
    isCustomer: claims.role === "customer",
    isTechnician: claims.role === "technician",
    isManager: claims.role === "manager",
    isCashier: claims.role === "cashier",
    branchId: claims.branchId,
    customerId: claims.customerId,
    technicianId: claims.technicianId,
  };
}

/** Mark notification as read. */
export const markNotificationRead = onCall(async (request) => {
  const context = getContext(request.auth);
  const { notificationId } = request.data as { notificationId: string };

  if (!notificationId) throwError(ErrorCode.INVALID_ARGUMENT, "Notification ID required");

  const notifRef = db.collection("notifications").doc(context.uid).collection("items").doc(notificationId);
  const snap = await notifRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Notification not found");

  await notifRef.update({ readAt: serverTimestamp() });
  return { ok: true };
});

/** Mark all notifications as read. */
export const markAllNotificationsRead = onCall(async (request) => {
  const context = getContext(request.auth);

  const snap = await db.collection("notifications").doc(context.uid).collection("items")
    .where("readAt", "==", null)
    .limit(500)
    .get();

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { readAt: serverTimestamp() }));
  await batch.commit();

  return { ok: true, count: snap.docs.length };
});

/** Get unread count. */
export const getUnreadCount = onCall(async (request) => {
  const context = getContext(request.auth);

  const snap = await db.collection("notifications").doc(context.uid).collection("items")
    .where("readAt", "==", null)
    .count()
    .get();

  return { ok: true, count: snap.data().count };
});

/** Send a custom notification (admin/manager only). */
export const sendNotification = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!["admin", "manager"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only admins and managers can send notifications");

  const { userId, role, branchId, title, body, type, link } = request.data as {
    userId?: string;
    role?: "admin" | "manager" | "technician" | "cashier" | "customer";
    branchId?: string;
    title: string;
    body: string;
    type: string;
    link?: { route: string; id?: string };
  };

  if (!title || !body) throwError(ErrorCode.INVALID_ARGUMENT, "Title and body required");

  const batch = db.batch();

  if (userId) {
    const notifRef = db.collection("notifications").doc(userId).collection("items").doc();
    batch.set(notifRef, {
      type: type as any,
      title,
      body,
      audience: { userId },
      link: link ?? null,
      createdAt: serverTimestamp(),
    });
  } else if (role && branchId) {
    const usersSnap = await db.collection("users")
      .where("role", "==", role)
      .where("branchId", "==", branchId)
      .where("isActive", "==", true)
      .get();

    usersSnap.docs.forEach((doc) => {
      const notifRef = db.collection("notifications").doc(doc.id).collection("items").doc();
      batch.set(notifRef, {
        type: type as any,
        title,
        body,
        audience: { userId: doc.id, role, branchId },
        link: link ?? null,
        createdAt: serverTimestamp(),
      });
    });
  } else if (role === "admin") {
    const usersSnap = await db.collection("users").where("role", "==", "admin").where("isActive", "==", true).get();
    usersSnap.docs.forEach((doc) => {
      const notifRef = db.collection("notifications").doc(doc.id).collection("items").doc();
      batch.set(notifRef, {
        type: type as any,
        title,
        body,
        audience: { userId: doc.id, role: "admin" },
        link: link ?? null,
        createdAt: serverTimestamp(),
      });
    });
  } else {
    throwError(ErrorCode.INVALID_ARGUMENT, "Must specify userId, or role+branchId, or role=admin");
  }

  await batch.commit();
  return { ok: true };
});