// lib/odoo.ts

const ODOO_URL = "https://www.babetteconcept.be/jsonrpc";
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

  const res = await fetch(ODOO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  return json.result || null;
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

  const res = await fetch(ODOO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}
