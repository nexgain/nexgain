# Connecting the Transactions page to the AI

The AI Assistant can already answer spending questions and spot spending problems. It just has no bank transactions to look at yet. This page explains what's ready, and exactly what your Transactions page needs so the AI can use its data.

## What's already built and tested

**Questions the AI can answer** in the AI Assistant chat. This is the **free** version: it works out the question itself and adds up your own data on the phone. No paid AI service is used.

- "How much did I spend at Bunnings last month?"
- "What did I spend on fuel this week?"
- "Who's my biggest supplier this year?"
- "How much did job #4521 cost me in materials?"
- "Have material costs increased?"

The AI gives the total first, for example "You spent $1,284.50 at Bunnings in October across 9 purchases". Then it shows tappable transaction cards, and adds a comparison when that's useful, for example "18% more than September".

**Problems it spots by itself** (these show on the Dashboard, the Analytics page and the AI Assistant screen):

- A category costing more, for example "Materials up 12%, about $340 more a month", with a suggestion such as comparing suppliers.
- The same item, or the same supplier, costing more than before.
- Regular monthly charges and subscriptions that could be cut.
- Jobs where purchases are eating the profit.
- Unusual or unexpected payments.

**It understands:**

- **Messy bank names.** "BUNNINGS 6342 CAPALABA", "VISA DEBIT PURCHASE CARD 4587 BUNNINGS WAREHOUSE…" and a typo like "bunings" all count as Bunnings.
- **Dates in plain words.** "last month", "this week", "since July", "this financial year" (1 July – 30 June) and "last financial year", all in Brisbane time.

**Until the page is connected**, nothing breaks. The spending checks quietly skip. If someone asks a spending question, the AI says: "Your Transactions page isn't connected yet, so I can't see spending data."

All of this was tested with **sample** transactions, including messy bank names and a materials price rise. The sample data lives in `src/data/ai-sample-data.ts`, is never saved to your database, and the tests are in `src/data/__tests__/ai-assistant.test.ts`.

## What your Transactions page needs to save

Save each bank transaction as one row in a Supabase table (for example `transactions`) with these columns:

| Column | Type | Required? | What it is |
|---|---|---|---|
| `id` | uuid | yes | The row's id. |
| `business_id` | uuid | yes | Which business it belongs to. **The AI only ever reads rows for the signed-in owner's business.** |
| `date` | date | yes | The day of the transaction, "YYYY-MM-DD". |
| `amount` | number | yes | Money **spent is a positive number** (e.g. `84.50`). Refunds are negative. Money coming in can be left out, or stored as negative. |
| `raw_merchant` | text | yes | The name exactly as the bank shows it, e.g. `BUNNINGS 6342 CAPALABA`. |
| `merchant` | text | optional | A clean supplier name, e.g. `Bunnings`. If it's empty, the AI works it out from `raw_merchant`. |
| `category` | text | optional (strongly recommended) | `fuel`, `materials`, `labour`, `tools`, `subscriptions`, `vehicle` and so on. Similar words are understood ("Materials & supplies" counts as materials, "Diesel" counts as fuel). |
| `job_id` | uuid | optional | The job it was bought for (links to `jobs.id`). Needed for "how much did job X cost". |
| `description` | text | optional | Item details, e.g. `Pressure washer detergent 20L`. Lets the AI notice the *same item* getting more expensive. |

**Security.** Turn on Row Level Security for the table, with a rule that only the business owner can read their own rows. That's the same rule as the `expenses` table: `public.is_business_owner(business_id)`. The AI chat reads transactions using the owner's own login, so this rule also protects the AI.

If you'd rather use different column names, that's fine. See step 2 below.

## The connection step (one small change)

Everything reads transactions through **one file**: `supabase/functions/_shared/ai/transactions-adapter.ts`. Both the free AI Assistant in the app and the daily health check on the server use it.

1. Open that file and change

   ```ts
   const TRANSACTIONS_TABLE: string | null = null;
   ```

   to the name of your table, for example

   ```ts
   const TRANSACTIONS_TABLE: string | null = 'transactions';
   ```

2. If your columns are named differently from the table above, update the `COLUMNS` line in the same file. `toTransaction()` in `supabase/functions/_shared/ai/transactions.ts` already accepts a few common alternatives: `transaction_date` or `posted_at` for `date`, `bank_description` for `raw_merchant`, and `supplier` for `merchant`.

3. The app picks the change up straight away (the free AI Assistant reads transactions with the owner's own login). For the morning health check, deploy the `ai-insights` function again:

   ```
   npx supabase functions deploy ai-insights
   ```

   (If you ever switch on the paid Claude version, `USE_CLAUDE` in `src/data/ai-chat.ts`, deploy `ai-assistant` again too.)

That's it. Nothing else in the app or the AI needs changing. The next morning's health check, or tapping **Refresh** on the AI Assistant screen, will include the spending insights.

## How to check it worked

1. Add a few transactions on your Transactions page.
2. On the AI Assistant screen, ask "How much did I spend at Bunnings this month?" (use a supplier you've entered). You should get a total and transaction cards.
3. Tap Refresh on "Things that need your attention" to run the health check with your spending included.
