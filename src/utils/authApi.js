/**
 * Phone-OTP login against the SaveLife backend.
 *
 * The app never talks to MSG91 and never holds an MSG91 credential. It asks
 * our own API for a code and asks it again whether a code is right; the SMS
 * provider, the auth key and the approved template all live server-side. A key
 * shipped in an app binary is a published key.
 *
 * Every function here resolves to { ok, message, ... } and never throws for a
 * server-side refusal, so a screen can render the message it gets back without
 * a try/catch around every call. A network failure is turned into the same
 * shape, because to someone standing in an emergency "no signal" and "server
 * said no" need the same thing: a readable sentence and a working retry.
 */

const AUTH_API = "https://api.savelife.health/api/app/auth";

// Long enough for a slow Indian mobile connection, short enough that a dead
// network does not leave the button spinning with no explanation.
const TIMEOUT_MS = 20000;

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${AUTH_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // A proxy or a cold start can answer with HTML. Parsing that as JSON
    // throws inside the try and would otherwise read as a network failure.
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!data) {
      return { ok: false, code: "BAD_RESPONSE", message: "Something went wrong. Please try again." };
    }

    return {
      ok: res.ok && data.success !== false,
      status: res.status,
      code: data.code || null,
      message: data.message || null,
      data,
    };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "TIMEOUT" : "NETWORK",
      message: aborted
        ? "That took too long. Check your connection and try again."
        : "Could not reach SaveLife. Check your connection and try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the backend to SMS a login code to this number.
 * @param {string} phone  10 digits, no country code.
 */
export async function requestOtp(phone) {
  const r = await post("/send-otp", { phone });
  if (r.ok) {
    return {
      ok: true,
      // Present only while the backend's test-number mode is on. Lets the
      // flow be driven without a handset; absent in normal operation.
      testOtp: r.data?.testOtp ?? null,
      message: r.message || `OTP sent to ${phone}.`,
    };
  }
  return { ok: false, code: r.code, message: r.message || "Could not send the OTP. Please try again." };
}

/**
 * Check a code and, if it is right, get back a session token.
 * @returns {{ok: boolean, token?: string, code?: string, message: string}}
 */
export async function verifyOtp(phone, otp) {
  const r = await post("/verify-otp", { phone, otp });

  if (r.ok && r.data?.token) {
    return { ok: true, token: r.data.token, message: r.message || "Verified." };
  }

  // The backend already words these for a customer to read, so they are passed
  // through rather than replaced. The code is kept so a screen can react to
  // the KIND of failure -- an expired code needs a resend, a wrong one needs
  // another go at the boxes.
  return {
    ok: false,
    code: r.code || "OTP_INVALID",
    message: r.message || "That code did not work. Please try again.",
  };
}

export const OTP_LENGTH = 6;
