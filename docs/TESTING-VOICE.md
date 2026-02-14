# Testing the Voice + Dial Status Flow

This guide walks through testing the full flow: **incoming call → Press 1 → dial owner → if no answer → MissedCall AI SMS**.

## Prerequisites

- Twilio account with a phone number
- Two phones (or one phone + a friend): one to **call** the Twilio number, one as the **business owner** (forwarding number)
- [ngrok](https://ngrok.com/) installed (so Twilio can reach your local server)

## 1. Run the app and expose it

**Terminal 1 – Next.js:**
```bash
npm run dev
```

**Terminal 2 – ngrok:**
```bash
ngrok http 3000
```
Copy the **HTTPS** URL ngrok shows (e.g. `https://abc123.ngrok-free.app`).

## 2. Set the webhook base URL

In your `.env` (or `.env.local`), set:

```env
NEXT_PUBLIC_APP_URL=https://YOUR-NGROK-URL.ngrok-free.app
```

Restart `npm run dev` after changing env so the app picks it up.  
This URL is used to build the **voice-gather** and **voice-dial-status** callback URLs Twilio will call.

## 3. Configure Twilio webhook

1. Go to [Twilio Console → Phone Numbers → Manage → Active Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming).
2. Click your Twilio phone number.
3. Under **Voice**, set:
   - **A CALL COMES IN**: Webhook
   - **URL**: `https://YOUR-NGROK-URL.ngrok-free.app/api/webhooks/voice`
   - **HTTP**: POST
4. Save.

## 4. Configure the business in your admin

In your app’s admin (e.g. `/admin`):

1. The business must use **this same Twilio number** as its “Twilio phone number”.
2. **Call screener**: Turn **on** (so callers hear “Press 1”).
3. **Forwarding number**: Set the owner’s real phone number (E.164, e.g. `+15551234567`). This is the number that will ring when someone presses 1.
4. Optionally set **AI greeting** and **business name** so the SMS looks right.

Ensure the business record in the DB has `callScreenerEnabled: true` and a valid `forwardingNumber` and `twilioPhoneNumber`.

## 5. Test scenarios

### A. Owner answers (no SMS)

1. From **Phone A**, call your **Twilio number**.
2. Hear “Thank you for calling… To be connected, please press 1.”
3. Press **1**.
4. **Phone B** (forwarding number) should ring. **Answer** on Phone B.
5. You should be on a normal call. **No** MissedCall AI SMS should be sent.

In the server logs you should see something like:  
`✅ Owner answered the call, no SMS needed` (from `voice-dial-status`).

### B. Owner doesn’t answer (SMS sent)

1. From **Phone A**, call your **Twilio number**.
2. Press **1** when prompted.
3. **Phone B** rings — **do not answer** (let it time out or reject).
4. After the dial times out, Twilio will call your **voice-dial-status** webhook.
5. **Phone A** should hear: “Sorry, no one is available right now. We will text you shortly…”
6. **Phone A** should receive the **MissedCall AI greeting SMS** (unless they already had a conversation in the last 24 hours).

In the server logs you should see:  
`📵 Owner did not answer (status: no-answer ), triggering SMS` and `📤 Sent MissedCall AI SMS after missed dial: SM...`.

## 6. Quick checklist

| Step | Done |
|------|------|
| `npm run dev` running | ☐ |
| ngrok running, HTTPS URL copied | ☐ |
| `NEXT_PUBLIC_APP_URL` = ngrok HTTPS URL | ☐ |
| Twilio number webhook = `.../api/webhooks/voice` (POST) | ☐ |
| Business has Twilio number, call screener ON, forwarding number set | ☐ |
| Test A: Press 1, answer on owner phone → no SMS | ☐ |
| Test B: Press 1, don’t answer → SMS to caller | ☐ |

## Troubleshooting

- **Twilio never hits my webhook**  
  - Confirm the Twilio webhook URL is the **ngrok HTTPS** URL (not localhost).  
  - Restart ngrok and update both `.env` and Twilio if the URL changed.

- **Dial status callback not called / wrong URL**  
  - `voice-gather` builds the dial `action` URL from `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL`).  
  - Ensure that env is set to the same base URL Twilio can reach (e.g. ngrok HTTPS).  
  - Restart the Next.js dev server after changing env.

- **No SMS when owner doesn’t answer**  
  - Check server logs for errors in `voice-dial-status`.  
  - Confirm the business has `twilioPhoneNumber` set and that Twilio credentials in `.env` are correct.  
  - If there’s already a conversation for that caller in the last 24 hours, the app intentionally skips sending another greeting SMS.

- **“Business not found” in dial-status**  
  - The `businessId` is passed in the dial-status URL by `voice-gather`.  
  - Ensure the business in the admin is the same one used when the call came in (same Twilio number).
