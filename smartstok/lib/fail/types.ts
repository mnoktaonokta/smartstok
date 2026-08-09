export type FailCustomerSummary = {
  customerId: string;
  customerName: string;
  totalFailCount: number;
  totalCredit: number;
  intakeCount: number;
};

export type FailSupplierSummary = {
  sentTotal: number;
  pendingTotal: number;
  receivedTotal: number;
};

export type FailIntakeListItem = {
  id: string;
  customerId: string;
  customerName: string;
  failCount: number;
  givenCount: number;
  failHoldCount: number;
  creditQuantity: number;
  createdAt: string;
  createdByName: string | null;
  editedAt: string | null;
  editedByName: string | null;
  notes: string | null;
  specs: Array<{
    id: string;
    diameter: number | null;
    length: number | null;
    lotNumber: string | null;
  }>;
  givenProducts: Array<{
    productId: string;
    referenceCode: string;
    productName: string;
    quantity: number;
    disposition: "FAIL_HOLD" | "CONSIGNMENT_EXCESS";
  }>;
};

export type FailAggLine = {
  productId: string;
  referenceCode: string;
  productName: string;
  brand: string;
  quantity: number;
};

export type FailPendingLine = {
  productId: string;
  referenceCode: string;
  productName: string;
  brand: string;
  quantity: number;
};

export type FailPageData = {
  canMutate: boolean;
  customers: Array<{ id: string; name: string }>;
  customerSummary: FailCustomerSummary[];
  supplierSummary: FailSupplierSummary;
  intakesByCustomer: Array<{
    customerId: string;
    customerName: string;
    intakes: FailIntakeListItem[];
  }>;
  aggregation: FailAggLine[];
  pending: FailPendingLine[];
  openCycleId: string | null;
  latestShipmentId: string | null;
};

export type FailShipmentPreview = {
  id: string;
  createdAt: string;
  lines: Array<{
    referenceCode: string;
    productName: string;
    quantity: number;
  }>;
  totalQuantity: number;
};
