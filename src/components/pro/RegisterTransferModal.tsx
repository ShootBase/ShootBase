import { useState } from "react";
import { X, Upload } from "lucide-react";
import { toast } from "sonner";
import { submitBankTransferRequest } from "@/lib/bank-transfers.functions";
import { formatPence } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import type { CountryPackage, CountrySubPlan } from "@/lib/country-pricing";

type Item = CountryPackage | CountrySubPlan;

function itemId(i: Item): string {
  return "id" in i ? i.id : i.price_id;
}
function itemCredits(i: Item): number {
  return i.credits;
}
function itemAmount(i: Item): number {
  return i.price_pence;
}
function itemLabel(i: Item): string {
  return `${i.name} · ${i.credits} coins`;
}

// Static Nigeria deposit account — surfaced in the form so the pro can pay
// before submitting the reference. Update via DB/settings later if needed.
const NG_DEPOSIT_ACCOUNT = {
  bankName: "Providus Bank",
  accountName: "ShootBase Nigeria Ltd",
  accountNumber: "1301234567",
};

export function RegisterTransferModal({
  open,
  onClose,
  packages,
  subPlan,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  packages: CountryPackage[];
  subPlan: CountrySubPlan | null;
  onSubmitted?: () => void;
}) {
  const allItems: Item[] = subPlan ? [subPlan, ...packages] : packages;
  const [selectedId, setSelectedId] = useState<string>(allItems[0] ? itemId(allItems[0]) : "");
  const [amount, setAmount] = useState<string>("");
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");
  const [senderName, setSenderName] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const selected = allItems.find((i) => itemId(i) === selectedId) ?? allItems[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!bankName.trim() || !reference.trim() || !senderName.trim() || !paymentDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const paidMinor = Math.round(Number(amount || "0") * 100);
    if (!paidMinor || paidMinor <= 0) {
      toast.error("Enter the amount you paid.");
      return;
    }
    setSubmitting(true);

    // Optional receipt upload to private bucket under <userId>/<timestamp>-<name>
    let receiptPath: string | null = null;
    if (receiptFile) {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) throw new Error("Not signed in");
        const safe = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${uid}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("bank-transfer-receipts")
          .upload(path, receiptFile, { contentType: receiptFile.type, upsert: false });
        if (upErr) throw upErr;
        receiptPath = path;
      } catch (err: any) {
        setSubmitting(false);
        toast.error(`Receipt upload failed: ${err?.message || err}`);
        return;
      }
    }

    const res = await submitBankTransferRequest({
      data: {
        packageId: itemId(selected),
        credits: itemCredits(selected),
        amountMinor: paidMinor,
        currency: "NGN",
        bankName: bankName.trim(),
        transferReference: reference.trim(),
        senderAccountName: senderName.trim(),
        paymentDate,
        receiptPath,
        note: note.trim() || null,
      },
    });
    setSubmitting(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Bank transfer submitted — pending admin review.");
    onSubmitted?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-white max-w-xl w-full mt-8 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#E8E5DF]">
          <div>
            <p className="font-display text-xl text-[#1E1E1E]">Register bank transfer</p>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              We'll review your payment and credit your coins once verified.
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} className="text-[#6B6B6B] hover:text-[#1E1E1E] p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pt-5 pb-2">
          <div className="border border-[#E8E5DF] bg-[#FBF7EE] rounded-lg p-4 text-sm">
            <p className="font-display text-base mb-2">Pay into this account</p>
            <p><b>Bank:</b> {NG_DEPOSIT_ACCOUNT.bankName}</p>
            <p><b>Account name:</b> {NG_DEPOSIT_ACCOUNT.accountName}</p>
            <p><b>Account number:</b> {NG_DEPOSIT_ACCOUNT.accountNumber}</p>
            <p className="text-xs text-[#6B6B6B] mt-2">
              Use your professional email as the transfer narration so we can match it faster.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Coin package</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
            >
              {allItems.map((i) => (
                <option key={itemId(i)} value={itemId(i)}>
                  {itemLabel(i)} — {formatPence(itemAmount(i), "NG")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Amount paid (₦)</label>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={selected ? String(itemAmount(selected) / 100) : ""}
                className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Payment date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Your bank name</label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Transfer reference / ID</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Sender account name</label>
            <input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-[#E8E5DF] rounded-md px-3 py-2 mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#6B6B6B]">Receipt / screenshot (optional)</label>
            <label className="mt-1 flex items-center gap-2 border border-dashed border-[#E8E5DF] rounded-md px-3 py-3 text-sm cursor-pointer hover:bg-[#FBF7EE]">
              <Upload className="h-4 w-4 text-[#6B6B6B]" />
              <span className="text-[#1E1E1E]">
                {receiptFile ? receiptFile.name : "Choose file (PNG, JPG, PDF — max 5MB)"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 5 * 1024 * 1024) {
                    toast.error("File too large (max 5MB).");
                    return;
                  }
                  setReceiptFile(f);
                }}
              />
            </label>
          </div>


          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs uppercase tracking-widest border border-[#E8E5DF] px-4 py-2 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-xs uppercase tracking-widest bg-[#1E1E1E] text-white px-4 py-2 rounded-md disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
