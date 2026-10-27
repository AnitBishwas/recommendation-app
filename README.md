# Recommendation Engine — Shopify App

A Shopify embedded app that lets merchants create UTM-targeted product recommendation quizzes. Customers land on a store via a campaign link, a popup quiz appears, they answer questions, and the app scores their answers to surface the most relevant products from the catalog.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Data Models](#3-data-models)
4. [Scoring Algorithm](#4-scoring-algorithm)
5. [Admin API Endpoints](#5-admin-api-endpoints)
6. [App Proxy Endpoints (Storefront)](#6-app-proxy-endpoints-storefront)
7. [UTM Campaign Matching](#7-utm-campaign-matching)
8. [Storefront Integration](#8-storefront-integration)
9. [End-to-End Flow](#9-end-to-end-flow)
10. [Running Locally](#10-running-locally)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Merchant Side                        │
│                                                             │
│   Shopify Admin (embedded app)                              │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  Campaign Builder  →  Questionnaire Builder         │  │
│   │  (campaigns, questions, options, scoring rules)     │  │
│   └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Shopify OAuth / JWT
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    App Server (Express)                      │
│                                                             │
│  /api/apps/admin/*     Admin CRUD routes                    │
│  /api/proxy_route/*    Internal proxy handler               │
│                                                             │
│  MongoDB ←──────────────────────────────────────────────── │
│  (campaigns, questions, options, scoring rules, sessions)   │
└──────────────────────────┬──────────────────────────────────┘
                           │ Shopify App Proxy (HMAC-signed)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Customer Side                           │
│                                                             │
│  Store URL + ?utm_source=X&utm_medium=Y&utm_campaign=Z      │
│                                                             │
│  /apps/recommendation-custom/campaign   ← fetch quiz data  │
│  /apps/recommendation-custom/recommend  ← submit answers   │
│                                                             │
│  recommendation.liquid + recommendation.js                  │
│  (popup quiz → KeenSlider product results → ATC)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Embedded app frontend | React 18, Vite, Shopify Polaris Web Components, Raviger (routing) |
| App server | Node.js, Express 5 |
| Database | MongoDB (Mongoose) |
| Shopify integration | `@shopify/shopify-api` SDK, OAuth, App Proxy, Webhooks |
| Storefront frontend | Shopify Liquid, Web Components API, KeenSlider |
| Tunnel (dev) | Cloudflare Tunnel |

---

## 3. Data Models

### Campaign
The top-level entity. One campaign per UTM targeting configuration.

```
Campaign {
  shop              String    — myshopify domain, scopes all queries
  name              String    — internal label for the merchant
  utm_source        String?   — null = wildcard (matches any source)
  utm_medium        String?   — null = wildcard
  utm_campaign      String?   — null = wildcard
  match_mode        "all"|"any"  — reserved for future multi-tag logic
  is_active         Boolean   — inactive campaigns are never served
  result_tag_limit  Number    — how many top-scoring tags to use (default 3)
  result_product_limit Number — max products to return (default 4)
}
```

### Question
Each campaign has an ordered list of questions.

```
Question {
  campaign_id   ObjectId  → Campaign
  text          String    — the question shown to the customer
  type          "single_select" | "multi_select"
  order         Number    — display order (1-indexed)
  is_required   Boolean
}
```

### Option
Each question has multiple options. Options drive both branching and scoring.

```
Option {
  question_id     ObjectId  → Question
  label           String    — the answer text shown to the customer
  order           Number    — display order
  next_question_id ObjectId? → Question  — if set, selecting this option
                                           jumps to that question instead
                                           of the next sequential one
}
```

### ScoringRule
Each option can carry one or more scoring rules. These are the core of the recommendation engine.

```
ScoringRule {
  option_id     ObjectId  → Option
  target_type   "product_tag" | "collection_id" | "product_id"
  target_value  String    — e.g. "finish:matte", "gid://shopify/Collection/123"
  weight        Number    — how strongly this option signals the target (1–10)
}
```

### Relationship diagram

```
Campaign
  └── Question (ordered)
        └── Option (ordered)
              ├── next_question_id → Question  (optional branching)
              └── ScoringRule[]
                    ├── target_type: product_tag,  target_value: "finish:matte",   weight: 3
                    ├── target_type: product_tag,  target_value: "skin:oily",      weight: 2
                    └── target_type: collection_id, target_value: "gid://...",     weight: 1
```

---

## 4. Scoring Algorithm

This is the core business logic that turns customer answers into product recommendations. It runs identically in both the admin preview (`POST /campaign/:id/preview`) and the live storefront proxy (`POST /recommend`).

### Step 1 — Collect selected options

The customer's answers arrive as:
```json
{
  "answers": [
    { "question_id": "q1", "option_ids": ["opt_a"] },
    { "question_id": "q2", "option_ids": ["opt_c", "opt_d"] }
  ]
}
```

All selected `option_ids` are flattened into a single array.

### Step 2 — Aggregate tag scores

Every `ScoringRule` attached to any selected option is fetched. Weights are summed per `target_value`:

```
opt_a → ScoringRule { target_value: "finish:matte",  weight: 3 }
opt_a → ScoringRule { target_value: "skin:normal",   weight: 2 }
opt_c → ScoringRule { target_value: "finish:matte",  weight: 2 }
opt_d → ScoringRule { target_value: "skin:oily",     weight: 4 }

scores = {
  "finish:matte":  5   (3 + 2)
  "skin:normal":   2
  "skin:oily":     4
}
```

### Step 3 — Select top tags

Scores are sorted descending. The top `result_tag_limit` tags (default: 3) are used as the Shopify product query:

```
topTags = ["finish:matte", "skin:oily", "skin:normal"]
GraphQL query = "tag:finish:matte OR tag:skin:oily OR tag:skin:normal"
```

The Shopify Admin GraphQL API returns the first 50 products matching that query, including their full tag list.

### Step 4 — Re-rank products

Each returned product is scored by summing the weights of all its tags that appear in the `scores` map:

```
Product A  tags: ["finish:matte", "skin:oily"]
  score = scores["finish:matte"] + scores["skin:oily"] = 5 + 4 = 9

Product B  tags: ["finish:matte", "skin:sensitive"]
  score = scores["finish:matte"] = 5

Product C  tags: ["skin:normal"]
  score = scores["skin:normal"] = 2
```

Products are sorted by score descending, and the top `result_product_limit` (default: 4) are returned.

### Step 5 — Return

```json
{
  "ok": true,
  "products": [
    {
      "id": "gid://shopify/Product/...",
      "title": "...",
      "handle": "...",
      "image": { "url": "...", "altText": "..." },
      "price": { "amount": "29.99", "currencyCode": "USD" },
      "variantId": "12345678",
      "availableForSale": true,
      "score": 9
    }
  ]
}
```

---

## 5. Admin API Endpoints

All routes are under `/api/apps/admin/` and require a valid Shopify session JWT (`verifyRequest` middleware). Every query is automatically scoped to `res.locals.user_session.shop`.

### Campaigns

| Method | Path | Description |
|---|---|---|
| `GET` | `/campaign/list` | List all campaigns for the store, sorted newest first |
| `PUT` | `/campaign/create` | Create a campaign. Requires `name` + at least one UTM field |
| `GET` | `/campaign/:id` | Get a single campaign |
| `POST` | `/campaign/:id` | Update campaign fields |
| `DELETE` | `/campaign/:id` | Delete campaign and cascade-delete all its questions, options, and scoring rules |
| `POST` | `/campaign/:id/preview` | Run the scoring algorithm with test answers. Used by the admin quiz preview panel |

**Preview request body:**
```json
{
  "answers": [
    { "question_id": "...", "option_ids": ["...", "..."] }
  ]
}
```

### Questions

| Method | Path | Description |
|---|---|---|
| `GET` | `/question/full/:campaignId` | Returns the full nested questionnaire: campaign → questions → options → scoring rules in one call |
| `PUT` | `/question/create` | Create a question. Auto-assigns `order = count + 1` |
| `POST` | `/question/reorder` | Swap orders for two or more questions. Body: `{ campaign_id, order: [{id, order}] }` |
| `GET` | `/question/validate/:campaignId` | Validates the questionnaire. Checks every question has ≥ 2 options and every option has ≥ 1 scoring rule |
| `POST` | `/question/:id` | Update question text, type, or is_required |
| `DELETE` | `/question/:id` | Delete question and cascade-delete its options and their scoring rules |

**Validation response:**
```json
{
  "ok": true,
  "valid": false,
  "issues": [
    "Q2 \"What is your budget?\" has fewer than 2 options.",
    "Option \"I'm not sure\" in Q1 has no scoring rules."
  ]
}
```

### Options

| Method | Path | Description |
|---|---|---|
| `PUT` | `/option/create` | Create an option for a question. `next_question_id` is optional (branching) |
| `POST` | `/option/:id` | Update option label or next_question_id |
| `DELETE` | `/option/:id` | Delete option and cascade-delete its scoring rules |

### Scoring Rules

| Method | Path | Description |
|---|---|---|
| `PUT` | `/scoring-rule/create` | Attach a scoring rule to an option |
| `DELETE` | `/scoring-rule/:id` | Remove a scoring rule |

**Create rule body:**
```json
{
  "option_id": "...",
  "target_type": "product_tag",
  "target_value": "finish:matte",
  "weight": 3
}
```

### Shop

| Method | Path | Description |
|---|---|---|
| `GET` | `/shop/product-tags` | Returns all product tags in the store. Used for autocomplete in the scoring rule builder |

---

## 6. App Proxy Endpoints (Storefront)

These routes are served at `https://{shop}.myshopify.com/apps/recommendation-custom/*`. Shopify acts as a reverse proxy, forwarding requests to the app server with HMAC-signed query parameters. The `verifyProxy` middleware validates the signature on every request and sets `res.locals.user_shop`.

> Requests hit Shopify's CDN first — they are same-origin from the browser's perspective, so no CORS issues and `credentials: "same-origin"` works correctly.

---

### `GET /apps/recommendation-custom/campaign`

Finds the active campaign that best matches the visitor's UTM parameters and returns the full quiz structure (without scoring rules — those stay server-side).

**Query parameters** (all optional, read from `window.location.search` on the storefront):

| Param | Description |
|---|---|
| `utm_source` | e.g. `email`, `google` |
| `utm_medium` | e.g. `newsletter`, `cpc` |
| `utm_campaign` | e.g. `summer-sale` |

**Matching logic:** For each UTM field the campaign has set, the visitor's URL must carry that same value. If the campaign has `utm_source: null`, it matches any visitor regardless of their `utm_source`. If the campaign has `utm_source: "email"` and the visitor's URL has no `utm_source`, that campaign does **not** match. When multiple campaigns match, the one with the most non-null UTM fields wins (most specific targeting).

**Success response:**
```json
{
  "ok": true,
  "campaign": {
    "_id": "...",
    "name": "Summer Email Campaign",
    "result_product_limit": 4
  },
  "questions": [
    {
      "_id": "...",
      "text": "What is your skin type?",
      "type": "single_select",
      "order": 1,
      "is_required": true,
      "options": [
        { "_id": "...", "label": "Oily",   "order": 1, "next_question_id": null },
        { "_id": "...", "label": "Dry",    "order": 2, "next_question_id": "q3_id" },
        { "_id": "...", "label": "Normal", "order": 3, "next_question_id": null }
      ]
    }
  ]
}
```

**No match response** (no popup is shown):
```json
{ "ok": true, "campaign": null }
```

---

### `POST /apps/recommendation-custom/recommend`

Accepts the customer's completed answers, runs the [scoring algorithm](#4-scoring-algorithm), and returns ranked products with variant IDs for the Add to Cart button.

**Request body:**
```json
{
  "campaign_id": "...",
  "answers": [
    { "question_id": "...", "option_ids": ["..."] },
    { "question_id": "...", "option_ids": ["...", "..."] }
  ]
}
```

**Success response:**
```json
{
  "ok": true,
  "products": [
    {
      "id": "gid://shopify/Product/...",
      "title": "Hydrating Face Serum",
      "handle": "hydrating-face-serum",
      "image": { "url": "https://cdn.shopify.com/...", "altText": "..." },
      "price": { "amount": "34.99", "currencyCode": "USD" },
      "variantId": "44123456789",
      "availableForSale": true,
      "score": 11
    }
  ]
}
```

`variantId` is the numeric Shopify variant ID extracted from the GraphQL GID. It is used directly in the storefront `cart/add.js` call.

---

## 7. UTM Campaign Matching

The matching table below shows how different UTM configurations behave:

| Campaign utm_source | Campaign utm_medium | Visitor URL has utm_source | Visitor URL has utm_medium | Matches? |
|---|---|---|---|---|
| `email` | `newsletter` | `email` | `newsletter` | ✅ exact match |
| `email` | `null` | `email` | `newsletter` | ✅ medium is wildcard |
| `email` | `null` | `email` | *(none)* | ✅ medium is wildcard |
| `email` | `newsletter` | `email` | *(none)* | ❌ campaign requires medium |
| `null` | `null` | *(any)* | *(any)* | ✅ catch-all campaign |
| `google` | `null` | `email` | `newsletter` | ❌ source doesn't match |

When multiple campaigns match, the one with the **highest specificity** (most non-null UTM fields) wins. A campaign with `utm_source + utm_medium + utm_campaign` all set beats a catch-all.

---

## 8. Storefront Integration

### Files

| File | Location | Role |
|---|---|---|
| `recommendation.liquid` | `sections/` | Section template — hosts the `<product-recommendation>` element, all scoped CSS, and the schema for theme editor settings |
| `recommendation.js` | `frontend/entrypoints/` | Web Component that manages the full popup lifecycle |

### Adding to the theme

To show the popup on **every page**, add the section to the theme layout:

```liquid
{{- /* layout/theme.liquid, just before </body> -}}
{%- section 'recommendation' -%}
```

To show it only on specific pages, add it via the theme editor to those page templates.

### Section settings (theme editor)

| Setting | Type | Default | Description |
|---|---|---|---|
| Heading | Text | "Find Your Perfect Match" | Popup heading on the intro screen |
| Subheading | Textarea | — | Supporting copy below the heading |
| Start button text | Text | "Take the Quiz" | CTA on the intro screen |
| Get results button text | Text | "See My Results" | Button on the final question |
| Accent color | Color | `#000000` | Drives buttons, selected options, progress bar via `--rc-accent` CSS variable |

### Web Component states

The `<product-recommendation>` element manages its own DOM via `innerHTML`. It is invisible until `loadCampaign()` resolves with a matching campaign.

```
idle        — element in DOM, no visible output (waiting for loadCampaign)
intro       — modal open: heading, subheading, "Take the Quiz" button
quiz        — modal open: progress bar, current question, option buttons
submitting  — modal open: spinner ("Finding your matches…")
results     — modal open: product slider with ATC buttons
error       — modal open: error message with retry button
closed      — user dismissed: modal removed, body scroll restored
```

### Quiz navigation & branching

- Questions are stepped through in `order` sequence by default.
- If a selected option has `next_question_id` set (single-select only), the quiz jumps directly to that question instead of the next in sequence. This enables conditional flows (e.g. oily-skin customers skip to a different question than dry-skin customers).
- The Back button pops a history stack, so the customer always retraces their exact path regardless of branching.

### Add to Cart

The ATC button calls Shopify's storefront Cart API directly from the browser:

```
POST {Shopify.routes.root}cart/add.js
Content-Type: application/json

{ "items": [{ "id": "{variantId}", "quantity": 1 }] }
```

On success a `cart:updated` custom event is dispatched on `document`, which the theme's cart drawer listens for to refresh its contents.

---

## 9. End-to-End Flow

### Merchant setup (once)

```
1. Install app on Shopify store
2. Create a Campaign
   — Set name, UTM targeting (e.g. utm_source=email), result limits
3. Build questionnaire
   — Add questions (single or multi-select)
   — Add options to each question
   — Optionally set next_question_id on options for branching
4. Attach scoring rules to each option
   — e.g. "Oily" option → product_tag: skin:oily, weight: 4
   —      "Matte finish" option → product_tag: finish:matte, weight: 3
5. Tag products in Shopify with the same tags used in scoring rules
6. Use admin Preview to test the quiz and verify products surface correctly
7. Activate campaign (is_active: true)
8. Add {% section 'recommendation' %} to layout/theme.liquid
```

### Customer journey (per visit)

```
1. Customer clicks a campaign link with UTM params
   e.g. https://mystore.com/?utm_source=email&utm_campaign=summer

2. Page loads → <product-recommendation> connects to DOM
   → loadCampaign() fetches GET /apps/recommendation-custom/campaign
     ?utm_source=email&utm_campaign=summer

3. App server:
   → verifyProxy validates Shopify HMAC signature
   → Queries MongoDB for active campaigns matching the UTM params
   → Selects most-specific match
   → Fetches questions + options (no scoring rules sent to client)
   → Returns campaign + quiz structure

4. Modal popup appears with intro screen

5. Customer clicks "Take the Quiz"
   → Quiz steps through questions one by one
   → Back button / branching logic handled client-side

6. Customer reaches last question, clicks "See My Results"
   → Answers collected: [{ question_id, option_ids }]
   → POST /apps/recommendation-custom/recommend

7. App server:
   → verifyProxy validates HMAC
   → Fetches all ScoringRules for selected option IDs
   → Aggregates tag scores (sum weights per target_value)
   → Takes top N tags (result_tag_limit, default 3)
   → Queries Shopify GraphQL: "tag:X OR tag:Y OR tag:Z"
   → Re-ranks returned products by tag score
   → Returns top result_product_limit products with variantId

8. Results appear in KeenSlider carousel
   → Each card: product image, title, price, Add to Cart button

9. Customer clicks Add to Cart
   → POST /cart/add.js with numeric variantId
   → Button shows spinner → "Added!" (green) → resets after 2s
   → cart:updated event dispatched → theme cart drawer refreshes

10. Customer can Retake Quiz (resets state, reopens at Step 5)
    or close the modal (Escape / X button / backdrop click)
```

---

## 10. Running Locally

### Prerequisites

- Node.js 18+
- MongoDB running locally (`mongodb://localhost:27017`)
- A Shopify Partner account and a development store
- Cloudflare Tunnel (`cloudflared`) for the public HTTPS URL

### App server

```bash
cd app
cp .env.example .env
# Fill in SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL (cloudflare tunnel URL)

# Terminal 1 — start cloudflare tunnel (keep this URL stable across restarts)
npm run cloudflare

# Terminal 2 — start app server with hot reload
npm run dev
```

After changing `SHOPIFY_APP_URL` in `.env` (e.g. after a tunnel restart), push the new URL to Shopify:

```bash
npm run update:config
```

### Storefront theme

```bash
cd ../../swiss/storefront/vite-fixes

# Terminal 3 — Vite dev server (compiles frontend/entrypoints/*.js → assets/)
# Terminal 4 — Shopify CLI theme dev
npm run dev
```

The storefront runs against `swiss-local-dev.myshopify.com` (configured in `.env`). The app must be installed on the same store.

### Test the proxy directly

```bash
# Returns quiz JSON for a matching campaign (if any active campaign has null UTMs)
curl "https://swiss-local-dev.myshopify.com/apps/recommendation-custom/campaign"

# With UTM params
curl "https://swiss-local-dev.myshopify.com/apps/recommendation-custom/campaign?utm_source=email&utm_campaign=summer"
```

### Test the full quiz on the storefront

```
https://swiss-local-dev.myshopify.com/?preview_theme_id=174262944113&utm_source=email&utm_campaign=summer
```

Replace UTM values with the ones set on your active campaign.
u