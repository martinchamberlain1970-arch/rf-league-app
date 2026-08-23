import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!url || !key) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers });
  const { token } = await context.params;
  if (!/^[a-f0-9]{48}$/i.test(token)) return NextResponse.json({ error: "Invoice not found." }, { status: 404, headers });
  const client = createClient(url, key);
  const invoiceRes = await client.from("league_invoices").select("id,batch_id,invoice_number,club_name,recipient_names,items,total_pence,status,issued_at,paid_at").eq("public_token", token).maybeSingle();
  if (invoiceRes.error) return NextResponse.json({ error: invoiceRes.error.message }, { status: 400, headers });
  if (!invoiceRes.data) return NextResponse.json({ error: "Invoice not found." }, { status: 404, headers });
  const batchRes = await client.from("league_invoice_batches").select("league_name,treasurer_name,issue_date,due_date,payment_instructions").eq("id", invoiceRes.data.batch_id).maybeSingle();
  if (batchRes.error) return NextResponse.json({ error: batchRes.error.message }, { status: 400, headers });
  if (!batchRes.data) return NextResponse.json({ error: "Invoice batch not found." }, { status: 404, headers });
  return NextResponse.json({ invoice: invoiceRes.data, batch: batchRes.data }, { headers });
}
