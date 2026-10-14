import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Export all callable functions
export * from "./auth.js";
export * from "./repairs.js";
export * from "./inventory.js";
export * from "./sales.js";
export * from "./billing.js";
export * from "./purchasing.js";
export * from "./ai.js";
export * from "./notifications.js";
export * from "./reports.js";

// Export triggers
export { onStockChange, onSaleCreated, onPaymentCreated, onExpenseCreated, onRepairChange, onInvoiceChange } from "./triggers.js";
export { scheduledNightlyRollup } from "./triggers.js";

// Re-export types for clients
export type { Claims } from "./types.js";