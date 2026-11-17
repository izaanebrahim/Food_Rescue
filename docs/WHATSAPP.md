# WhatsApp integration

Food Rescue uses WhatsApp in two ways. The first works with no setup at all.

## 1. Click-to-chat buttons (always on)

Once food is claimed, both sides see a green **Message on WhatsApp** button. It opens a link like:

```
https://wa.me/919000000002?text=Hi%20Potheri%20Mess%20Hall%2C%20this%20is%20Karthik...
```

WhatsApp (the phone app, WhatsApp Desktop or WhatsApp Web) opens the chat with this message already typed:

**Claimer → donor**
```
Hi Potheri Mess Hall, this is Karthik Subramani from Annam Trust (Food Rescue).
I've claimed "Idli and coconut chutney" (40 servings).
Pickup code: 4821
I'll collect before 10:50 am from 14 GST Road, Potheri.
```

**Donor → claimer**
```
Hi Karthik Subramani, this is Potheri Mess Hall (Food Rescue).
"Idli and coconut chutney" (40 servings) is ready for you.
Pickup address: 14 GST Road, Potheri
Map: https://maps.google.com/?q=12.8268,80.0407
Please collect before 10:50 am.
```

How it works:

- Phone numbers are stored with the country code, digits only (`919876543210`), because that is the format `wa.me` needs. A CHECK constraint enforces it, and registration adds `91` to a 10-digit number.
- The API reads numbers **only** from the view `v_claim_contacts`, which contains only active claims, and the route also checks that you are the donor or the claimer. Nobody can collect donors' numbers by browsing.
- The message is built in `server/src/services/whatsapp.js` (`claimerToDonorText`, `donorToClaimerText`).

> The demo accounts use made-up numbers (`9190000000xx`), so the chat opens but the number is not on WhatsApp. To test it for real, register with your own number, or change a demo user's phone in Workbench:
> `UPDATE users SET phone = '91XXXXXXXXXX' WHERE email = 'mess@foodrescue.local';`

## 2. Automatic notifications through the WhatsApp Cloud API (optional)

Every in-app notification (claimed, collected, reminder, released, verified) can also be sent as a WhatsApp message from a business number.

### How it is wired

1. Triggers and procedures insert rows into `notifications` with `wa_status = 'pending'`.
2. `server/src/jobs/scheduler.js` checks every 10 seconds for pending rows.
3. If the Cloud API is configured, it sends each one and sets `wa_status` to `sent` or `failed`. If not, it sets `skipped`.

### Setup with Meta's free test number

1. Go to https://developers.facebook.com, create an app and choose **Business** as the type.
2. Add the **WhatsApp** product. Meta gives you a test phone number and a temporary access token.
3. Under **API Setup**, add your own phone number as a recipient and verify it with the code Meta sends.
4. Copy the **Phone number ID** and the **access token** into `server/.env`:

   ```
   WHATSAPP_TOKEN=EAAG...
   WHATSAPP_PHONE_NUMBER_ID=1234567890
   ```

5. Give a demo user your verified number (see the note above) and restart the server. The console should say `WhatsApp Cloud API: on`.

### Templates

WhatsApp only allows businesses to start a conversation with an **approved message template**. Free-form text works only within 24 hours of the user messaging the business. For the test number, the easiest options are:

- **Send a message from your phone to the test number first.** This opens a 24-hour window, and plain-text notifications will arrive.
- **Or create a template** in WhatsApp Manager with one body variable, for example `Food Rescue: {{1}}`. Once it is approved, set:

  ```
  WHATSAPP_TEMPLATE=food_rescue_update
  WHATSAPP_TEMPLATE_LANG=en
  ```

  The notification text is sent as `{{1}}`.

The temporary token expires after 24 hours. For a longer demo, create a System User token in Business Settings.

### Checking what was sent

```sql
SELECT n.type, n.message, n.wa_status, u.phone
FROM notifications n JOIN users u USING (user_id)
ORDER BY n.notification_id DESC LIMIT 20;
```
