# FixFlow Environment Setup Guide

This guide covers all environment variables and secrets needed to deploy FixFlow to free-tier services.

## Overview

| Service | Purpose | Plan |
|---------|---------|------|
| Cloudflare Pages | Frontend hosting | Free |
| Cloudflare Workers | Serverless API | Free |
| Firebase Spark | Auth, Firestore, Storage | Free |

---

## 1. Cloudflare Pages Environment Variables

Set these in **Cloudflare Dashboard > Pages > fixflow > Settings > Environment variables**

### Production Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_FIREBASE_API_KEY` | `your-api-key` | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | `your-project-id` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `your-sender-id` | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | `your-app-id` | Firebase Web App ID |
| `VITE_API_BASE_URL` | `https://fixflow-api.your-subdomain.workers.dev` | Workers API Base URL |
| `VITE_USE_EMULATORS` | `false` | Disable emulators in production |

### Preview Environment Variables (optional)

Same as production but with preview-specific values if needed.

---

## 2. Cloudflare Workers Secrets

Set these in **Cloudflare Dashboard > Workers > fixflow-api > Settings > Variables & Secrets**

### Secrets (Encrypted)

| Secret | Value | Description |
|--------|-------|-------------|
| `FIREBASE_PROJECT_ID` | `your-project-id` | Firebase Project ID |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com` | Service Account Email |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` | Service Account Private Key (with literal `\n`) |
| `OPENAI_API_KEY` | `sk-...` | Optional: OpenAI API Key for AI features |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Optional: Anthropic API Key for AI features |

### Variables (Plain Text)

| Variable | Value |
|----------|-------|
| `FIREBASE_PROJECT_ID` | `your-project-id` |

---

## 3. Firebase Configuration

### Firebase Console Setup

1. **Create Project**: Go to [Firebase Console](https://console.firebase.google.com)
2. **Enable Authentication**:
   - Authentication > Sign-in method > Enable Email/Password
   - Optionally enable Google sign-in
3. **Create Firestore Database**:
   - Firestore Database > Create database > Start in production mode
   - Choose region closest to your users
4. **Enable Storage**:
   - Storage > Get started
5. **Create Web App**:
   - Project Settings > General > Your apps > Web app (</>)
   - Copy the config values for Cloudflare Pages variables

### Service Account for Workers

1. **Project Settings > Service accounts**
2. **Generate new private key**
3. **Save the JSON file securely**
4. Extract these values for Workers secrets:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

**Important**: The private key must preserve newlines. In Cloudflare Workers secrets, enter it with literal `\n` characters or use the dashboard's multi-line input.

### Firestore Security Rules

Deployed automatically via `firebase deploy --only firestore:rules`

The rules enforce RBAC based on custom claims:
- `admin`: Full access to all branches
- `manager`: Branch-scoped management access
- `technician`: Repair workflow access
- `cashier`: Sales/POS access
- `customer`: Read own data only

### Firestore Indexes

Deployed automatically via `firebase deploy --only firestore:indexes`

Required composite indexes for queries:
- Repairs by branch + status + createdAt
- Repairs by branch + technician + status
- Inventory by branch + category
- Sales by branch + createdAt
- Invoices by branch + status
- Stock movements by partId + createdAt
- AI diagnoses/chats by createdAt

---

## 4. Custom Claims Setup (Admin Roles)

After creating users in Firebase Auth, set their roles via custom claims:

### Using Firebase Admin SDK (Node.js)

```javascript
// Run this once per user to set their role
const admin = require('firebase-admin');
admin.initializeApp();

async function setUserRole(uid, role, branchId = null) {
  const claims = { role };
  if (branchId) claims.branchId = branchId;
  await admin.auth().setCustomUserClaims(uid, claims);
  console.log(`Set role ${role} for user ${uid}`);
}

// Examples:
// await setUserRole('uid123', 'admin');
// await setUserRole('uid456', 'manager', 'branch-001');
// await setUserRole('uid789', 'technician', 'branch-001');
```

### Using Firebase CLI

```bash
# Set admin role
firebase auth:custom-claims:set uid123 '{"role":"admin"}'

# Set manager role for branch
firebase auth:custom-claims:set uid456 '{"role":"manager","branchId":"branch-001"}'
```

### Available Roles

| Role | Description | Branch Scoped |
|------|-------------|---------------|
| `admin` | Full system access | No |
| `manager` | Branch management, reports, inventory | Yes |
| `technician` | Repair workflow, diagnostics | Yes |
| `cashier` | POS, sales, invoicing | Yes |
| `customer` | View own repairs/invoices | No |

---

## 5. Local Development Setup

### Frontend (.env.local)

```bash
# Firebase config (from Firebase Console > Web App)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# Local Workers dev server
VITE_API_BASE_URL=http://localhost:8787
VITE_USE_EMULATORS=true
```

### Workers (wrangler.toml)

```toml
[vars]
FIREBASE_PROJECT_ID = "your-project-id"

# Secrets set via: npx wrangler secret put SECRET_NAME
# FIREBASE_CLIENT_EMAIL
# FIREBASE_PRIVATE_KEY
# OPENAI_API_KEY (optional)
# ANTHROPIC_API_KEY (optional)
```

### Firebase Emulators

```bash
# Start emulators
cd backend
npx firebase emulators:start

# In another terminal, start frontend
cd "FixFlow UI Design"
npm run dev

# In another terminal, start workers
cd workers
npm run dev
```

---

## 6. AI Features Configuration

### Option A: OpenAI (Recommended for free tier)

1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add `OPENAI_API_KEY` to Workers secrets
3. Uses `gpt-4o-mini` (cost-effective)

### Option B: Anthropic

1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Add `ANTHROPIC_API_KEY` to Workers secrets
3. Uses `claude-3-haiku-20240307` (cost-effective)

### Without AI Keys

AI features will return configuration errors. The app works without AI - diagnosis and chat will show setup instructions.

---

## 7. Domain Configuration (Optional)

### Cloudflare Pages Custom Domain

1. Pages > fixflow > Custom domains > Set up a custom domain
2. Enter your domain (e.g., `fixflow.yourdomain.com`)
3. Follow DNS verification steps
4. SSL/TLS is automatic

### Workers Custom Domain

1. Workers > fixflow-api > Triggers > Custom domains
2. Add `api.yourdomain.com`
3. Update `VITE_API_BASE_URL` in Pages to `https://api.yourdomain.com`

---

## 8. Verification Checklist

After deployment, verify:

- [ ] Frontend loads at `https://fixflow.pages.dev` (or custom domain)
- [ ] Firebase Auth works (sign up/sign in)
- [ ] Repairs list loads (Firestore read)
- [ ] Create repair works (Firestore write)
- [ ] AI Diagnosis returns response (if API keys configured)
- [ ] Inventory management works
- [ ] Sales/POS works
- [ ] Reports generate data
- [ ] Role-based access works (test with different users)

---

## 9. Troubleshooting

### Frontend Build Fails
- Check Node.js version (18+ required)
- Clear node_modules and reinstall: `rm -rf node_modules && npm ci`
- Check for TypeScript errors: `npm run typecheck`

### Workers Deploy Fails
- Verify wrangler auth: `npx wrangler whoami`
- Check secrets are set: `npx wrangler secret list`
- Verify Firebase service account has Firestore permissions

### Firebase Permission Errors
- Check Firestore rules are deployed
- Verify user has correct custom claims
- Check browser console for detailed error messages

### AI Features Not Working
- Verify API keys are set in Workers secrets
- Check Workers logs: `npx wrangler tail`
- Free tier limits: 100k requests/day for Workers

---

## 10. Cost Monitoring

All services used are on free tiers with generous limits:

| Service | Free Tier Limits |
|---------|------------------|
| Cloudflare Pages | Unlimited requests, 500 builds/month |
| Cloudflare Workers | 100k requests/day, 10ms CPU |
| Firebase Auth | 10k MAU |
| Firestore | 50k reads/day, 20k writes/day, 1 GiB |
| Firebase Storage | 1 GB stored, 10 GB/month download |

Monitor usage in respective dashboards to stay within limits.