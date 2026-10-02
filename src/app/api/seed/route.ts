import { NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";

export async function POST() {
  try {
    const existing = await db.select().from(s.products).limit(1);
    if (existing.length > 0) return NextResponse.json({ ok: true, message: "Already seeded" });

    await db.insert(s.users).values([
      { name: "Admin Fernando", email: "admin@fixflow.lk", phone: "0771234567", role: "Admin", completedJobs: 0, activeJobs: 0, revenue: "452000", rating: "5" },
      { name: "Nimal Perera", email: "nimal@fixflow.lk", phone: "0712345678", role: "Technician", completedJobs: 142, activeJobs: 6, revenue: "286500", rating: "4.8" },
      { name: "Sanduni Silva", email: "sanduni@fixflow.lk", phone: "0763456789", role: "Technician", completedJobs: 118, activeJobs: 5, revenue: "231200", rating: "4.7" },
      { name: "Kasun Bandara", email: "kasun@fixflow.lk", phone: "0754567890", role: "Technician", completedJobs: 96, activeJobs: 4, revenue: "198400", rating: "4.6" },
      { name: "Priya Jayawardena", email: "priya@fixflow.lk", phone: "0775678901", role: "Cashier", completedJobs: 0, activeJobs: 0, revenue: "0", rating: "4.9" },
      { name: "Ruwan Mendis", email: "ruwan@fixflow.lk", phone: "0726789012", role: "Inventory Manager", completedJobs: 0, activeJobs: 0, revenue: "0", rating: "4.5" },
    ]);

    await db.insert(s.customers).values([
      { name: "Kasun Rathnayake", phone: "0771112233", email: "kasun.r@gmail.com", address: "45 Galle Road, Colombo 03", totalSpent: "68500", outstanding: "4500", repairsCount: 4, purchasesCount: 6 },
      { name: "Nadeesha Fernando", phone: "0712223344", email: "nadeesha.f@gmail.com", address: "12 Kandy Road, Kadawatha", totalSpent: "42300", outstanding: "0", repairsCount: 2, purchasesCount: 3 },
      { name: "Mohamed Rizvi", phone: "0753334455", email: "rizvi.m@gmail.com", address: "78 Main Street, Negombo", totalSpent: "91200", outstanding: "8500", repairsCount: 6, purchasesCount: 9 },
      { name: "Anoma Dissanayake", phone: "0764445566", email: "anoma.d@gmail.com", address: "23 Temple Road, Nugegoda", totalSpent: "28750", outstanding: "0", repairsCount: 1, purchasesCount: 2 },
      { name: "Tharindu Lakmal", phone: "0775556677", email: "tharindu.l@gmail.com", address: "9 Lake View, Kandy", totalSpent: "156800", outstanding: "5500", repairsCount: 8, purchasesCount: 12 },
      { name: "Shalini Peiris", phone: "0726667788", email: "shalini.p@gmail.com", address: "56 Beach Road, Mount Lavinia", totalSpent: "35400", outstanding: "0", repairsCount: 3, purchasesCount: 4 },
    ]);

    await db.insert(s.suppliers).values([
      { name: "TechParts Lanka", contact: "Suresh Kumar", email: "sales@techparts.lk", phone: "0112345678", address: "Unity Plaza, Colombo 04", outstanding: "45000", totalPurchases: "856000" },
      { name: "NanoTek Distributors", contact: "Amal Jayasuriya", email: "orders@nanotek.lk", phone: "0113456789", address: "Liberty Plaza, Colombo 03", outstanding: "18500", totalPurchases: "432500" },
      { name: "MobileCare Wholesale", contact: "Fahad Ali", email: "info@mobilecare.lk", phone: "0114567890", address: "First Cross Street, Colombo 11", outstanding: "0", totalPurchases: "298000" },
    ]);

    const prods = [
      { name: "RAM 8GB DDR4 3200MHz", sku: "RAM-8G-D4", barcode: "4790011000011", category: "RAM", brand: "Kingston", costPrice: "6800", sellingPrice: "8500", stock: 2, minStock: 10, warrantyPeriod: "1 Year", description: "DDR4 SODIMM laptop memory" },
      { name: "SSD 256GB NVMe", sku: "SSD-256-NV", barcode: "4790011000028", category: "Storage", brand: "Samsung", costPrice: "9400", sellingPrice: "12500", stock: 3, minStock: 8, warrantyPeriod: "3 Years", description: "NVMe M.2 solid state drive" },
      { name: "Laptop Charger 65W Universal", sku: "CHR-65W-U", barcode: "4790011000035", category: "Chargers", brand: "Dell", costPrice: "3200", sellingPrice: "4500", stock: 0, minStock: 6, warrantyPeriod: "6 Months", description: "Universal laptop adapter" },
      { name: "iPhone 13 Display Assembly", sku: "DSP-IP13-O", barcode: "4790011000042", category: "Displays", brand: "Apple", costPrice: "18500", sellingPrice: "24500", stock: 5, minStock: 3, warrantyPeriod: "3 Months", description: "OLED display with digitizer" },
      { name: "Laptop Battery Dell 7490", sku: "BAT-D7490", barcode: "4790011000059", category: "Batteries", brand: "Dell", costPrice: "7800", sellingPrice: "10500", stock: 7, minStock: 4, warrantyPeriod: "6 Months", description: "Original 60Wh battery" },
      { name: "USB-C Cable 100W Braided", sku: "CBL-USBC1", barcode: "4790011000066", category: "Cables", brand: "Anker", costPrice: "950", sellingPrice: "1800", stock: 45, minStock: 20, warrantyPeriod: "6 Months", description: "2m braided fast-charge cable" },
      { name: "RAM 16GB DDR5", sku: "RAM-16G-D5", barcode: "4790011000073", category: "RAM", brand: "Crucial", costPrice: "14500", sellingPrice: "18900", stock: 9, minStock: 5, warrantyPeriod: "1 Year", description: "DDR5 desktop memory" },
      { name: "SSD 1TB SATA", sku: "SSD-1T-ST", barcode: "4790011000080", category: "Storage", brand: "WD", costPrice: "16800", sellingPrice: "21500", stock: 12, minStock: 5, warrantyPeriod: "3 Years", description: "2.5 inch SATA SSD" },
      { name: "Wireless Mouse Pro", sku: "ACC-MS-PRO", barcode: "4790011000097", category: "Accessories", brand: "Logitech", costPrice: "2900", sellingPrice: "4200", stock: 28, minStock: 10, warrantyPeriod: "1 Year", description: "Ergonomic wireless mouse" },
      { name: "MacBook Screen 13\" M1", sku: "DSP-MB13M1", barcode: "4790011000103", category: "Displays", brand: "Apple", costPrice: "42000", sellingPrice: "55000", stock: 2, minStock: 2, warrantyPeriod: "3 Months", description: "Retina display assembly" },
      { name: "Thermal Paste Pro 4g", sku: "ACC-TP-4G", barcode: "4790011000110", category: "Accessories", brand: "Arctic", costPrice: "850", sellingPrice: "1500", stock: 60, minStock: 15, warrantyPeriod: "None", description: "High performance thermal compound" },
      { name: "Phone Battery A52", sku: "BAT-SM-A52", barcode: "4790011000127", category: "Batteries", brand: "Samsung", costPrice: "2400", sellingPrice: "3800", stock: 14, minStock: 6, warrantyPeriod: "3 Months", description: "4500mAh original battery" },
    ];
    for (const p of prods) await db.insert(s.products).values({ ...p, supplierName: "TechParts Lanka", supplierId: 1 });

    const now = Date.now();
    const day = 86400000;
    await db.insert(s.repairs).values([
      { jobId: "FF1024", customerId: 1, customerName: "Kasun Rathnayake", customerPhone: "0771112233", deviceType: "Laptop", brand: "Dell", model: "Latitude 7490", serial: "DL7490-X82K", issue: "Not powering on, no charging light. Customer reports sudden shutdown during work.", condition: "Good, minor scratches", accessories: "Charger", priority: "High", status: "Repairing", technicianId: 2, technicianName: "Nimal Perera", labourCost: "4500", partsCost: "8500", discount: "500", estimatedTotal: "12500", diagnosis: "DC jack failure + battery degraded to 62%. Recommend jack replacement and battery service.", dueDate: new Date(now + 2*day) },
      { jobId: "FF1025", customerId: 2, customerName: "Nadeesha Fernando", customerPhone: "0712223344", deviceType: "Phone", brand: "Apple", model: "iPhone 13", serial: "APL13-9912", issue: "Cracked screen, touch unresponsive on top area.", condition: "Cracked front glass", accessories: "None", priority: "Medium", status: "Quoted", technicianId: 3, technicianName: "Sanduni Silva", labourCost: "3500", partsCost: "24500", discount: "0", estimatedTotal: "28000", diagnosis: "Display assembly replacement required. OLED + digitizer.", dueDate: new Date(now + 1*day) },
      { jobId: "FF1026", customerId: 3, customerName: "Mohamed Rizvi", customerPhone: "0753334455", deviceType: "Laptop", brand: "HP", model: "Pavilion 15", serial: "HP15-5521", issue: "Overheating and slow performance, fan noise.", condition: "Good", accessories: "Charger, Bag", priority: "Medium", status: "Diagnosing", technicianId: 4, technicianName: "Kasun Bandara", labourCost: "2500", partsCost: "1500", discount: "0", estimatedTotal: "4000", dueDate: new Date(now + 3*day) },
      { jobId: "FF1027", customerId: 4, customerName: "Anoma Dissanayake", customerPhone: "0764445566", deviceType: "Desktop", brand: "Custom", model: "Ryzen 5 Build", serial: "CST-R5-101", issue: "No display output, beeping on startup.", condition: "Good", accessories: "None", priority: "Low", status: "Received", technicianName: "Unassigned", labourCost: "0", partsCost: "0", discount: "0", estimatedTotal: "0", dueDate: new Date(now + 4*day) },
      { jobId: "FF1028", customerId: 5, customerName: "Tharindu Lakmal", customerPhone: "0775556677", deviceType: "Laptop", brand: "Apple", model: "MacBook Air M1", serial: "MBA-M1-7734", issue: "Battery drains fast, only 2 hours backup.", condition: "Excellent", accessories: "Charger", priority: "High", status: "Testing", technicianId: 2, technicianName: "Nimal Perera", labourCost: "5000", partsCost: "0", discount: "0", estimatedTotal: "5000", diagnosis: "Battery cycle count 812. Calibration + SMC reset done. Testing backup.", dueDate: new Date(now + 1*day) },
      { jobId: "FF1029", customerId: 6, customerName: "Shalini Peiris", customerPhone: "0726667788", deviceType: "Phone", brand: "Samsung", model: "Galaxy A52", serial: "SMA52-3388", issue: "Charging port loose, intermittent charging.", condition: "Good", accessories: "None", priority: "Urgent", status: "Approved", technicianId: 3, technicianName: "Sanduni Silva", labourCost: "3000", partsCost: "1800", discount: "300", estimatedTotal: "4500", dueDate: new Date(now) },
      { jobId: "FF1030", customerId: 5, customerName: "Tharindu Lakmal", customerPhone: "0775556677", deviceType: "Laptop", brand: "Lenovo", model: "ThinkPad T480", serial: "LNV-T480-92", issue: "SSD upgrade + RAM upgrade request.", condition: "Good", accessories: "Charger", priority: "Low", status: "Ready", technicianId: 4, technicianName: "Kasun Bandara", labourCost: "2000", partsCost: "21000", discount: "1000", estimatedTotal: "22000", dueDate: new Date(now) },
      { jobId: "FF1031", customerId: 3, customerName: "Mohamed Rizvi", customerPhone: "0753334455", deviceType: "Tablet", brand: "Samsung", model: "Tab S7", serial: "TAB-S7-441", issue: "Screen flickering after drop.", condition: "Dented corner", accessories: "None", priority: "Medium", status: "Delivered", technicianId: 2, technicianName: "Nimal Perera", labourCost: "4000", partsCost: "12000", discount: "0", estimatedTotal: "16000", dueDate: new Date(now - 2*day) },
    ]);

    await db.insert(s.repairActivity).values([
      { repairId: 1, action: "Repair created", description: "Job FF1024 intake completed", user: "Priya Jayawardena" },
      { repairId: 1, action: "Technician assigned", description: "Assigned to Nimal Perera", user: "Admin Fernando" },
      { repairId: 1, action: "Diagnosis updated", description: "DC jack failure identified", user: "Nimal Perera" },
      { repairId: 1, action: "Part added", description: "DC Jack + Battery service added", user: "Nimal Perera" },
      { repairId: 2, action: "Repair created", description: "Job FF1025 intake completed", user: "Priya Jayawardena" },
      { repairId: 2, action: "Quotation sent", description: "Rs. 28,000 sent via WhatsApp", user: "Sanduni Silva" },
    ]);

    await db.insert(s.quotations).values([
      { quoteId: "QT-2041", customerId: 2, customerName: "Nadeesha Fernando", repairId: 2, deviceInfo: "iPhone 13", problem: "Cracked screen replacement", items: [{ name: "iPhone 13 Display Assembly", qty: 1, price: 24500 }], labour: "3500", charges: "0", discount: "0", total: "28000", status: "Sent", validUntil: new Date(now + 7*day) },
      { quoteId: "QT-2042", customerId: 6, customerName: "Shalini Peiris", repairId: 6, deviceInfo: "Galaxy A52", problem: "Charging port replacement", items: [{ name: "Charging flex", qty: 1, price: 1800 }], labour: "3000", charges: "0", discount: "300", total: "4500", status: "Approved", validUntil: new Date(now + 5*day) },
      { quoteId: "QT-2043", customerId: 5, customerName: "Tharindu Lakmal", repairId: 7, deviceInfo: "ThinkPad T480", problem: "SSD + RAM upgrade", items: [{ name: "SSD 1TB SATA", qty: 1, price: 21500 }], labour: "2000", charges: "0", discount: "1000", total: "22500", status: "Approved", validUntil: new Date(now + 3*day) },
    ]);

    await db.insert(s.invoices).values([
      { invoiceNo: "INV-8831", customerId: 1, customerName: "Kasun Rathnayake", repairId: 1, type: "Repair", items: [{ name: "DC Jack replacement", qty: 1, price: 8500 }, { name: "Labour", qty: 1, price: 4500 }], subtotal: "13000", discount: "500", tax: "0", total: "12500", paid: "8000", balance: "4500", paymentMethod: "Cash", status: "Partial", date: new Date(now - 1*day) },
      { invoiceNo: "INV-8832", customerId: 3, customerName: "Mohamed Rizvi", type: "Sale", items: [{ name: "USB-C Cable 100W", qty: 2, price: 1800 }, { name: "Wireless Mouse Pro", qty: 1, price: 4200 }], subtotal: "7800", discount: "300", tax: "0", total: "7500", paid: "7500", balance: "0", paymentMethod: "Card", status: "Paid" },
      { invoiceNo: "INV-8833", customerId: 5, customerName: "Tharindu Lakmal", repairId: 7, type: "Repair", items: [{ name: "SSD 1TB SATA", qty: 1, price: 21500 }, { name: "Labour", qty: 1, price: 2000 }], subtotal: "23500", discount: "1000", tax: "0", total: "22500", paid: "17000", balance: "5500", paymentMethod: "Bank Transfer", status: "Partial" },
      { invoiceNo: "INV-8834", customerId: 2, customerName: "Nadeesha Fernando", type: "Sale", items: [{ name: "Thermal Paste Pro 4g", qty: 1, price: 1500 }], subtotal: "1500", discount: "0", tax: "0", total: "1500", paid: "1500", balance: "0", paymentMethod: "Cash", status: "Paid", date: new Date(now - 2*day) },
      { invoiceNo: "INV-8835", customerId: 3, customerName: "Mohamed Rizvi", repairId: 8, type: "Repair", items: [{ name: "Tab S7 display service", qty: 1, price: 16000 }], subtotal: "16000", discount: "0", tax: "0", total: "16000", paid: "7500", balance: "8500", paymentMethod: "Online Payment", status: "Pending" },
    ]);

    await db.insert(s.payments).values([
      { paymentId: "PAY-5101", invoiceId: 1, invoiceNo: "INV-8831", customerId: 1, customerName: "Kasun Rathnayake", amount: "8000", method: "Cash", status: "Completed" },
      { paymentId: "PAY-5102", invoiceId: 2, invoiceNo: "INV-8832", customerId: 3, customerName: "Mohamed Rizvi", amount: "7500", method: "Card", status: "Completed" },
      { paymentId: "PAY-5103", invoiceId: 3, invoiceNo: "INV-8833", customerId: 5, customerName: "Tharindu Lakmal", amount: "17000", method: "Bank Transfer", status: "Completed" },
    ]);

    await db.insert(s.expenses).values([
      { expenseId: "EXP-3101", category: "Rent", description: "October shop rent — Unity Plaza branch", amount: "85000", method: "Bank Transfer", addedBy: "Admin Fernando" },
      { expenseId: "EXP-3102", category: "Electricity", description: "CEB bill September", amount: "12800", method: "Online Payment", addedBy: "Admin Fernando" },
      { expenseId: "EXP-3103", category: "Internet", description: "Fiber connection monthly", amount: "5900", method: "Online Payment", addedBy: "Admin Fernando" },
      { expenseId: "EXP-3104", category: "Parts", description: "Emergency display purchase — iPhone 13", amount: "18500", method: "Cash", addedBy: "Ruwan Mendis" },
      { expenseId: "EXP-3105", category: "Salaries", description: "Technician advance — Nimal", amount: "20000", method: "Cash", addedBy: "Admin Fernando" },
      { expenseId: "EXP-3106", category: "Transport", description: "Courier + pickup fuel", amount: "7800", method: "Cash", addedBy: "Priya Jayawardena" },
    ]);

    await db.insert(s.warranties).values([
      { warrantyId: "WRT-901", customerId: 1, customerName: "Kasun Rathnayake", productName: "Dell Latitude 7490 — DC Jack Service", deviceInfo: "Dell Latitude 7490", invoiceId: 1, invoiceNo: "INV-8831", period: "3 Months", startDate: new Date(now - 10*day), expiryDate: new Date(now + 80*day), status: "Active" },
      { warrantyId: "WRT-902", customerId: 5, customerName: "Tharindu Lakmal", productName: "SSD 1TB SATA", deviceInfo: "ThinkPad T480", invoiceId: 3, invoiceNo: "INV-8833", period: "3 Years", startDate: new Date(now - 5*day), expiryDate: new Date(now + 1090*day), status: "Active" },
      { warrantyId: "WRT-903", customerId: 3, customerName: "Mohamed Rizvi", productName: "Tab S7 Display Service", deviceInfo: "Galaxy Tab S7", invoiceId: 5, invoiceNo: "INV-8835", period: "3 Months", startDate: new Date(now - 80*day), expiryDate: new Date(now + 10*day), status: "Active" },
    ]);

    await db.insert(s.warrantyClaims).values([
      { claimId: "CLM-301", warrantyId: 3, customerId: 3, customerName: "Mohamed Rizvi", issue: "Flickering returned after 2 months", diagnosis: "Flex cable seating issue suspected", status: "Under Review" },
    ]);

    await db.insert(s.purchases).values([
      { purchaseId: "PO-4401", supplierId: 1, supplierName: "TechParts Lanka", items: [{ name: "RAM 8GB DDR4", qty: 20, price: 6800 }], total: "136000", paymentStatus: "Partial", status: "Received" },
      { purchaseId: "PO-4402", supplierId: 2, supplierName: "NanoTek Distributors", items: [{ name: "SSD 256GB NVMe", qty: 15, price: 9400 }], total: "141000", paymentStatus: "Pending", status: "Ordered" },
    ]);

    await db.insert(s.stockMovements).values([
      { productId: 1, productName: "RAM 8GB DDR4 3200MHz", type: "Sale", qty: -3, reference: "INV-8830", user: "Priya Jayawardena" },
      { productId: 2, productName: "SSD 256GB NVMe", type: "Sale", qty: -2, reference: "INV-8829", user: "Priya Jayawardena" },
      { productId: 6, productName: "USB-C Cable 100W Braided", type: "Sale", qty: -2, reference: "INV-8832", user: "Priya Jayawardena" },
      { productId: 1, productName: "RAM 8GB DDR4 3200MHz", type: "Purchase", qty: 20, reference: "PO-4401", user: "Ruwan Mendis" },
      { productId: 8, productName: "SSD 1TB SATA", type: "Repair Usage", qty: -1, reference: "FF1030", user: "Kasun Bandara" },
    ]);

    await db.insert(s.notifications).values([
      { title: "Repair completed", message: "FF1030 ThinkPad T480 is ready for collection", type: "repair" },
      { title: "Low stock alert", message: "RAM 8GB DDR4 — only 2 remaining", type: "stock" },
      { title: "Payment received", message: "Rs. 17,000 received for INV-8833", type: "payment" },
      { title: "New quotation", message: "QT-2041 sent to Nadeesha Fernando", type: "quote" },
      { title: "Warranty expiring", message: "WRT-903 expires in 10 days", type: "warranty" },
      { title: "Out of stock", message: "Laptop Charger 65W is out of stock", type: "stock" },
    ]);

    await db.insert(s.messages).values([
      { customerId: 2, customerName: "Nadeesha Fernando", channel: "WhatsApp", template: "Quotation Ready", subject: "Quotation QT-2041", body: "Hello Nadeesha, your quotation QT-2041 for iPhone 13 display (Rs. 28,000) is ready. Valid 7 days.", status: "Sent" },
      { customerId: 1, customerName: "Kasun Rathnayake", channel: "SMS", template: "Repair Received", subject: "Repair FF1024", body: "FixFlow: Your Dell Latitude 7490 (FF1024) has been received. We will update you shortly.", status: "Delivered" },
    ]);

    await db.insert(s.auditLogs).values([
      { user: "Admin Fernando", action: "Created invoice", module: "Invoices", description: "INV-8833 created for Tharindu Lakmal — Rs. 22,500" },
      { user: "Priya Jayawardena", action: "Processed payment", module: "Payments", description: "PAY-5103 — Rs. 17,000 Bank Transfer" },
      { user: "Nimal Perera", action: "Updated repair", module: "Repairs", description: "FF1024 moved to Repairing" },
      { user: "Ruwan Mendis", action: "Inventory adjusted", module: "Inventory", description: "RAM 8GB purchase +20 (PO-4401)" },
      { user: "Sanduni Silva", action: "Sent quotation", module: "Quotations", description: "QT-2041 sent via WhatsApp" },
    ]);

    return NextResponse.json({ ok: true, message: "Seeded" });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
