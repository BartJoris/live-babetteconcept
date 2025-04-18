// lib/odoo.ts

const ODOO_URL = "/jsonrpc"; // proxy naar https://www.babetteconcept.be/jsonrpc via next.config.js
const ODOO_DB = "babetteconcept";

export async function odooLogin(username: string, password: string): Promise<number | null> {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "common",
      method: "authenticate",
      args: [ODOO_DB, username, password, {}],
    },
    id: Date.now(),
  };

  try {
    const res = await fetch(ODOO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    console.log("🧪 Login payload:", payload);
    console.log("🧪 Login response:", json);
    return json.result || null;
  } catch (err) {
    console.error("❌ Login fetch error:", err);
    throw err;
  }
}

export async function odooCall({
  model,
  method,
  args,
  uid,
  username,
  password,
}: {
  model: string;
  method: string;
  args: any[];
  uid: number;
  username: string;
  password: string;
}): Promise<any> {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, password, model, method, args],
    },
    id: Date.now(),
  };

  try {
    const res = await fetch(ODOO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    console.log(`📦 Odoo call to ${model}.${method}`, { args });
    console.log("📬 Response:", json);

    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result;
  } catch (err) {
    console.error("❌ Odoo call error:", err);
    throw err;
  }
}
