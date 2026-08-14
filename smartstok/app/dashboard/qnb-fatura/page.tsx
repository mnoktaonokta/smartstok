import { redirect } from "next/navigation";

/** Eski URL — yer imleri için yönlendirme */
export default function QnbFaturaRedirectPage() {
  redirect("/dashboard/e-belge-fatura");
}
