import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, auth, CallContext, Claims, ErrorCode, throwError, requireRole, serverTimestamp, getNextSequence, formatDocNumber, currentYear, requireBranchAccess } from "./types.js";

/** Extract and validate claims from the call context. */
function getContext(auth: any): CallContext {
  if (!auth) throwError(ErrorCode.UNAUTHENTICATED, "You must be signed in");
  const claims = (auth.token ?? {}) as Claims;
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

/** Create a new staff user (admin only). */
export const createStaffUser = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin");

  const { email, password, name, role, branchId, phone } = request.data as {
    email: string;
    password: string;
    name: string;
    role: Claims["role"];
    branchId: string;
    phone?: string;
  };

  if (!email || !password || !name || !role || !branchId) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Missing required fields");
  }
  if (!["admin", "manager", "technician", "cashier"].includes(role)) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Invalid role");
  }
  if (role !== "admin" && branchId === "all") {
    throwError(ErrorCode.INVALID_ARGUMENT, "Only admins can have 'all' branch access");
  }

  const userRecord = await auth.createUser({
    email,
    password,
    displayName: name,
    phoneNumber: phone,
    emailVerified: false,
  });

  const customClaims: Claims = {
    role,
    branchId,
    technicianId: role === "technician" ? userRecord.uid : undefined,
    customerId: undefined,
  };
  await auth.setCustomUserClaims(userRecord.uid, customClaims);

  const userDoc = {
    email,
    displayName: name,
    role,
    branchId,
    phone: phone ?? null,
    isActive: true,
    lastLoginAt: null,
    createdAt: serverTimestamp(),
  };
  await db.collection("users").doc(userRecord.uid).set(userDoc);

  await db.collection("audit_log").add({
    action: "user.create",
    actorUid: context.uid,
    actorName: context.claims.role === "admin" ? "Admin" : "Unknown",
    actorRole: context.claims.role,
    entityType: "user",
    entityId: userRecord.uid,
    branchId: branchId === "all" ? undefined : branchId,
    summary: `Created ${role} user: ${name} (${email})`,
    createdAt: serverTimestamp(),
  });

  return { ok: true, userId: userRecord.uid };
});

/** Update a user's role and branch (admin only). */
export const setUserRole = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin");

  const { userId, role, branchId } = request.data as {
    userId: string;
    role: Claims["role"];
    branchId: string;
  };

  if (!userId || !role || !branchId) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Missing required fields");
  }
  if (userId === context.uid) {
    throwError(ErrorCode.FAILED_PRECONDITION, "You cannot change your own role");
  }

  const customClaims: Claims = {
    role,
    branchId,
    technicianId: role === "technician" ? userId : undefined,
    customerId: role === "customer" ? userId : undefined,
  };
  await auth.setCustomUserClaims(userId, customClaims);

  await db.collection("users").doc(userId).update({
    role,
    branchId,
    updatedAt: serverTimestamp(),
  });

  await db.collection("audit_log").add({
    action: "user.role_change",
    actorUid: context.uid,
    actorName: "Admin",
    actorRole: "admin",
    entityType: "user",
    entityId: userId,
    branchId: branchId === "all" ? undefined : branchId,
    summary: `Changed role to ${role} and branch to ${branchId}`,
    changedFields: ["role", "branchId"],
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Deactivate a user (admin only). */
export const deactivateUser = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin");

  const { userId } = request.data as { userId: string };
  if (!userId) throwError(ErrorCode.INVALID_ARGUMENT, "Missing userId");
  if (userId === context.uid) throwError(ErrorCode.FAILED_PRECONDITION, "Cannot deactivate yourself");

  await auth.updateUser(userId, { disabled: true });
  await db.collection("users").doc(userId).update({ isActive: false, updatedAt: serverTimestamp() });

  await db.collection("audit_log").add({
    action: "user.role_change",
    actorUid: context.uid,
    actorName: "Admin",
    actorRole: "admin",
    entityType: "user",
    entityId: userId,
    summary: "Deactivated user",
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Create a customer with optional portal access. */
export const createCustomer = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager", "cashier");
  requireBranchAccess(context, request.data.branchId);

  const { name, phone, email, address, branchId, createPortalAccess, portalPassword } = request.data as {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    branchId: string;
    createPortalAccess?: boolean;
    portalPassword?: string;
  };

  if (!name || !phone || !branchId) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Name, phone, and branch are required");
  }

  let portalUserId: string | undefined;
  let portalEmail: string | undefined;

  if (createPortalAccess) {
    if (!email) throwError(ErrorCode.INVALID_ARGUMENT, "Email required for portal access");
    if (!portalPassword) throwError(ErrorCode.INVALID_ARGUMENT, "Portal password required");

    const userRecord = await auth.createUser({
      email,
      password: portalPassword,
      displayName: name,
      phoneNumber: phone,
      emailVerified: true,
    });

    const customClaims: Claims = {
      role: "customer",
      branchId,
      customerId: userRecord.uid,
    };
    await auth.setCustomUserClaims(userRecord.uid, customClaims);
    portalUserId = userRecord.uid;
    portalEmail = email;
  }

  const customerRef = db.collection("customers").doc();
  const customerId = customerRef.id;

  await customerRef.set({
    name,
    phone,
    email: email ?? null,
    address: address ?? null,
    homeBranchId: branchId,
    status: "active",
    emailNotifications: true,
    smsNotifications: true,
    registeredAt: serverTimestamp(),
    portalUserId: portalUserId ?? null,
    portalEmail: portalEmail ?? null,
    searchName: name.toLowerCase(),
    searchPhone: phone.replace(/\D/g, ""),
  });

  await db.collection("audit_log").add({
    action: "customer.create",
    actorUid: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    entityType: "customer",
    entityId: customerId,
    branchId,
    summary: `Created customer: ${name}`,
    createdAt: serverTimestamp(),
  });

  return { ok: true, customerId, portalUserId };
});

/** Get current user's profile with claims. */
export const getMyProfile = onCall(async (request) => {
  const context = getContext(request.auth);
  const userDoc = await db.collection("users").doc(context.uid).get();

  if (!userDoc.exists) {
    throwError(ErrorCode.NOT_FOUND, "User profile not found");
  }

  return {
    uid: context.uid,
    ...userDoc.data(),
    claims: context.claims,
  };
});

/** Force token refresh for the current user (after role change). */
export const refreshMyToken = onCall(async (request) => {
  const context = getContext(request.auth);
  return { ok: true, message: "Token refresh triggered. Call getIdTokenResult(true) on the client." };
});