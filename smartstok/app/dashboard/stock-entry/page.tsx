import { redirect } from "next/navigation";

/** Eski yol — yeni Akıllı Mal Kabul ekranına yönlendir */
export default function StockEntryRedirectPage() {
  redirect("/dashboard/malkabul");
}
