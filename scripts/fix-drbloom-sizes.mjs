#!/usr/bin/env node

/**
 * Dr Bloom size swap script.
 *
 * Renames the size attribute values on Dr Bloom products from
 * "S - 36" / "M - 38" to "S / M" / "M / L" while preserving
 * barcode, cost price, and weight on each variant.
 *
 * Usage:
 *   node scripts/fix-drbloom-sizes.mjs                  # dry run (default)
 *   node scripts/fix-drbloom-sizes.mjs --execute        # actually perform changes
 */

// ─── Configuration ──────────────────────────────────────────────────────────
const CONFIG = {
  url: "https://drbloom2.odoo.com/jsonrpc",
  db: "drbloom2",
  user: "margot@babetteconcept.be",
  password: "JanneJoris2020",
};
// ─────────────────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--execute");

async function rpc(uid, model, method, args, kwargs) {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    id: Date.now(),
    params: {
      service: "object",
      method: "execute_kw",
      args: [CONFIG.db, uid, CONFIG.password, model, method, args, kwargs || {}],
    },
  };
  const res = await fetch(CONFIG.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.error)
    throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

async function authenticate() {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    id: 1,
    params: {
      service: "common",
      method: "authenticate",
      args: [CONFIG.db, CONFIG.user, CONFIG.password, {}],
    },
  };
  const res = await fetch(CONFIG.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function main() {
  console.log(`\n=== Dr Bloom size swap (${DRY_RUN ? "DRY RUN" : "EXECUTING"}) ===`);
  console.log(`Target: ${CONFIG.url} / ${CONFIG.db}\n`);

  const uid = await authenticate();
  console.log("Authenticated as UID:", uid);

  // Find MAAT Volwassenen attribute
  const attrs = await rpc(uid, "product.attribute", "search_read",
    [[["name", "=", "MAAT Volwassenen"]]], { fields: ["id"] });
  if (!attrs.length) throw new Error("MAAT Volwassenen attribute not found");
  const MAAT_ID = attrs[0].id;

  // Find existing S-36 and M-38 value IDs
  const s36Vals = await rpc(uid, "product.attribute.value", "search_read",
    [[["attribute_id", "=", MAAT_ID], ["name", "=", "S - 36"]]], { fields: ["id"] });
  const m38Vals = await rpc(uid, "product.attribute.value", "search_read",
    [[["attribute_id", "=", MAAT_ID], ["name", "=", "M - 38"]]], { fields: ["id"] });
  if (!s36Vals.length || !m38Vals.length) throw new Error("S - 36 or M - 38 not found under MAAT Volwassenen");
  const OLD_S = s36Vals[0].id;
  const OLD_M = m38Vals[0].id;
  console.log(`Found: S - 36 (id=${OLD_S}), M - 38 (id=${OLD_M})`);

  // Step 1: Create or find "S / M" and "M / L" attribute values
  console.log("\n--- Step 1: Ensure S / M and M / L attribute values exist ---");
  let smId, mlId;

  const existingSM = await rpc(uid, "product.attribute.value", "search_read",
    [[["attribute_id", "=", MAAT_ID], ["name", "=", "S / M"]]], { fields: ["id"] });
  const existingML = await rpc(uid, "product.attribute.value", "search_read",
    [[["attribute_id", "=", MAAT_ID], ["name", "=", "M / L"]]], { fields: ["id"] });

  if (existingSM.length) {
    smId = existingSM[0].id;
    console.log(`S / M already exists (id=${smId})`);
  } else if (DRY_RUN) {
    smId = -1;
    console.log("S / M would be created");
  } else {
    smId = await rpc(uid, "product.attribute.value", "create",
      [{ attribute_id: MAAT_ID, name: "S / M" }]);
    console.log(`Created S / M (id=${smId})`);
  }

  if (existingML.length) {
    mlId = existingML[0].id;
    console.log(`M / L already exists (id=${mlId})`);
  } else if (DRY_RUN) {
    mlId = -1;
    console.log("M / L would be created");
  } else {
    mlId = await rpc(uid, "product.attribute.value", "create",
      [{ attribute_id: MAAT_ID, name: "M / L" }]);
    console.log(`Created M / L (id=${mlId})`);
  }

  // Step 2: Find Dr Bloom templates that use S-36 / M-38
  console.log("\n--- Step 2: Find Dr Bloom templates to update ---");
  const templates = await rpc(uid, "product.template", "search_read",
    [[["name", "like", "Dr Bloom"]]],
    { fields: ["id", "name", "attribute_line_ids", "product_variant_count"], limit: false });

  const toProcess = [];
  for (const tmpl of templates) {
    if (tmpl.product_variant_count <= 1 || !tmpl.attribute_line_ids?.length) continue;
    const lines = await rpc(uid, "product.template.attribute.line", "search_read",
      [[["id", "in", tmpl.attribute_line_ids], ["attribute_id", "=", MAAT_ID]]],
      { fields: ["id", "value_ids"] });
    if (!lines.length) continue;
    const line = lines[0];
    if (line.value_ids.includes(OLD_S) || line.value_ids.includes(OLD_M)) {
      toProcess.push({ tmpl, line });
    }
  }
  console.log(`Found ${toProcess.length} templates to update`);

  if (toProcess.length === 0) {
    console.log("\nNothing to do. Templates may already be updated.");
    return;
  }

  // Step 3: Save-Swap-Restore for each template
  console.log("\n--- Step 3: Save-Swap-Restore ---\n");
  let successCount = 0;
  const allToArchive = [];

  for (const { tmpl, line } of toProcess) {
    console.log(`${tmpl.name} (tmpl=${tmpl.id}, PTAL=${line.id})`);

    // 3a: Read all current variants and resolve sizes
    const variants = await rpc(uid, "product.product", "search_read",
      [[["product_tmpl_id", "=", tmpl.id]]],
      { fields: ["id", "barcode", "standard_price", "weight", "active", "product_template_variant_value_ids"],
        context: { active_test: false } });

    const variantData = [];
    for (const v of variants) {
      let sizeValId = null;
      if (v.product_template_variant_value_ids?.length) {
        const ptavs = await rpc(uid, "product.template.attribute.value", "search_read",
          [[["id", "in", v.product_template_variant_value_ids], ["attribute_id", "=", MAAT_ID]]],
          { fields: ["product_attribute_value_id"] });
        if (ptavs.length) sizeValId = ptavs[0].product_attribute_value_id[0];
      }
      variantData.push({ ...v, sizeValId });
    }

    // 3b: Save data from old variants
    const oldS = variantData.find((v) => v.sizeValId === OLD_S && v.barcode);
    const oldM = variantData.find((v) => v.sizeValId === OLD_M && v.barcode);
    const savedS = oldS ? { id: oldS.id, barcode: oldS.barcode, cost: oldS.standard_price, weight: oldS.weight } : null;
    const savedM = oldM ? { id: oldM.id, barcode: oldM.barcode, cost: oldM.standard_price, weight: oldM.weight } : null;

    if (savedS) console.log(`  Saved S-36 [${savedS.id}]: barcode=${savedS.barcode} cost=${savedS.cost} weight=${savedS.weight}`);
    if (savedM) console.log(`  Saved M-38 [${savedM.id}]: barcode=${savedM.barcode} cost=${savedM.cost} weight=${savedM.weight}`);

    if (DRY_RUN) {
      const newValueIds = line.value_ids.map((vid) => {
        if (vid === OLD_S) return "S/M";
        if (vid === OLD_M) return "M/L";
        return vid;
      });
      console.log(`  Would swap PTAL: [${line.value_ids}] -> [${newValueIds}]`);
      console.log(`  Would restore data to new variants and archive old ones\n`);
      successCount += (savedS ? 1 : 0) + (savedM ? 1 : 0);
      continue;
    }

    // 3c: Clear barcodes on old variants (free unique constraint)
    const toClear = [savedS?.id, savedM?.id].filter(Boolean);
    if (toClear.length) {
      await rpc(uid, "product.product", "write", [toClear, { barcode: false }]);
      console.log(`  Cleared barcodes on: ${toClear.join(", ")}`);
    }

    // 3d: Swap PTAL value_ids
    const newValueIds = line.value_ids.map((vid) => {
      if (vid === OLD_S) return smId;
      if (vid === OLD_M) return mlId;
      return vid;
    });
    await rpc(uid, "product.template.attribute.line", "write",
      [[line.id], { value_ids: [[6, 0, newValueIds]] }]);
    console.log(`  PTAL swapped: [${line.value_ids}] -> [${newValueIds}]`);

    // 3e: Read new active variants and restore data
    const newVariants = await rpc(uid, "product.product", "search_read",
      [[["product_tmpl_id", "=", tmpl.id], ["active", "=", true]]],
      { fields: ["id", "product_template_variant_value_ids"] });

    for (const nv of newVariants) {
      if (!nv.product_template_variant_value_ids?.length) continue;
      const ptavs = await rpc(uid, "product.template.attribute.value", "search_read",
        [[["id", "in", nv.product_template_variant_value_ids], ["attribute_id", "=", MAAT_ID]]],
        { fields: ["product_attribute_value_id", "name"] });
      if (!ptavs.length) continue;
      const valId = ptavs[0].product_attribute_value_id[0];
      const name = ptavs[0].name;

      let source = null;
      if (valId === smId && savedS) source = savedS;
      if (valId === mlId && savedM) source = savedM;

      if (source) {
        await rpc(uid, "product.product", "write", [[nv.id], {
          barcode: source.barcode,
          standard_price: source.cost,
          weight: source.weight,
        }]);
        console.log(`  Restored [${nv.id}] ${name}: barcode=${source.barcode} cost=${source.cost} weight=${source.weight}`);
        allToArchive.push(source.id);
        successCount++;
      }
    }

    // 3f: Archive orphan variants (no size attribute value)
    for (const v of variantData) {
      if ((!v.sizeValId || v.sizeValId === OLD_S || v.sizeValId === OLD_M) && v.active !== false) {
        if (!allToArchive.includes(v.id)) allToArchive.push(v.id);
      }
    }
    console.log("");
  }

  // Step 4: Archive old variants
  if (!DRY_RUN && allToArchive.length > 0) {
    const unique = [...new Set(allToArchive)];
    console.log(`--- Step 4: Archiving ${unique.length} old variants ---`);
    await rpc(uid, "product.product", "write", [unique, { active: false }]);
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN" : "DONE"}: ${successCount} variants ${DRY_RUN ? "would be" : ""} updated ===\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
