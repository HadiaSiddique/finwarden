"use client";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import type { DashboardData } from "@/services/dashboard";
import { dateTime, money, shortDate } from "./api";
import { StatusPill } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

// Follows the app's light and dark tokens.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--text)",
  headerBackgroundColor: "var(--surface-2)",
  borderColor: "var(--border)",
  accentColor: "var(--accent)",
  oddRowBackgroundColor: "var(--surface)",
  rowHoverColor: "var(--surface-2)",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
});

function Grid<T>({ rows, cols, height = 520 }: { rows: T[]; cols: ColDef<T>[]; height?: number }) {
  return (
    <div className="card overflow-hidden" style={{ height }}>
      <AgGridReact<T> theme={theme} rowData={rows} columnDefs={cols} defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1, minWidth: 110 }} animateRows />
    </div>
  );
}

const moneyCol = <T,>(field: keyof T & string, header: string): ColDef<T> => ({
  field: field as never,
  headerName: header,
  type: "numericColumn",
  valueFormatter: (p) => money(p.value as number),
  minWidth: 120,
});

type Invoice = DashboardData["invoices"][number];
export function InvoicesGrid({ rows, act }: { rows: Invoice[]; act: (action: "send" | "remind" | "check", invoiceId: string) => void }) {
  return (
    <Grid<Invoice>
      rows={rows}
      cols={[
        {
          headerName: "PayPal",
          minWidth: 260,
          sortable: false,
          filter: false,
          cellRenderer: (p: { data: Invoice }) =>
            p.data.status === "PAID" ? (
              <span className="text-xs text-muted">Paid</span>
            ) : !p.data.paypalInvoiceId ? (
              <span className="flex gap-1">
                <a className="btn py-0.5 text-xs" href={`/pay/${p.data.id}`} target="_blank" rel="noreferrer">
                  Pay link
                </a>
                <button className="btn py-0.5 text-xs" onClick={() => act("send", p.data.id)}>
                  Send PayPal invoice
                </button>
              </span>
            ) : (
              <span className="flex gap-1">
                <button className="btn py-0.5 text-xs" onClick={() => act("remind", p.data.id)}>
                  Remind
                </button>
                <button className="btn py-0.5 text-xs" onClick={() => act("check", p.data.id)}>
                  Paid?
                </button>
              </span>
            ),
        },
        { field: "number", headerName: "Invoice", maxWidth: 130 },
        { field: "client", headerName: "Client" },
        { field: "description", headerName: "For" },
        moneyCol<Invoice>("amount", "Amount"),
        { field: "status", headerName: "Status", cellRenderer: (p: { data: Invoice }) => <StatusPill status={p.data.daysOverdue > 0 ? "OVERDUE" : p.data.status} /> },
        { field: "dueAt", headerName: "Due", valueFormatter: (p) => shortDate(p.value) },
        { field: "daysOverdue", headerName: "Days overdue", type: "numericColumn", cellClass: (p) => (p.value > 0 ? "text-red font-semibold" : "") },
        { field: "reminderStage", headerName: "Reminders sent", type: "numericColumn" },
      ]}
    />
  );
}

type Intent = DashboardData["intents"][number];
export function PaymentsGrid({ rows }: { rows: Intent[] }) {
  return (
    <Grid<Intent>
      rows={rows}
      cols={[
        { field: "payeeName", headerName: "Payee" },
        moneyCol<Intent>("amount", "Amount"),
        { headerName: "Pays to", valueGetter: (p) => `${p.data!.payout.method.replace("_", " ")}: ${p.data!.payout.receiver}`, minWidth: 220 },
        { field: "invoiceNumber", headerName: "Invoice" },
        { field: "status", headerName: "Status", cellRenderer: (p: { data: Intent }) => <StatusPill status={p.data.openRed ? "HELD" : p.data.status} /> },
        { headerName: "Flags", valueGetter: (p) => p.data!.flags.filter((f) => !f.resolvedAt).map((f) => f.ruleId).join(" ") || "–" },
        { headerName: "Approvals", valueGetter: (p) => `${p.data!.approvers.length}/${p.data!.requiredApprovers}`, maxWidth: 120 },
        { field: "createdAt", headerName: "Created", valueFormatter: (p) => dateTime(p.value), sort: "desc" },
      ]}
    />
  );
}

type Audit = DashboardData["audit"][number];
export function AuditGrid({ rows }: { rows: Audit[] }) {
  return (
    <Grid<Audit>
      height={620}
      rows={rows}
      cols={[
        { field: "at", headerName: "When", valueFormatter: (p) => dateTime(p.value), maxWidth: 150 },
        { field: "actor", headerName: "Who", maxWidth: 140 },
        { field: "action", headerName: "What", maxWidth: 200 },
        { headerName: "Rules", valueGetter: (p) => p.data!.ruleIds.join(" ") || "–", maxWidth: 110 },
        { field: "why", headerName: "Why", flex: 3, wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.4", paddingTop: 6, paddingBottom: 6 } },
      ]}
    />
  );
}
