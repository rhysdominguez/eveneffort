# Fulfilling a printed paceband order

This is a **smoke test**: there is no order database, no webhook, no admin UI.
The Stripe Checkout Session's metadata *is* the order record, and every band is
made by hand. That is deliberate — it caps volume at a few dozen a week and
teaches us what fulfillment actually costs before we automate anything.

## Per order

0. Stripe emails the account address on every successful payment (Settings →
   Notifications). That email is the only order alert there is — treat it as the
   inbox.
1. **Stripe dashboard → Payments** → open the succeeded payment.
2. Read its **Metadata** panel — the route copies the order record onto the
   PaymentIntent precisely so it is visible here (session metadata is not):
   - `resultsUrl` — open it. This reproduces the runner's exact band.
   - `courseName`, `goalTime`, `unit` — a sanity check that the link loaded right.
3. On that page click **Print band** → **Print it yourself** → **Print**.
   Everything except the paceband strip is `print:hidden`, so the dialog shows
   just the band.
4. Print on synthetic/waterproof stock (Rite in the Rain, or a laser-safe
   polyester sheet). Confirm the printer is set to **100% scale, no fit-to-page**
   — the band is sized in inches and any scaling ruins the wrist fit.
5. Trim on the guides, round the corners, fold on the dashed line.
6. Mail in a standard letter envelope to the shipping address Stripe collected.
7. **Reply to the receipt thread**: confirm it shipped, then ask one question —
   *"What made you order a band rather than print one?"* That answer is worth
   more than the margin on the order.

Ship within **3–5 business days** of payment — that is the promise made on
`/policies` and on the confirmation page.

## Economics per order

| | |
|---|---|
| Price | $9.99 |
| Stripe fee (2.9% + 30¢) | −$0.59 |
| Postage (US letter) | −$0.75 |
| Synthetic stock + ink | −$0.40 |
| **Gross** | **≈ $8.25** |

Labour is not counted. If fulfillment stops being fun, that is itself a result.

**No sales tax is collected.** $9.99 is the whole price, Stripe Tax is off, and
`automatic_tax` is deliberately absent from the session. At smoke-test volume no
state's economic nexus threshold is anywhere near met, so there is nothing to
register for and nothing to remit. Revisit if this ever sells in real numbers.

## Refunds

Full refund on request before shipping; replacement or refund if it arrives
damaged or wrong, with nothing sent back. Issue refunds directly in the Stripe
dashboard. See [`/policies`](../src/app/policies/page.tsx) for the customer-facing wording.

## Reading the smoke test

| Funnel step | Where |
|---|---|
| `/results` viewed | Vercel Web Analytics (page views) |
| Print modal opened | Vercel logs: `{"type":"app_event","event":"print_modal_opened"}` |
| Order modal opened | Vercel logs: `{"type":"app_event","event":"order_modal_opened"}` |
| Order clicked | Vercel logs: `{"type":"app_event","event":"order_clicked"}` |
| Checkout session created | Stripe dashboard |
| **Paid** | Stripe dashboard |

**Success criterion, fixed in advance: ≥2% of `/results` viewers complete
payment, measured over at least 300 results views.** Do not move this number
after seeing the data.

## If it validates

Then, and only then: webhook + order table, a real print/ship partner, tracking
numbers, and international shipping. Not before.
