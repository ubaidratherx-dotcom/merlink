/**
 * SMS delivery. Uses Twilio's REST API when TWILIO_* env vars are set,
 * otherwise logs the message to the server console (development).
 */
async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.log(`[DEV SMS] To: ${to} — ${body}`);
    return;
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) {
    console.error(`[sms] Twilio request failed (${res.status}): ${await res.text()}`);
  }
}

async function sendOtp(phone: string, code: string): Promise<void> {
  await sendSms(phone, `Your Merlink verification code is ${code}. It expires in 10 minutes.`);
}

export const smsService = { sendSms, sendOtp };
