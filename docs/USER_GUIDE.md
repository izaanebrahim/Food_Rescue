# User guide

## Donors (messes, caterers, halls, bakeries)

1. **Sign up** and choose *I have surplus food*. Put a pin on the map at your usual pickup point.
2. **List food**: say what it is, how many people it feeds, veg / non-veg / vegan, when it was made and until when it is safe to eat. The *2 h / 4 h / 6 h / 12 h from now* buttons fill in the safe-until time.
   - Food must be safe for at least another hour.
   - Cooked food can be listed for at most 12 hours after it was made.
3. Your listing appears to verified NGOs and volunteers nearby straight away.
4. When someone claims it, you get a notification and your dashboard shows who is coming and by when. Use **Message on WhatsApp** to talk to them.
5. When they arrive, ask for their **4-digit pickup code**, type it in and press **Confirm pickup**.
6. If they don't arrive in time, the food goes back on the map automatically. You can also **Withdraw** a listing at any time.

## NGOs and volunteers

1. **Sign up** as an NGO or a volunteer.
2. Open **Verification** and upload one document:
   - NGOs: NGO Darpan ID or trust/society registration
   - Volunteers: college ID or a government ID (cover all but the last 4 digits)
3. An admin reviews it. You get a notification when you're approved. If you're rejected, the reason is shown and you can submit again.
4. Open **Find food**. Food is listed closest first, with a bar showing how long it stays safe. Filter by veg / non-veg / vegan and distance, or press **Use my location**.
5. Open a listing, choose when you can collect it, and press **Claim**. If two people claim at the same moment, only one gets it.
6. You get a **pickup code**, a countdown, **Message on WhatsApp** and **Directions**.
7. Collect the food and show the code. After pickup you can rate the handover.
8. Can't make it? Press **Cancel my claim** so someone else can collect it. Missing the deadline counts as a no-show, and three no-shows pause claiming for 24 hours.

## Admins

1. **Verification queue** lists new submissions, oldest first, with the applicant's details and earlier rejections.
2. Press **Open document** to view the upload.
3. **Approve** lets them claim straight away. **Reject** needs a reason, which they will see.
4. **Users** lists everyone with their listings, claims and missed pickups.

---

## Demo script for the review (about 8 minutes)

Run `npm run db:setup` just before the review so the demo data is fresh. Use two browser windows (one normal, one private) so you can be logged in as two people.

| Step | Window | Do | Point out |
|---|---|---|---|
| 1 | A | Open http://localhost:5173 | Live "Waiting for pickup" board, impact numbers from views |
| 2 | A | Log in as **Divya** (unverified volunteer) and open any listing | Claiming is blocked; the message comes from `fn_claim_block_reason` |
| 3 | B | Log in as **Admin** and approve Divya | `sp_review_verification` runs as one transaction and sends a notification |
| 4 | A | Refresh and claim the listing | `sp_claim_listing`: row lock, pickup code, deadline. Show the code card and the WhatsApp button |
| 5 | B | Log out and log in as **Kaikoduppom** (or run `npm test` in a terminal) | Try to claim the same listing: "Someone else has already claimed this food" |
| 6 | B | Log in as the listing's **donor** (shown on the listing, for example mess@ for Potheri Mess Hall) | Dashboard shows who is coming; WhatsApp button to them |
| 7 | B | Type a wrong code, then the right one | Wrong code is refused; the right one marks it collected (`sp_confirm_pickup`) |
| 8 | A | Open the listing again | History from `status_log` (trigger), and the rating buttons |
| 9 | Any | Open **Impact** | Each panel names the view behind it: recursive CTE, RANK, LAG, running total, DENSE_RANK |
| 10 | Workbench | Run parts of `db/07_demo_queries.sql` | Missed-pickup release, `EXPLAIN` using the index, `SHOW EVENTS`, the list of triggers and routines |

Ready-made pickup demo: **Annam Trust** already has an active claim on *Idli and coconut chutney* from **Potheri Mess Hall** with code **4821**.
