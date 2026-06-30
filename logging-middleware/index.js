const axios = require("axios");

const AUTH_URL = "http://4.224.186.213/evaluation-service/auth";
const LOG_URL = "http://4.224.186.213/evaluation-service/logs";

const creds = {
  email: "2303051050975@paruluniversity.ac.in",
  name: "Urvashi Gautam",
  rollNo: "2303051050975",
  accessCode: "cJqaEB",
  clientID: "bfe52750-1f8f-405c-b33b-3e4cb976abaa",
  clientSecret: "QpqZpgpmDgXMXusG",
};

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 30) return cachedToken;

  const res = await axios.post(AUTH_URL, creds);
  cachedToken = res.data.access_token;
  tokenExpiry = res.data.expires_in;
  return cachedToken;
}

async function Log(stack, level, pkg, message) {
  try {
    const token = await getToken();
    await axios.post(
      LOG_URL,
      { stack, level, package: pkg, message },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Logging must never crash the app.
  }
}

module.exports = { Log };