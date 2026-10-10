// Public browser configuration only. Never put service-role or secret keys here.
// Enable only after the private table, redirect settings, and access checks pass.
export const accountConfig = Object.freeze({
  enabled: false,
  supabaseUrl: "https://jxkdcwqezmtkuyvxvben.supabase.co",
  publishableKey: "sb_publishable_PYgdkdPLRd73OvDn1xeojA_6E-euMj9",
  emailSignIn: "link",
  testEmailOnly: true,
});
