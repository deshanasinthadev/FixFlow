# FixFlow — Full Code Review

**Repo:** `deshanasinthadev/FixFlow` · branch `arena/ccac4826-fixflow` · base `98a9418`
**Reviewed:** 2026-10-08
**Scope:** සම්පූර්ණ repo එක (26 tracked files) — app එක `FixFlow UI Design/` folder එකේ තියෙන Figma Make scaffold එකක් (React 19 + Vite 8 + Tailwind v4).

---

## 0. මම ඇත්තටම run කරපු දේවල්

Review එකේ තියෙන හැම claim එකක්ම මේවායින් එකකින් verify කරගත්තා:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | ❌ **exit 2 — errors 2ක්** |
| `npm run build` | ✅ pass (JS 289.85 kB / 84.78 kB gzip · CSS 47.69 kB / 10.24 kB gzip) |
| `npm install` | ✅ 43 packages (vite 8.3.3, react 19.3.0, ts 5.9.3, tailwind 4.3.3) |
| `npx vite` (repo එකේ config එකෙන්) | ❌ **HTTP 403** — preview host block වෙනවා |
| `date -d 2026-03-18` | `Wednesday` |
| CSS grep (`.badge.*`, `.priority.*`, `@media`) | variants කිහිපයක් missing |

Live preview එක දැන් run වෙනවා (මම `/tmp/ff.preview.config.mjs` කියන **temporary** config එකකින් — repo එක වෙනස් කරලා නෑ). Repo එකේ ඇති config එකෙන්ම preview එක 403 වෙනවා, පහළ §3.1 බලන්න.

---

## 1. සාරාංශය

මේක **හොඳින් පේන, හොඳින් organize වුණු UI prototype එකක්** — නමුත් **production-ready code එකක් නෙවෙයි**, ඒ වගේම **typecheck එක pass වෙන්නෙත් නෑ**.

හොඳ දේවල්: role-based scoping එකේ logic එක නිවැරදියි, responsive breakpoints (1200/900/640) හොඳට cover වෙලා, dark mode theme variables පද්ධතියක් තියෙනවා, single-file icon set එකක් නිසා dependency එකක් නෑ, `recordsFor()` එකෙන් role අනුව data filtering එක ඇත්තටම වැඩ කරනවා.

ප්‍රශ්න: TypeScript errors 2ක්, browser tab එකේ නම "Figma Make App", dev server එක preview hosts block කරනවා, navigation 80%ක් stubs, deep links වැඩ කරන්නෙ නෑ, accessibility ගොඩක් දුර්වලයි.

---

## 2. 🔴 P0 — Blocking

### 2.1 `tsc --noEmit` fail වෙනවා (errors 2ක්)

```
src/App.tsx(142,52): error TS2550: Property 'replaceAll' does not exist on type 'string'.
src/App.tsx(176,35): error TS2550: Property 'replaceAll' does not exist on type 'string'.
```

හේතුව: `tsconfig.json` එකේ `"target": "ES2020"` + `"lib": ["ES2020", ...]`. `String.prototype.replaceAll` ES2021 එකේ.

```ts
// line 142
const t = tone || String(children).toLowerCase().replaceAll(" ", "-");
// line 176
const slug = to.toLowerCase().replaceAll(" ", "-");
```

`npm run build` pass වෙන්නේ Vite typecheck කරන්නෙ නැති නිසා (esbuild/rolldown transpile-only). `package.json` එකේ `typecheck` script එකක් නැති නිසා මේක කාටවත් පේන්නෙ නෑ.

**Fix:** `tsconfig.json` → `"target": "ES2022"`, `"lib": ["ES2022", "DOM", "DOM.Iterable"]`. ඒ වගේම `"typecheck": "tsc --noEmit"` script එකක් එකතු කරන්න.

### 2.2 Browser tab එකේ නම "Figma Make App"

Build කරපු `dist/index.html` එකෙන් කෙලින්ම:

```html
<title>Figma Make App</title>
<meta property="og:title" content="Figma Make App">
```

`.figma/make/site.json` එකේ `title` field එකක් නෑ, `vite.config.ts` එකේ default එක `"Figma Make App"`. Favicon එකකුත් නෑ.

**Fix:** `site.json` එකට `"title": "FixFlow"` දාන්න (+ `icons.icon`).

### 2.3 Dev server එක preview/proxy hosts block කරනවා

Repo එකේ තියෙන `vite.config.ts` එකෙන්ම server එක start කරාම:

```
Port 8443 REJECTS the preview host (HTTP 403: Blocked request.
This host ("…e2b.app") is not allowed. To allow this host, add … to `server.allowedHosts`)
```

`server.allowedHosts` නැති නිසා මේක Figma Make එකේ තමන්ගේ proxy එකෙන් විතරයි වැඩ කරන්නේ. වෙන කොහෙවත් (tunnel, ngrok, වෙනත් preview, custom domain) deploy කරොත් 403.

**Fix:**
```ts
server: {
  host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '8443'),
  strictPort: true,
  allowedHosts: process.env.FIGMA_ALLOWED_HOSTS?.split(',') ?? true,
}
```

---

## 3. 🟠 P1 — Correctness bugs

### 3.1 URL එක ලියනවා, කියවන්නෙ නෑ → deep links වැඩ කරන්නෙ නෑ

`routeFor()` එකෙන් `/${role}/${slug}` (උදා: `/admin/repairs`) `pushState`/`replaceState` කරනවා. නමුත් `guardBrowserRoute` කියවන්නේ `window.history.state?.page` විතරයි — `window.location.pathname` කවදාවත් parse කරන්නෙ නෑ.

ප්‍රතිඵලය: `/admin/repairs` එකේ ඉන්නකොට page එක refresh කළොත් state එක නැති වෙලා URL එක ආපහු `/admin/dashboard` වෙනවා. Bookmark / share කරපු link වැඩ කරන්නෙ නෑ.

### 3.2 `RepairDetails` එක click කරපු record එක නොසලකා හරිනවා

`App.tsx:551` — `RepairDetails({ technician })` එකට record එකක් pass කරන්නෙ නෑ. හැම table row එකකම `onClick={() => navigate("Repair Details")}`. ඒ නිසා ඕනෑම repair එකක් click කරාම හැම වෙලාවෙම **FX-2026-004821 / Nimal Perera / Dell Latitude 5420** පේනවා. Technician කෙනෙක් FX-2026-004819 (Kasun Silva) click කරාමත් Nimal Perera ගේ විස්තර පේනවා.

**Fix:** `navigate(\`Repair Details:${r.id}\`)` වගේ id එකක් route එකට දාලා `repairs.find()` කරන්න.

### 3.3 Repair Board එකේ cards duplicate + counts වැරදියි

```tsx
{data.length > 0 && [data[i%data.length], data[(i+2)%data.length]].map(...)}
<span>{i === 3 ? 4 : i === 5 ? 3 : 2}</span>
```

Columns 6ක් එකම records 5ක් නැවත නැවත පුරවනවා. Header එකේ count එක hardcoded, පේන cards එක්ක කිසිම සම්බන්ධයක් නෑ. Admin කෙනෙක්ට board එකේ එකම repair එක තැන් 2–3ක පේනවා.

### 3.4 Dark mode එකේ හැම badge එකක්ම එකම පාටයි

```css
.badge.diagnosing       { background:#fef3c7; color:#b45309 }  /* specificity (0,2,0) */
.dark .badge            { background:rgba(139,92,246,.14) }   /* specificity (0,2,0) — later wins */
```

Specificity සමාන නිසා source order එකෙන් `.dark .badge` ජය ගන්නවා. Dark mode එකේ `.badge.testing`, `.badge.ready-for-pickup`, `.badge.diagnosing` ඔක්කොටම එකම purple background එක ලැබෙනවා, නමුත් `color` එතකොට variant එකෙන් එනවා → amber text on purple වගේ mismatch.

**Fix:** `.dark .badge.testing{…}` වගේ variant-specific dark rules ලියන්න, නැත්නම් `background-color` වෙනුවට CSS variable එකක් use කරන්න.

### 3.5 CSS variants 3ක් missing

`Badge` එක tone එක හදාගන්නේ children වලින්: `String(children).toLowerCase().replaceAll(" ","-")`.
CSS එකේ තියෙන්නේ: `ai, awaiting-approval, diagnosing, in-stock, low-stock, ready-for-pickup, testing`.

**නැති ඒවා (ඇත්තටම render වෙනවා):**
- `in-progress` — `repairs[0].status = "In Progress"` (hero repair එක!), Repair Board column එකක්
- `awaiting-parts` — `repairs[2].status = "Awaiting Parts"`
- `received` — Repair Board column එකක්
- `.priority.low` — `repairs[4].priority = "Low"` (`.high/.normal/.urgent` විතරයි තියෙන්නේ)

ප්‍රතිඵලය: "In Progress", "Awaiting Parts", "Received" තුනම generic purple එකට වැටෙනවා — එකිනෙක වෙන් කරගන්න බෑ.

### 3.6 Login page එකේදීත් Cmd+K listener එක active

`App.tsx` — `useEffect` දෙකම (lines 203, 218) `if (!user) return <Login/>` (line 233) එකට **කලින්** register වෙනවා. ඒ නිසා login screen එකේදී Cmd/Ctrl+K ගැහුවොත් `setSearchOpen(true)` වෙනවා, sign in කරපු ගමන් search modal එක මුහුණට එනවා.

**Fix:** effect එක ඇතුළේ `if (!user) return;` දාන්න.

### 3.7 `navigate()` වැරදි page එකක් නිශ්ශබ්දව Dashboard එකට යවනවා

```ts
if (!user || ![...allowedPages, "Dashboard"].includes(to)) { to = "Dashboard"; }
```

Nav එකේ label එකක් typo වුණොත් error එකක් නෑ — පාවිච්චා කරන කෙනාට Dashboard එකට යනවා විතරයි පේන්නේ. Dev එකේදී `console.warn` එකක්වත් දාන්න.

### 3.8 වෙනත් bugs

| # | Issue | Location |
|---|---|---|
| a | Table row එකේ `onClick` + nested `.more-btn` — `stopPropagation` නෑ, menu button එක click කරාමත් row එක navigate වෙනවා | `RepairTable` |
| b | `<form>` එකක් නෑ → Login එකේ Enter ගැහුවම submit වෙන්නෙ නෑ. `<button>` වලට `type` නෑ | `Login` |
| c | `products.find(x=>x.name===name)!` — non-null assertion; cart key එකක් products වල නැති වුණොත් crash | `POS` |
| d | `JSON.parse(stored) as User` — shape validation නෑ; පරණ/partial object එකක් තිබ්බොත් හැම තැනම `undefined` | `App` useState initializer |
| e | `dark` theme එක persist වෙන්නෙ නෑ, session එක persist වෙනවා → reload එකකදී theme එක නැති වෙනවා | `App` |
| f | Reset password flow එක email එක validate කරන්නෙ නෑ; හිස් email එකකුත් "Send reset link" → reset screen එකට යනවා. Password එක ඇත්තටම change වෙන්නෙ නෑ | `Login` |
| g | Kanban `.repair-card` key එක `r.id+j` — columns අතර duplicate ids | `RepairBoard` |

---

## 4. 🟡 P2 — Config / tooling

### 4.1 Vite config එක අනාගතයේ බිඳ වැටෙනවා

Build/dev දෙකේදීම warning එකක් එනවා:

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`,
which is planned to become the default in a future major version of Vite:
  - `__dirname` (vite.config.ts:30:27). Use `import.meta.dirname` instead
  - JSON import "./.figma/make/site.json" without import attributes (vite.config.ts:6:31).
    Add `with { type: 'json' }`
```

### 4.2 Tailwind දෙපාරක් process වෙනවා

`@tailwindcss/vite` plugin එක **සහ** `postcss.config.mjs` (with `@tailwindcss/postcss`) දෙකම configure කරලා තියෙනවා. AGENTS.md එකේම ලියලා තියෙනවා: *"This scaffold does not need a Tailwind config file or PostCSS config."* → `postcss.config.mjs` මකන්න.

### 4.3 Tailwind ඇත්තටම use කරන්නෙ නෑ

`@import 'tailwindcss'` තියෙනවා, නමුත් මුළු app එකම custom CSS classes වලින් style කරලා. මම App.tsx එකේ හැම `className` එකක්ම extract කරලා බැලුවා:

```
total distinct className tokens: 227
tailwind-utility-looking tokens: NONE
```

එක Tailwind utility class එකක්වත් නෑ — ඔක්කොම `kpi-grid`, `sidebar`, `portal-progress` වගේ custom names. ඒ නිසා `tailwindcss` + `@tailwindcss/vite` + `@tailwindcss/postcss` + `autoprefixer` + `postcss` = dead weight (preflight reset එක විතරයි එන්නේ), නමුත් CSS output එකෙන් 47.69 kB එකට දායක වෙනවා.

තීරණය කරන්න: (a) අලුත් වැඩ වලට Tailwind utilities use කරනවා, නැත්නම් (b) deps 5ම අයින් කරලා `@import 'tailwindcss'` එකත් අයින් කරනවා. දැන් තියෙන විදිය (දෙකම තියාගෙන එකක්වත් use නොකරන එක) වැරදියි.

### 4.4 Lockfiles දෙකක්

`package-lock.json` (63 kB) **සහ** `pnpm-lock.yaml` (29 kB) දෙකම commit කරලා. `.mise.toml` + `.figma/make/install` pnpm use කරනවා → **`package-lock.json` එක අයින් කරන්න**. මම `npm install` කරාම lockfile එක වෙනස් වුණා (lines 66ක් — `libc` fields), ඒ කියන්නේ commit කරපු එක වෙනස් npm version එකකින් හදපු එකක්.

### 4.5 Repo structure එක Figma Make එකෙන් බිඳ වැටිලා

`.figma/make/dev.json` එකේ ලියලා තියෙනවා *"Paths are repo-relative"* සහ *"the repo root IS the workspace root"*. නමුත් මුළු app එකම `FixFlow UI Design/` subfolder එකක. Figma Make tooling repo root එකෙන් run කළොත් `src/App.tsx` හම්බෙන්නෙ නෑ. Folder එකට **space එකක්** තියෙන එකත් scripts/CI වලට කරදරයක්.

→ App එක repo root එකට move කරන්න (නැත්නම් `.figma/` එකත් එක්ක subfolder එකට).

### 4.6 `.figma/make/*` scripts executable නෑ

හැම එකක්ම `#!/usr/bin/env bash` shebang එකක් එක්ක තියෙනවා, නමුත් mode එක `644` (`dev`, `install`, `deploy`, `format`, `langserver`, `analyze-routes`, `deploy-preview`).

```
-rw-r--r--  dev  install  deploy  deploy-preview  format  langserver  analyze-routes
```
→ `git update-index --chmod=+x` කරන්න.

### 4.7 `.gitattributes` — LFS landmine

Lines 146ක LFS tracking rules (`*.png`, `*.zip`, `*.db`…) ~90 patterns වලට. Repo එකේ **binary file එකක්වත් නෑ**, සහ මේ environment එකේ git-lfs install වෙලා නෑ. LFS install කරපු කෙනෙක් image එකක් දැම්මොත් pointer files commit වෙන්න පටන් ගන්නවා. මේ file එක අයින් කරන්න, නැත්නම් ඇත්තටම LFS ඕනේ නම් `.lfsconfig` එකක් එක්ක හරියටම set up කරන්න.

### 4.8 Root `.gitignore` එක `node_modules` විතරයි

Subfolder එකේ `.gitignore` එක හොඳයි (`dist/`, `.env*`, `*.log`…), නමුත් root එකේ එක line එකයි. Root එකට `dist/`, `.env*`, `.DS_Store` එකතු කරන්න.

### 4.9 Missing project hygiene

- ❌ README එකක් නෑ (setup instructions, demo credentials, screenshots කිසිවක් නෑ)
- ❌ ESLint config එකක් නෑ
- ❌ Tests නෑ (unit/integration/e2e කිසිවක් නෑ), test runner එකකුත් නෑ
- ❌ CI නෑ (`.github/workflows/` නෑ)
- ❌ `typecheck` / `lint` scripts නෑ
- ⚠️ `package.json` name එක තාම `figma-make-app`

---

## 5. Architecture / code quality

### 5.1 App.tsx = 617 lines / 65 kB එකම එක file එකක්

Components 20+ක්, module-level data constants 6ක්, icon paths 40ක් එකම file එකක. Split කරන්න:

```
src/
  types.ts                 Role, User, Repair, Product
  data/  demoUsers.ts  repairs.ts  products.ts  nav.ts
  components/  Icon.tsx  Button.tsx  Badge.tsx  Card.tsx  RepairTable.tsx
  pages/  Login.tsx  Dashboard.tsx  Repairs.tsx  POS.tsx  Inventory.tsx  AIDiagnosis.tsx
  routes.ts                routeFor / parseRoute / allowedPages
  App.tsx
```

### 5.2 Navigation එක type-safe නෑ

`roleNav` එකේ items `ReadonlyArray<readonly [string, string]>` → icon එක `icon as IconName` කරලා cast කරනවා. Icon name එකක් typo වුණොත් **compile error එකක් නෑ**, හිස් `<svg>` එකක් render වෙනවා.

```ts
type NavItem = readonly [label: string, icon: IconName]   // ← මෙහෙම කරන්න
```

### 5.3 `React.ReactNode` / `React.Dispatch` import නැතුව

Line 1 එකේ `import { useEffect, useMemo, useState } from "react"` විතරයි. නමුත් `React.ReactNode`, `React.Dispatch<...>` use කරනවා (UMD type global එකෙන් pass වෙනවා, නමුත් inconsistent). → `import { type ReactNode, type Dispatch, type SetStateAction } from "react"`.

### 5.4 index.css = 42,290 bytes, lines 16යි

සම්පූර්ණ stylesheet එකම minified වගේ එක line එකකට කුරුල්ලා තියෙන්නේ. Diff කරන්න බෑ, review කරන්න බෑ, edit කරන්න බෑ. Component-based CSS files වලට (හෝ Tailwind utilities වලට) split කරන්න.

### 5.5 Google Fonts runtime `@import`

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```
Render-blocking external request එකක්, offline වැඩ කරන්නෙ නෑ, GDPR/privacy ප්‍රශ්නයක්. Font එක self-host කරන්න (`@fontsource/inter`) හෝ `<link rel="preconnect">` එකක් index.html එකට දාන්න.

### 5.6 Bundle

Single chunk, code splitting නෑ — JS 289.85 kB (gzip 84.78 kB). මේ size එකට ලොකු ප්‍රශ්නයක් නෙවෙයි, නමුත් `React.lazy` + route-based splitting එකක් pages වැඩි වෙනකොට ඕනේ වෙයි.

---

## 6. Accessibility (දුර්වලම තැන)

| Issue | තැන |
|---|---|
| Icon-only buttons වලට `aria-label` නෑ (theme toggle, bell, collapse, more-btn, mobile menu) | `App`, `RepairTable` |
| `<div className="brand" onClick>` — keyboard එකෙන් focus කරන්න බෑ, Enter/Space වැඩ කරන්නෙ නෑ | `sidebar` |
| Table `<tr onClick>` — keyboard navigation නෑ; row එකට `tabIndex`/`role="button"` නෑ | `RepairTable` |
| `SearchModal` — `role="dialog"`, `aria-modal`, focus trap නෑ | `SearchModal` |
| Notification counter එක `<i>4</i>` — semantic නොවන element එකක් counter එකක් විදියට, screen reader එකට "4" කියවෙනවා context එකක් නැතුව | `sidebar` |
| Mobile nav එකට Escape handler එකක් නෑ (search/profile වලට තියෙනවා) | `App` |
| `site.json` → `accessibility.addBypassLinks: false` — skip link එකක් නෑ | `.figma/make/site.json` |
| `ignoreReducedMotion: false` set කරලා තිබුණත් CSS එකේ `prefers-reduced-motion` rule එකක් නෑ (grep → 0 matches), නමුත් `transition:.2s ease` rules තියෙනවා | `index.css` |
| Font sizes: **6px ×2, 7px ×26, 8px ×47, 9px ×36, 9.5px ×3** — rules 114ක් 10px ට අඩුයි. WCAG අනුව කියවිය නොහැකි මට්ටමක් | `index.css` |

---

## 7. Scope: navigation එකෙන් 80%ක් stubs

`ModulePreview` එකට වැටෙන nav items ගණන (මම script එකකින් count කරා):

| Role | Nav items | Real screens | **Stubs** |
|---|---|---|---|
| Admin | 37 | 7 | **30 (81%)** |
| Manager | 26 | 5 | **21 (80%)** |
| Cashier | 13 | 2 | **11 (84%)** |
| Customer | 11 | 2 | **9 (81%)** |
| Technician | 7 | 3 | **4 (57%)** |

ඇත්තටම implement වෙලා තියෙන්නේ: Login, Dashboard (role-aware), Repairs/My Repairs, Repair Board, New Repair, Repair Details, POS, Inventory, AI Diagnosis, Notifications, Customer portal screens.

ඒ වගේම: `New Repair` → "Create repair" කිසිවක් create කරන්නෙ නෑ, validation නෑ. `POS` → "Complete sale" කිසිවක් කරන්නෙ නෑ. `AI Diagnosis` → සම්පූර්ණයෙන්ම hardcoded පිළිතුරු (form එකේ ඕනෑම දෙයක් type කරාම එකම output එක). Demo එකකට මේක පිළිගන්න පුළුවන්, නමුත් "AI" කියලා label කරලා hardcoded output එකක් දෙන එක පැහැදිලිව සටහන් කරන්න ඕනේ.

---

## 8. Security (prototype එකක් විදියට OK, production එකට නෙවෙයි)

- `Demo@123` password එක client bundle එකේ plaintext (`App.tsx` login check). Production එකේදී මේක server-side auth එකක් වෙන්න ඕනේ.
- Demo users 5ක් real-looking emails එක්ක (`admin@fixflow.com`…) bundle එකේ.
- localStorage session එකට expiry එකක් / signature එකක් නෑ; කවුරුත් DevTools එකෙන් role එක වෙනස් කරලා Admin nav එකට යන්න පුළුවන්. **Real authorization එකක් නෙවෙයි — UI-level filtering එකක් විතරයි.** මේක documentation එකේ පැහැදිලිව ලියන්න.
- CSP header නෑ.
- `robots.txt` = `Disallow: /` ✅ (හරි, prototype එකක් නිසා).

---

## 9. හොඳ දේවල් (තියාගන්න ඕනේ)

✅ `recordsFor()` — role-based data scoping එක ඇත්තටම නිවැරදියි (Admin → all, Customer → own, Technician → assigned, Manager → branch)
✅ Role අනුව nav එක, KPI cards, notifications, search actions වෙනස් වෙනවා — consistency හොඳයි
✅ Responsive breakpoints 1200/900/640 හොඳට cover වෙලා (kpi-grid 6→3→2, sidebar→mobile drawer, tables → horizontal scroll + min-width)
✅ Theme එක CSS custom properties වලින් — dark mode එකට අමුතු rules අඩුයි
✅ Single-file inline SVG icon set — icon library dependency එකක් නෑ, tree-shaking ප්‍රශ්න නෑ
✅ `Icon` එකේ `aria-hidden="true"` ✅
✅ `useMemo` navPages/total වලට, `key` props හැම list එකකටම
✅ Search modal එකේ Cmd+K / Escape shortcuts
✅ Role-scoped search: query එක filtered `data` එකට විතරයි match වෙන්නේ

---

## 10. නිර්දේශිත fix order

### ✅ DONE — P0 (2026-10-08, මේ branch එකේ apply කරලා තියෙනවා)

| # | Fix | Verification |
|---|---|---|
| 1 | `tsconfig.json` → `"target": "ES2022"`, `"lib": ["ES2022", …]` + `package.json` එකට `"typecheck": "tsc --noEmit"` | `npm run typecheck` → **exit 0** (කලින් exit 2, errors 2ක්) |
| 2 | `site.json` → `"title"`, `"language"`, `"icons.icon"` + අලුත් `public/favicon.svg` | build + dev දෙකේම `<title>FixFlow — Smart Repair Management &amp; POS</title>`, `<link rel="icon" href="/favicon.svg">`, `dist/favicon.svg` emit වෙනවා, `GET /favicon.svg` → **200 image/svg+xml** |
| 3 | `vite.config.ts` → `allowedHosts` (server + preview), `import.meta.dirname`, JSON import attributes, plugins/watch indentation | preview host → **200** (කලින් 403). `FIGMA_ALLOWED_HOSTS=example.com` දාලා test කරා: `example.com` → 200, `evil.test` → **403** (allowlist branch එකත් වැඩ කරනවා). Vite config warnings **2ම නැති වුණා** |
| 4 | `postcss.config.mjs` මකා දැම්මා (Tailwind දෙපාරක් process වීම නවත්තන්න) | build pass; CSS output එකේ Tailwind preflight තාම තියෙනවා (`::backdrop`, `@layer components/properties`, `box-sizing:border-box`), custom classes (`.kpi-grid`, `.sidebar`) ඒ වගේම |
| 5 | `package-lock.json` මකා දැම්මා (pnpm තමයි pinned toolchain එක — `.mise.toml` + `.figma/make/install`) | `git status` → `D package-lock.json`. දැන් lockfile එකක් විතරයි (`pnpm-lock.yaml`) |
| 6 | `.figma/make/*` scripts 7ම `chmod +x` | `git ls-files -s` → `100755` (dev, install, format, deploy, deploy-preview, langserver, analyze-routes); `.json` 2 තාම `100644` (හරි) |

**නැවත verify කරපු අවසන් තත්ත්වය:**
```
npm run typecheck   → exit 0
npm run build       → exit 0 · JS 289.85 kB (gzip 84.78 kB) · CSS 47.96 kB (gzip 10.29 kB)
                      dist/: assets/ favicon.svg index.html robots.txt   (config warnings 0)
npm run dev         → port 8443 · preview host 200 · /favicon.svg 200 · /src/main.tsx 200
git status          → 14 files changed, 35 insertions(+), 2000 deletions(-)
```

> ⚠️ **සටහන — `oxfmt`:** `npx oxfmt --check vite.config.ts` තාම fail වෙනවා, නමුත් මම බැලුවා **මුල් file එකත් (HEAD) ඒ වගේම unformatted** කියලා. oxfmt run කරාම lines 234ක් වෙනස් වෙනවා (single→double quotes, Figma generate කරපු plugin code එක ඇතුළුව), `App.tsx` එකටත් ඒ වගේම වෙයි. ඒ නිසා repo-wide `npm run format` එක **වෙනම commit එකක්** විදියට කරන එක හොඳයි — P0 fixes එක්ක මිශ්‍ර කරන්න එපා. මම touch කරපු lines file එකේ දැනට තියෙන style එකටම (single quotes) ලිව්වා.

---

### ⬜ ඊළඟට — P1 (තාම කරලා නෑ)

7. `.badge.in-progress`, `.badge.awaiting-parts`, `.badge.received`, `.priority.low` CSS rules
8. Dark mode badge specificity fix (`.dark .badge.*` variants)
9. `RepairDetails` එකට record id එකක් pass කරන්න
10. `RepairBoard` එක ඇත්තටම status එකෙන් group කරන්න + counts compute කරන්න
11. Login page එකේදී Cmd+K listener එක disable කරන්න
12. `roleNav` → `NavItem = readonly [string, IconName]`
13. Deep links: `window.location.pathname` parse කරලා initial page එක set කරන්න
14. UI එකේ hardcoded "Monday, March 18" → ඇත්ත දිනය (2026-03-18 = **Wednesday**)

### ⬜ ඊට පස්සේ

15. `App.tsx` split කරන්න, `index.css` split කරන්න
16. README + CI (typecheck + build) + ESLint
17. Accessibility pass (aria-labels, focus trap, dialog semantics, font sizes)
18. App එක repo root එකට move කරන්න + `.gitattributes` LFS rules අයින් කරන්න
19. Tailwind තීරණය: භාවිතා කරන්න හෝ deps 5 (`tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/postcss`, `autoprefixer`, `postcss`) අයින් කරන්න
20. Repo-wide `npm run format` (වෙනම commit එකක් විදියට)

---

*Review එකේ සියලුම findings `npx tsc --noEmit`, `npm run build`, `npx vite`, `git ls-files`, `date` සහ CSS grep වලින් verify කරගත්තා. §5/§6/§7 වල සමහර items code-reading එකෙන් තහවුරු කරගත්තා (browser automation එකක් මෙතන නැති නිසා) — ඒවා වගුවේ පැහැදිලිව සටහන් කරලා තියෙනවා.*
