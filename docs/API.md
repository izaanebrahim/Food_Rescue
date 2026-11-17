# API reference

Base URL: `http://localhost:5000/api`. In development the React app calls `/api/...` and Vite forwards it.

Send the token from login or register as `Authorization: Bearer <token>`. Errors always look like `{ "error": "message" }`.

| Status | Meaning |
|---|---|
| 400 | A rule was broken. The message usually comes straight from a trigger or procedure (`SIGNAL SQLSTATE '45000'`) or a CHECK constraint |
| 401 | Not logged in, or wrong password |
| 403 | Logged in, but this account type cannot do it |
| 404 | Not found, or not yours |
| 409 | Duplicate (email, phone, feedback, pending verification) |

## Auth

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | anyone | `full_name, email, phone, password, role (donor\|ngo\|volunteer), org_name, address, lat, lng`. A 10-digit phone gets `91` prepended. Returns `{ token, user }` |
| POST | `/auth/login` | anyone | `email, password` → `{ token, user }` |
| GET | `/auth/me` | logged in | Current user |
| PATCH | `/auth/me` | logged in | `address, lat, lng, org_name` |

## Listings

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/listings?lat=&lng=&radius=&food_type=` | anyone | With lat/lng: `CALL sp_nearby_listings`, closest first, with `distance_km`. Without: `v_available_listings` by time left |
| GET | `/listings/mine` | donor | All of the donor's listings, with whoever is collecting |
| GET | `/listings/:id` | anyone | Listing details. If the viewer has a claim on it, `myClaim` includes the pickup code |
| GET | `/listings/:id/history` | logged in | Rows from `status_log` |
| POST | `/listings` | donor | `title, description, food_type, category, quantity_servings, prepared_at, expires_at, pickup_address, lat, lng, pickup_notes` (lat/lng default to the donor's) |
| POST | `/listings/:id/cancel` | donor (owner) | `CALL sp_cancel_listing` |
| POST | `/listings/:id/claim` | verified NGO / volunteer | `window_minutes` (15–120, default 45). `CALL sp_claim_listing` → `{ claim_id, pickup_code, pickup_deadline }` |
| POST | `/listings/:id/confirm-pickup` | donor (owner) | `code` (4 digits). `CALL sp_confirm_pickup` |
| GET | `/listings/:id/contact` | donor (owner) | From `v_claim_contacts`: the claimer's name, phone and a `whatsapp` link with a ready-written message |

## Claims

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/claims/mine` | NGO / volunteer | Active claims first, then history |
| GET | `/claims/:id/contact` | the claimer | From `v_claim_contacts`: the donor's name, phone, `whatsapp` link and Google Maps `maps` link. 404 for anyone else |
| POST | `/claims/:id/cancel` | the claimer | `CALL sp_cancel_claim`; the food goes back on the map |
| POST | `/claims/:id/feedback` | the claimer | `rating` (1–5), `comment` |

## Verification

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/verification/me` | NGO / volunteer | Current status and past submissions |
| POST | `/verification` | NGO / volunteer | `multipart/form-data`: `document_type`, `document_ref`, `document` (PDF/JPG/PNG ≤ 5 MB). NGOs: `ngo_darpan`, `ngo_registration`; volunteers: `college_id`, `govt_id` |

## Admin

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/verifications?status=pending\|approved\|rejected` | Queue with the applicant's details |
| GET | `/admin/verifications/:id/document` | Streams the uploaded file |
| POST | `/admin/verifications/:id/review` | `decision (approved\|rejected)`, `remarks` (required when rejecting). `CALL sp_review_verification` |
| GET | `/admin/users` | All users with listing/claim counts |

## Reports (public)

| Path | View |
|---|---|
| `/reports/summary` | `v_platform_summary` |
| `/reports/daily` | `v_daily_rescues_30d` |
| `/reports/monthly` | `v_monthly_impact` |
| `/reports/top-donors` | `v_top_donors` |
| `/reports/reliability` | `v_claimer_reliability` |
| `/reports/speed` | averages over `v_rescue_speed` |

## Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Latest 50 and the unread count |
| POST | `/notifications/read-all` | Marks all as read |

## Health

`GET /health` → `{ ok, db_time, event_scheduler, whatsapp_cloud_api }`
