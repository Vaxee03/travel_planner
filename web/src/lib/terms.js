// Terms agreement. Every account needs one recorded on users/{uid}
// (termsVersion + termsAgreedAt): App asks for it after sign-in when it's
// missing or older than TERMS_VERSION — new Google/Kakao sign-ups, accounts
// from before this existed, and everyone again after a terms change.
// No Firestore here (the login screen imports this); the write lives in
// users.js.

/** Bump when the terms or privacy policy change in a way that needs a new
 * agreement — everyone is asked again on their next sign-in. */
export const TERMS_VERSION = "2026-10-03";

// The email sign-up form has its own required checkbox; remember that the
// account being created agreed, so App records it instead of asking again.
let agreedAtSignup = false;
export function noteAgreedAtSignup() { agreedAtSignup = true; }
export function takeAgreedAtSignup() {
  const agreed = agreedAtSignup;
  agreedAtSignup = false;
  return agreed;
}
