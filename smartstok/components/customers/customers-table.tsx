"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CustomerActions } from "@/components/customers/customer-actions";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CustomerListRow = {
  id: string;
  name: string;
  vknTckn: string;
  taxOffice: string | null;
  address: string | null;
  phone: string | null;
  bizimHesapId: string | null;
  utsInstitutionNumber: string | null;
  isPublicEntity: boolean;
  spendingUnitVkn: string | null;
  assignedUser: { id: string; fullName: string } | null;
  locations: Array<{ id: string; name: string }>;
};

export function CustomersTable({
  customers,
  canMutate,
  canDelete,
}: {
  customers: CustomerListRow[];
  canMutate: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return customers;

    return customers.filter((c) => {
      const haystack = [
        c.name,
        c.vknTckn,
        c.assignedUser?.fullName ?? "",
        c.phone ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return haystack.includes(q);
    });
  }, [customers, query]);

  const colCount = canMutate ? 6 : 5;

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ünvan, VKN, temsilci veya telefon ara…"
          className="pl-9"
          aria-label="Müşteri ara"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ünvan</TableHead>
            <TableHead>VKN / TCKN</TableHead>
            <TableHead>Temsilci</TableHead>
            <TableHead>Konsinye Deposu</TableHead>
            <TableHead>Telefon</TableHead>
            {canMutate ? (
              <TableHead className="text-right">İşlem</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="py-10 text-center text-zinc-500"
              >
                Henüz müşteri yok. Yeni müşteri ekleyin veya Admin panelinden
                Bizim Hesap senkronu çalıştırın.
              </TableCell>
            </TableRow>
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="py-10 text-center text-zinc-500"
              >
                Aramanızla eşleşen müşteri bulunamadı.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium text-white">
                  <Link
                    href={`/dashboard/customers/${customer.id}`}
                    className="hover:text-blue-300 hover:underline"
                  >
                    {customer.name}
                  </Link>
                  {customer.isPublicEntity ? (
                    <span className="ml-2 rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-violet-200 uppercase">
                      Kamu
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-blue-300">
                  {customer.vknTckn}
                </TableCell>
                <TableCell className="text-zinc-300">
                  {customer.assignedUser?.fullName ?? (
                    <span className="text-amber-300/80">Atanmamış</span>
                  )}
                </TableCell>
                <TableCell>
                  {customer.locations[0]?.name ?? (
                    <span className="text-amber-300/80">Depo yok</span>
                  )}
                </TableCell>
                <TableCell>{customer.phone ?? "—"}</TableCell>
                {canMutate ? (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <CustomerActions
                        canDelete={canDelete}
                        customer={{
                          id: customer.id,
                          vknTckn: customer.vknTckn,
                          name: customer.name,
                          taxOffice: customer.taxOffice,
                          address: customer.address,
                          phone: customer.phone,
                          bizimHesapId: customer.bizimHesapId,
                          utsInstitutionNumber: customer.utsInstitutionNumber,
                          isPublicEntity: Boolean(customer.isPublicEntity),
                          spendingUnitVkn: customer.spendingUnitVkn ?? null,
                        }}
                      />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
