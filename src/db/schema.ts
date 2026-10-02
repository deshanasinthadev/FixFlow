import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("technician"),
  avatar: text("avatar"),
  active: boolean("active").default(true),
  completedJobs: integer("completed_jobs").default(0),
  activeJobs: integer("active_jobs").default(0),
  revenue: numeric("revenue").default("0"),
  rating: numeric("rating").default("4.5"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  totalSpent: numeric("total_spent").default("0"),
  outstanding: numeric("outstanding").default("0"),
  repairsCount: integer("repairs_count").default(0),
  purchasesCount: integer("purchases_count").default(0),
  lastVisit: timestamp("last_visit").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  type: text("type"),
  brand: text("brand"),
  model: text("model"),
  serial: text("serial"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const repairs = pgTable("repairs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  deviceType: text("device_type"),
  brand: text("brand"),
  model: text("model"),
  serial: text("serial"),
  issue: text("issue"),
  condition: text("condition"),
  accessories: text("accessories"),
  priority: text("priority").default("Medium"),
  status: text("status").default("Received"),
  technicianId: integer("technician_id"),
  technicianName: text("technician_name"),
  labourCost: numeric("labour_cost").default("0"),
  partsCost: numeric("parts_cost").default("0"),
  discount: numeric("discount").default("0"),
  estimatedTotal: numeric("estimated_total").default("0"),
  diagnosis: text("diagnosis"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const repairParts = pgTable("repair_parts", {
  id: serial("id").primaryKey(),
  repairId: integer("repair_id"),
  productId: integer("product_id"),
  productName: text("product_name"),
  qty: integer("qty").default(1),
  cost: numeric("cost").default("0"),
  price: numeric("price").default("0"),
  warranty: text("warranty"),
});

export const repairActivity = pgTable("repair_activity", {
  id: serial("id").primaryKey(),
  repairId: integer("repair_id"),
  action: text("action"),
  description: text("description"),
  user: text("user"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quoteId: text("quote_id"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  repairId: integer("repair_id"),
  deviceInfo: text("device_info"),
  problem: text("problem"),
  items: jsonb("items"),
  labour: numeric("labour").default("0"),
  charges: numeric("charges").default("0"),
  discount: numeric("discount").default("0"),
  total: numeric("total").default("0"),
  status: text("status").default("Draft"),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  category: text("category"),
  brand: text("brand"),
  model: text("model"),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  costPrice: numeric("cost_price").default("0"),
  sellingPrice: numeric("selling_price").default("0"),
  stock: integer("stock").default(0),
  minStock: integer("min_stock").default(5),
  warrantyPeriod: text("warranty_period"),
  image: text("image"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id"),
  productName: text("product_name"),
  type: text("type"),
  qty: integer("qty"),
  reference: text("reference"),
  user: text("user"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  outstanding: numeric("outstanding").default("0"),
  totalPurchases: numeric("total_purchases").default("0"),
  lastPurchase: timestamp("last_purchase"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  purchaseId: text("purchase_id"),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  items: jsonb("items"),
  total: numeric("total").default("0"),
  paymentStatus: text("payment_status").default("Pending"),
  status: text("status").default("Draft"),
  date: timestamp("date").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  repairId: integer("repair_id"),
  type: text("type").default("Sale"),
  items: jsonb("items"),
  subtotal: numeric("subtotal").default("0"),
  discount: numeric("discount").default("0"),
  tax: numeric("tax").default("0"),
  total: numeric("total").default("0"),
  paid: numeric("paid").default("0"),
  balance: numeric("balance").default("0"),
  paymentMethod: text("payment_method"),
  status: text("status").default("Pending"),
  date: timestamp("date").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  paymentId: text("payment_id"),
  invoiceId: integer("invoice_id"),
  invoiceNo: text("invoice_no"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  amount: numeric("amount").default("0"),
  method: text("method"),
  status: text("status").default("Completed"),
  date: timestamp("date").defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  expenseId: text("expense_id"),
  category: text("category"),
  description: text("description"),
  amount: numeric("amount").default("0"),
  date: timestamp("date").defaultNow(),
  method: text("method"),
  addedBy: text("added_by"),
});

export const warranties = pgTable("warranties", {
  id: serial("id").primaryKey(),
  warrantyId: text("warranty_id"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  productName: text("product_name"),
  deviceInfo: text("device_info"),
  invoiceId: integer("invoice_id"),
  invoiceNo: text("invoice_no"),
  period: text("period"),
  startDate: timestamp("start_date").defaultNow(),
  expiryDate: timestamp("expiry_date"),
  status: text("status").default("Active"),
});

export const warrantyClaims = pgTable("warranty_claims", {
  id: serial("id").primaryKey(),
  claimId: text("claim_id"),
  warrantyId: integer("warranty_id"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  issue: text("issue"),
  diagnosis: text("diagnosis"),
  status: text("status").default("Submitted"),
  date: timestamp("date").defaultNow(),
});

export const returns = pgTable("returns_table", {
  id: serial("id").primaryKey(),
  returnId: text("return_id"),
  invoiceId: integer("invoice_id"),
  invoiceNo: text("invoice_no"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  type: text("type"),
  items: jsonb("items"),
  reason: text("reason"),
  condition: text("condition"),
  refundAmount: numeric("refund_amount").default("0"),
  method: text("method"),
  date: timestamp("date").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  channel: text("channel"),
  template: text("template"),
  subject: text("subject"),
  body: text("body"),
  status: text("status").default("Sent"),
  date: timestamp("date").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: text("title"),
  message: text("message"),
  type: text("type"),
  isRead: boolean("is_read").default(false),
  date: timestamp("date").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  user: text("user"),
  action: text("action"),
  module: text("module"),
  description: text("description"),
  date: timestamp("date").defaultNow(),
});
