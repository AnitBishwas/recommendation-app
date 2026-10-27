# Recommendation Engine — Business Logic

## Overview

A Shopify custom app that lets merchants build UTM-targeted product recommendation quizzes.
When a customer lands on the storefront with a matching UTM parameter, a quiz is shown.
Their answers are scored against product tags, and the top-matching products are recommended.

---

## Entities

### Campaign

A campaign is the top-level container. It defines when the quiz is triggered.

| Field        | Type      | Notes                                       |
| ------------ | --------- | ------------------------------------------- |
| id           | uuid      | PK                                          |
| shop_id      | string    | Shopify shop domain                         |
| name         | string    | Internal label for merchant                 |
| utm_source   | string    | nullable — matches `utm_source` param       |
| utm_medium   | string    | nullable — matches `utm_medium` param       |
| utm_campaign | string    | nullable — matches `utm_campaign` param     |
| match_mode   | enum      | `all` (AND) or `any` (OR) across UTM fields |
| is_active    | boolean   | Only active campaigns are served            |
| created_at   | timestamp |                                             |
| updated_at   | timestamp |                                             |

**Trigger logic:** On page load, the storefront JS reads UTM params from the URL.
It calls the app proxy with those params. The app returns the first active campaign
where UTM fields match (based on `match_mode`). If no campaign matches, nothing is shown.

---

### Question

Questions belong to a campaign and are shown in order. Branching is supported via `next_question_id` on options.

| Field       | Type      | Notes                                      |
| ----------- | --------- | ------------------------------------------ |
| id          | uuid      | PK                                         |
| campaign_id | uuid      | FK → Campaign                              |
| text        | string    | The question shown to the user             |
| type        | enum      | `single_select` or `multi_select`          |
| order       | integer   | Display order within the campaign          |
| is_required | boolean   | Whether user must answer before proceeding |
| created_at  | timestamp |                                            |

---

### Option

Each question has multiple selectable options. Scoring rules are attached here.

| Field            | Type      | Notes                                                |
| ---------------- | --------- | ---------------------------------------------------- |
| id               | uuid      | PK                                                   |
| question_id      | uuid      | FK → Question                                        |
| label            | string    | Display text                                         |
| order            | integer   | Display order within the question                    |
| next_question_id | uuid      | nullable — if set, overrides linear flow (branching) |
| created_at       | timestamp |                                                      |

**Branching logic:** After an answer is submitted, if the selected option has a
`next_question_id`, the quiz jumps to that question. Otherwise it advances to
`current_question.order + 1`. For `multi_select`, branching is resolved by the
first selected option that has a `next_question_id` set.

---

### ScoringRule

Maps an option to a product tag (or collection/product) with a numeric weight.
One option can have multiple scoring rules targeting different tags.

| Field        | Type      | Notes                                        |
| ------------ | --------- | -------------------------------------------- |
| id           | uuid      | PK                                           |
| option_id    | uuid      | FK → Option                                  |
| target_type  | enum      | `product_tag`, `collection_id`, `product_id` |
| target_value | string    | The tag name, collection GID, or product GID |
| weight       | integer   | Score contribution (default 1, range 1–10)   |
| created_at   | timestamp |                                              |

---

## Scoring Algorithm

When the quiz is completed, scores are accumulated across all selected options:

```
scores = {}

for each selected option:
  for each scoring_rule on that option:
    scores[target_value] += rule.weight

sort scores descending
```

**Example:**

```
User selects:
  "Matte finish"  → ScoringRule: tag=finish:matte  weight=3
  "All day wear"  → ScoringRule: tag=longevity:high weight=2
                    ScoringRule: tag=finish:matte   weight=1
  "Bold color"    → ScoringRule: tag=tone:bold      weight=3

Final scores:
  finish:matte   → 4
  tone:bold      → 3
  longevity:high → 2
```

The top-scoring tags are used to query Shopify's Storefront API.

---

## Product Resolution

After scoring, products are fetched from Shopify using the Storefront API.

**Strategy:**

1. Take the top N tags by score (configurable per campaign, default 3).
2. Query Storefront API for products matching those tags.
3. Rank results: products matching more top-scoring tags rank higher.
4. Return top M products (configurable per campaign, default 4).

**Tag query logic:**

```
# Fetch products with any of the top tags
query: tag:finish:matte OR tag:tone:bold OR tag:longevity:high

# Then re-rank in app by counting how many top tags each product has,
# weighted by the score of those tags.
```

**Product ranking score:**

```
product_score = sum of (tag_score) for each of product's tags that appear in scores
```

Products with no matching tags are excluded from results.

---

## Quiz Session

Tracks a single user's quiz attempt. Used for analytics and result persistence.

| Field              | Type      | Notes                                       |
| ------------------ | --------- | ------------------------------------------- |
| id                 | uuid      | PK                                          |
| campaign_id        | uuid      | FK → Campaign                               |
| shop_id            | string    |                                             |
| session_token      | string    | Anonymous identifier stored in localStorage |
| utm_source         | string    | Captured at session start                   |
| utm_medium         | string    |                                             |
| utm_campaign       | string    |                                             |
| answers            | jsonb     | `[{ question_id, option_ids: [] }]`         |
| result_product_ids | jsonb     | Shopify product GIDs returned               |
| completed          | boolean   | False if user abandoned mid-quiz            |
| created_at         | timestamp |                                             |
| completed_at       | timestamp | nullable                                    |

**Session persistence:** On quiz start, a `session_token` (UUID) is written to
`localStorage`. On return visits, if a completed session token exists, skip the
quiz and show the saved result directly.

---

## Campaign Configuration Rules

- A campaign must have at least one question to be activated.
- Every question must have at least two options.
- At least one option across the campaign must have a scoring rule (warning if fewer than 30% do).
- `utm_source`, `utm_medium`, and `utm_campaign` are all optional individually — but at least one must be set for a campaign to be saved.
- Only one campaign can match per page load. If multiple campaigns qualify, the most recently updated active campaign wins.

---

## Merchant Configuration Flow

```
1. Create Campaign
   ├── Set name
   ├── Set UTM trigger fields (at least one required)
   └── Set match_mode (all / any)

2. Build Questions
   ├── Add question text and type (single / multi select)
   ├── Add options
   └── Optionally set next_question_id on options for branching

3. Attach Scoring Rules
   ├── Per option → add one or more rules
   ├── Choose target_type (product_tag recommended)
   ├── Enter target_value (tag name as it exists in Shopify)
   └── Set weight (1–10)

4. Configure Result Settings (per campaign)
   ├── Max tags used in product query (default 3)
   └── Number of products to return (default 4)

5. Preview
   └── Simulate quiz answers → see which products would be returned

6. Publish
   └── Toggle is_active = true
```

---

## Storefront Integration

The app installs a **Theme App Extension** (no theme code changes required).

**Runtime flow:**

```
1. Page loads → extension JS reads UTM params from URL
2. POST /apps/quiz/resolve  { utm_source, utm_medium, utm_campaign }
   ← returns matching campaign + questions + options (no weights exposed to client)
3. Quiz renders as overlay
4. On completion → POST /apps/quiz/score  { session_token, campaign_id, answers }
   ← app computes scores server-side, queries Storefront API, returns products
5. Recommendation UI renders with returned products
6. session_token + result saved to localStorage
```

Weights and scoring rules are never sent to the client — scoring happens server-side only.

---

## Edge Cases

| Scenario                                                                  | Behaviour                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| No campaign matches UTM                                                   | Quiz is not shown, nothing rendered                                                      |
| User abandons mid-quiz                                                    | Session saved as `completed: false`, quiz shown again on next visit                      |
| All top-scored tags return 0 products                                     | Fall back to next tag in score ranking until products are found                          |
| Product is out of stock                                                   | Included in results by default; merchant can configure to exclude via a campaign setting |
| `multi_select` question, multiple options have scoring rules for same tag | Weights are additive — all matching rules contribute                                     |
| Returning visitor with completed session                                  | Saved result shown immediately, quiz skipped                                             |
