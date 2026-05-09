"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { useAuth } from "@/components/auth-provider";
import { usesEmailLogin, validateReplacementCredentialForRole } from "@/lib/credentials";
import { listCashLedgerEntries } from "@/lib/cash-ledger";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { hasClientFirebaseConfig } from "@/lib/firebase/env";
import { listHallBookings } from "@/lib/hall-bookings";
import { listOpeningFloatChecks } from "@/lib/opening-float-checks";
import { listStaffRota } from "@/lib/staff-rota";
import { tillNameFromShiftLabel } from "@/lib/till-prize-payouts";
import {
  canApproveTillSubmission,
  canManageOpeningFloatChecks,
  canRecordSafeTillTopUps,
  canViewCashControl,
  canViewGolfSociety,
  canViewAuditLog,
  canManageMembership,
  canManagePayroll,
  canManagePoolLeagueDisplay,
  canViewSecretaryCashLog,
  canManageUsers,
  canManageTillAdjustments,
  canViewMembership,
  canViewHallBookings,
  canViewReports,
  canViewSafeBalance,
  canViewTillControl,
  canViewWeeklyTakings,
  isStaffLikeRole,
  roleLabel,
} from "@/lib/roles";
import { listSafeBalances } from "@/lib/safe-balance";
import { staffContractDocuments } from "@/lib/staff-contract-documents";
import { listApprovalQueue, listRecentTillSubmissions, listTillSubmissions } from "@/lib/till-submissions";
import { listWeeklyReports, setWeeklyReportGmReviewComplete } from "@/lib/weekly-reports";
import type { BookkeeperDocument, CashLedgerEntry, FinanceMonthClose, Metric, SafeBalance, TillSubmission, WeeklyTakingsReport, HallBooking, WeeklyAreaDaySummary, WeeklyVarianceReview, OpeningFloatCheck, PayrollStaffMember, RotaShift } from "@/lib/types";

type DashboardVarianceEntry = {
  areaName: "Games" | "Lounge" | "Hall";
  shiftDate: string;
  shiftLabel: string;
  submittedBy: string;
  variance: number;
  source: "imported-workbook" | "live-till-submission";
};

type RoleGuideItem = {
  title: string;
  body: string;
};

type RoleGuideContent = {
  title: string;
  instructions: RoleGuideItem[];
  faqs: RoleGuideItem[];
};

type AttentionQueueItem = {
  title: string;
  countLabel: string;
  detail: string;
  href: string;
};

const clubHubGovernanceCards: RoleGuideItem[] = [
  {
    title: "About Club Hub",
    body: "Club Hub is the Club's internal operations and governance system. It supports daily cash control, till balancing, safe records, weekly and monthly finance review, membership administration, hall bookings, staff rota, payroll preparation, annual leave records, audit logs and role-based oversight.",
  },
  {
    title: "System Credits",
    body: "Club Hub has been designed, developed and implemented by Martin Chamberlain, Treasurer, for the operational benefit of Greenhithe Legion Social Club. Development has been provided to the Club free of charge as donated professional labour, with AI-assisted software development support used during build, testing and refinement.",
  },
  {
    title: "Data & Legal",
    body: "Club Hub supports record keeping and decision-making but does not replace the responsibility of Club officers, employees and Committee members to check, authorise and retain appropriate records. The accuracy of reports and controls depends on users entering complete and accurate information at the right time.",
  },
];

const LIVE_TILL_DIFFERENCE_START_DATE = "2026-03-31";
const OPENING_FLOAT_TREND_START_DATE = "2026-05-01";

function normaliseFloatDenominationLabel(value: unknown) {
  return String(value || "").replace(/gbp/gi, "£").replace(/\s+/g, "").toLowerCase();
}

function openingFloatBreakdownsDiffer(check: OpeningFloatCheck) {
  const expected = new Map(
    (check.expectedDenominationBreakdown ?? []).map((line) => [
      normaliseFloatDenominationLabel(line.label),
      Math.round(Number(line.amount || 0) * 100) / 100,
    ]),
  );
  const actual = new Map(
    (check.denominationBreakdown ?? []).map((line) => [
      normaliseFloatDenominationLabel(line.label),
      Math.round(Number(line.amount || 0) * 100) / 100,
    ]),
  );
  if (expected.size === 0 || actual.size === 0) return false;
  const labels = new Set([...expected.keys(), ...actual.keys()]);
  return [...labels].some((label) => Math.abs((actual.get(label) ?? 0) - (expected.get(label) ?? 0)) > 0.009);
}

function openingFloatNeedsTrendAction(check: OpeningFloatCheck) {
  if (check.entryDate < OPENING_FLOAT_TREND_START_DATE) return false;
  if (check.standardConfirmed || check.trendActionRecordedAt || !check.floatBagNumber) return false;
  return Math.abs(check.actualAmount - check.expectedAmount) > 0.009 || openingFloatBreakdownsDiffer(check);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function weekEndingForDate(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = (7 - day) % 7;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next.toISOString().slice(0, 10);
}

function plusIsoDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function weeklyReviewDueAt(weekEnding: string) {
  return new Date(`${plusIsoDays(weekEnding, 2)}T23:59:59`);
}

function isoLocalDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function matchingVarianceReview(
  entry: Pick<DashboardVarianceEntry, "areaName" | "shiftDate" | "shiftLabel">,
  reviews: WeeklyVarianceReview[],
) {
  const exactMatch = reviews.find(
    (review) =>
      review.areaName === entry.areaName &&
      (review.shiftDate ?? "") === entry.shiftDate &&
      (review.shiftLabel ?? "") === entry.shiftLabel,
  );
  if (exactMatch) return exactMatch;

  const sameDayMatches = reviews.filter(
    (review) =>
      review.areaName === entry.areaName &&
      (review.shiftDate ?? "") === entry.shiftDate,
  );

  return sameDayMatches.length === 1 ? sameDayMatches[0] : undefined;
}

function needsTreasurerEscalation(entry: Pick<DashboardVarianceEntry, "variance">) {
  return Math.abs(entry.variance) >= 20;
}

function grossSalesForDisplay(area: TillSubmission["areas"][number]) {
  return area.grossSales ?? area.zTotal + (area.refunds ?? 0);
}

function refundsForDisplay(area: TillSubmission["areas"][number]) {
  return area.refunds ?? 0;
}

function notificationCategoryLabel(id: string) {
  if (id.startsWith("submission-")) return "Till";
  if (id.startsWith("booking-")) return "Booking";
  if (id.startsWith("safe-")) return "Safe";
  if (id.startsWith("cash-")) return "Cash";
  if (id.startsWith("rota-")) return "Rota";
  if (id.startsWith("weekly-review-")) return "Weekly";
  if (id.startsWith("month-close-")) return "Month end";
  return "Activity";
}

const DASHBOARD_FLOAT_CONTROL_STATUSES = new Set<OpeningFloatCheck["status"]>([
  "confirmed-standard",
  "exception-awaiting-review",
  "manager-approved",
]);

export function DashboardHome() {
  const { user, signOut, mode, changePassword } = useAuth();
  const [recentSubmissions, setRecentSubmissions] = useState<TillSubmission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<TillSubmission[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<TillSubmission[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyTakingsReport[]>([]);
  const [hallBookings, setHallBookings] = useState<HallBooking[]>([]);
  const [safeBalances, setSafeBalances] = useState<SafeBalance[]>([]);
  const [cashLedgerEntries, setCashLedgerEntries] = useState<CashLedgerEntry[]>([]);
  const [openingFloatChecks, setOpeningFloatChecks] = useState<OpeningFloatCheck[]>([]);
  const [rotaShifts, setRotaShifts] = useState<RotaShift[]>([]);
  const [rotaStaff, setRotaStaff] = useState<PayrollStaffMember[]>([]);
  const [rotaActorStaffId, setRotaActorStaffId] = useState<string | undefined>();
  const [bookkeeperDocuments, setBookkeeperDocuments] = useState<BookkeeperDocument[]>([]);
  const [monthCloses, setMonthCloses] = useState<FinanceMonthClose[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<TillSubmission | null>(null);
  const [completingWeeklyReview, setCompletingWeeklyReview] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [roleWorkspaceTab, setRoleWorkspaceTab] = useState<"attention" | "activity" | "guide" | "workspace">("attention");
  const [sessionTab, setSessionTab] = useState<"profile" | "actions" | "workspace" | "documents" | "setup">("profile");
  const [showAllLatestActivity, setShowAllLatestActivity] = useState(false);
  const [formerStaffContractIds, setFormerStaffContractIds] = useState<string[]>([]);
  const [openingStaffContractId, setOpeningStaffContractId] = useState<string | null>(null);
  const [staffContractError, setStaffContractError] = useState<string | null>(null);
  const primaryActionClass =
    "inline-flex items-center justify-center rounded-[1.1rem] bg-slate-950 px-5 py-3 text-sm font-semibold !text-white no-underline shadow-[0_12px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-slate-800";
  const secondaryActionClass =
    "inline-flex items-center justify-center rounded-[1.1rem] bg-[linear-gradient(135deg,#1b4d5c,#24697c)] px-5 py-3 text-sm font-semibold !text-white no-underline shadow-[0_12px_30px_rgba(27,77,92,0.18)] transition hover:-translate-y-0.5 hover:brightness-105";
  const subtleActionClass =
    "inline-flex items-center justify-center rounded-[1.1rem] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-amber-300";

  useEffect(() => {
    listRecentTillSubmissions()
      .then(setRecentSubmissions)
      .catch(() => setRecentSubmissions([]));
    listTillSubmissions({ limitCount: 250 })
      .then(setAllSubmissions)
      .catch(() => setAllSubmissions([]));
    listApprovalQueue()
      .then(setApprovalQueue)
      .catch(() => setApprovalQueue([]));
    listWeeklyReports()
      .then(setWeeklyReports)
      .catch(() => setWeeklyReports([]));
    listHallBookings()
      .then(setHallBookings)
      .catch(() => setHallBookings([]));
    listSafeBalances()
      .then(setSafeBalances)
      .catch(() => setSafeBalances([]));
    listCashLedgerEntries()
      .then(setCashLedgerEntries)
      .catch(() => setCashLedgerEntries([]));
    listOpeningFloatChecks()
      .then(setOpeningFloatChecks)
      .catch(() => setOpeningFloatChecks([]));
  }, []);

  useEffect(() => {
    if (!user || user.role === "bookkeeper") {
      setRotaShifts([]);
      setRotaStaff([]);
      setRotaActorStaffId(undefined);
      return;
    }
    listStaffRota()
      .then((payload) => {
        setRotaShifts(payload.shifts);
        setRotaStaff(payload.staff);
        setRotaActorStaffId(payload.actorStaffId);
      })
      .catch(() => {
        setRotaShifts([]);
        setRotaStaff([]);
        setRotaActorStaffId(undefined);
      });
  }, [user]);

  useEffect(() => {
    async function loadMonthCloses() {
      if (!user || !hasClientFirebaseConfig() || !canViewReports(user)) {
        setMonthCloses([]);
        return;
      }

      try {
        const current = getFirebaseAuth().currentUser;
        if (!current) {
          setMonthCloses([]);
          return;
        }
        const response = await fetch("/api/finance/month-close", {
          headers: {
            Authorization: `Bearer ${await current.getIdToken()}`,
          },
        });
        const payload = (await response.json()) as { closes?: FinanceMonthClose[] };
        if (!response.ok) {
          throw new Error("Unable to load month-end close records.");
        }
        setMonthCloses(payload.closes ?? []);
      } catch {
        setMonthCloses([]);
      }
    }

    void loadMonthCloses();
  }, [user]);

  useEffect(() => {
    async function loadBookkeeperDocuments() {
      if (!user || !hasClientFirebaseConfig() || !canViewReports(user)) {
        setBookkeeperDocuments([]);
        return;
      }

      try {
        const current = getFirebaseAuth().currentUser;
        if (!current) {
          setBookkeeperDocuments([]);
          return;
        }
        const response = await fetch("/api/bookkeeper-documents", {
          headers: {
            Authorization: `Bearer ${await current.getIdToken()}`,
          },
        });
        const payload = (await response.json()) as { documents?: BookkeeperDocument[] };
        if (!response.ok) {
          throw new Error("Unable to load invoice register.");
        }
        setBookkeeperDocuments(payload.documents ?? []);
      } catch {
        setBookkeeperDocuments([]);
      }
    }

    void loadBookkeeperDocuments();
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("greenhithe.dismissed-notifications");
    if (!stored) return;
    try {
      setDismissedNotifications(JSON.parse(stored) as string[]);
    } catch {
      setDismissedNotifications([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("greenhithe.former-staff-contracts");
    if (!stored) return;
    try {
      setFormerStaffContractIds(JSON.parse(stored) as string[]);
    } catch {
      setFormerStaffContractIds([]);
    }
  }, []);

  const isStaff = isStaffLikeRole(user);
  const isManager = user?.role === "general-manager";
  const isTreasurer = user?.role === "treasurer";
  const isManagementLead = isManager || isTreasurer;
  const isSecretary = user?.role === "secretary";
  const isChairman = user?.role === "chairman";
  const isBookkeeper = user?.role === "bookkeeper";
  const usesRoleWorkspace = isManagementLead || isChairman || isBookkeeper;
  const currentStaffContracts = staffContractDocuments.filter((document) => !formerStaffContractIds.includes(document.id));
  const formerStaffContracts = staffContractDocuments.filter((document) => formerStaffContractIds.includes(document.id));
  const weeklyReportsWithData = [...weeklyReports]
    .filter(
      (report) =>
        report.areas.some((area) => area.actualTotal || area.zTotal || area.cashTotal || area.cardTotal || area.variance) ||
        report.otherCashIncome.length > 0 ||
        report.deductions.length > 0,
    )
    .sort((a, b) => b.weekCommencing.localeCompare(a.weekCommencing));
  const latestWeeklyWithData = weeklyReportsWithData[0] ?? null;
  const submittedCount = approvalQueue.filter((submission) => submission.status === "submitted").length;
  const currentOpenWeekEnding = weekEndingForDate(new Date());
  const pendingWeeklyReviewReport =
    weeklyReportsWithData.find(
      (report) =>
        report.weekCommencing < currentOpenWeekEnding &&
        report.status !== "completed" &&
        report.status !== "locked" &&
        !report.gmReviewCompletedAt,
    ) ?? null;
  const gmNeedsWeeklyReview = Boolean(
    isManagementLead &&
      pendingWeeklyReviewReport &&
      weeklyReviewDueAt(pendingWeeklyReviewReport.weekCommencing).getTime() <= Date.now(),
  );
  const gmReviewWeekLabel = pendingWeeklyReviewReport
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
        new Date(pendingWeeklyReviewReport.weekCommencing),
      )
    : "";
  const displayName =
    user?.email === "kevinpowell@greenhithelegionsocialclub.com"
      ? "Kev Powell"
      : user?.email === "martinchamberlain@greenhithelegionsocialclub.com"
        ? "Martin Chamberlain"
        : user?.displayName ?? "Staff user";
  const canSelfServePassword = user ? usesEmailLogin(user.role) : false;
  const environmentLabel = mode === "firebase" ? "Live environment" : "Demo environment";
  const lastBankingEntry = cashLedgerEntries
    .filter((entry) => entry.type === "banking-hsbc")
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))[0] ?? null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextBankingDueIso = useMemo(() => {
    const base = lastBankingEntry ? new Date(`${lastBankingEntry.entryDate}T00:00:00`) : new Date("2026-03-23T00:00:00");
    const nextDue = new Date(base);
    nextDue.setDate(nextDue.getDate() + 14);
    return isoLocalDate(nextDue);
  }, [lastBankingEntry]);
  const bankingDueToday = isManagementLead && nextBankingDueIso === isoLocalDate(new Date());
  const pendingInvoices = useMemo(
    () =>
      bookkeeperDocuments
        .filter((entry) => entry.category === "invoice" && (entry.invoiceStatus ?? "pending") === "pending")
        .slice(),
    [bookkeeperDocuments],
  );
  const dueInvoices = useMemo(
    () =>
      pendingInvoices
        .filter((entry) => Boolean(entry.payByDate))
        .sort((left, right) => (left.payByDate ?? "").localeCompare(right.payByDate ?? "")),
    [pendingInvoices],
  );
  const overdueInvoices = useMemo(
    () => dueInvoices.filter((entry) => (entry.payByDate ?? "") < todayIso),
    [dueInvoices, todayIso],
  );
  const dueSoonInvoices = useMemo(() => {
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);
    const cutoff = isoLocalDate(inSevenDays);
    return dueInvoices.filter((entry) => {
      const due = entry.payByDate ?? "";
      return due >= todayIso && due <= cutoff;
    });
  }, [dueInvoices, todayIso]);
  const nextInvoiceDue = dueInvoices[0] ?? null;
  const invoiceMonthForLink = nextInvoiceDue?.payByDate?.slice(0, 7) ?? todayIso.slice(0, 7);
  const invoiceRegisterHref =
    overdueInvoices.length > 0
      ? `/reports?invoiceMonth=${invoiceMonthForLink}&invoiceView=overdue#invoice-register`
      : dueSoonInvoices.length > 0
        ? `/reports?invoiceMonth=${invoiceMonthForLink}&invoiceView=due-soon#invoice-register`
        : `/reports?invoiceMonth=${invoiceMonthForLink}&invoiceView=payment-position#invoice-register`;

  async function handleChangePassword() {
    if (!user) return;
    setPasswordError(null);
    setPasswordMessage(null);

    if (!currentPassword.trim()) {
      setPasswordError("Enter your current password first.");
      return;
    }

    const validationError = validateReplacementCredentialForRole(user.role, nextPassword);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    if (nextPassword.trim() !== confirmPassword.trim()) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword.trim(), nextPassword.trim());
      setPasswordMessage("Password changed successfully.");
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setSavingPassword(false);
    }
  }
  const primaryActions = [
    {
      href: isManagementLead ? "/opening-float-review" : "/opening-floats",
      label: isManagementLead ? "Opening float exceptions" : "Start of day",
      allowed: canManageOpeningFloatChecks(user),
      tone: isManagementLead ? "secondary" as const : "primary" as const,
      description: isManagementLead
        ? "Review non-standard opening float reports from staff. Exceptions are audit items and do not stop trading."
        : "Confirm the opening float before service starts. If it is wrong, enter the actual breakdown and send it for management review.",
    },
    {
      href: "/till-close",
      label: "Till balancing",
      allowed: isStaff,
      tone: "primary" as const,
      description: "Enter end-of-shift till figures, record payouts and ad-hoc till cash items, then submit the shift for management review.",
    },
    {
      href: "/cash-ledger",
      label: "Till top-up from safe",
      allowed: user?.role === "staff-keyholder" && canRecordSafeTillTopUps(user),
      tone: "secondary" as const,
      description: "Record money taken from the safe to top up a till during service, including the note and coin breakdown withdrawn.",
    },
    {
      href: "/till-control",
      label: "Till control",
      allowed: canViewTillControl(user),
      tone: "secondary" as const,
      description: "Review approvals, investigate till differences, and open the weekly spreadsheet-style till view.",
    },
    {
      href: "/cash-control",
      label: "Cash control",
      allowed: canViewCashControl(user) && !isSecretary,
      tone: "secondary" as const,
      description: "Check safe cash, daily cash log entries, banking recommendations, and the official cash movement trail.",
    },
    {
      href: "/secretary-cash-log",
      label: "Daily cash log",
      allowed: isSecretary && canViewSecretaryCashLog(user),
      tone: "secondary" as const,
      description: isSecretary
        ? "Record day-to-day cash received and paid out. Entries feed the safe position automatically."
        : "Open the Secretary cash log for non-till cash received and paid out.",
    },
    {
      href: isSecretary ? "/reports?reportTab=weekly" : "/reports",
      label: isBookkeeper ? "Monthly finance pack" : "Reports",
      allowed: canViewReports(user),
      tone: "secondary" as const,
      description: isBookkeeper
        ? "Open the monthly finance pack, month-end status, and OneDrive document links in one place."
        : isSecretary
          ? "Review weekly finance summaries, monthly pack figures, and how daily cash log entries have landed."
          : "Use the finance and monthly support views for weekly summaries, month-end, and audit support.",
    },
    {
      href: "/hall-bookings",
      label: "Hall bookings",
      allowed: isSecretary && canViewHallBookings(user),
      tone: "secondary" as const,
      description: "Open the live booking diary, enquiries, confirmed bookings, and linked hall-hire invoices.",
    },
    {
      href: "/members",
      label: "Membership Portal",
      allowed: isSecretary && canViewMembership(user),
      tone: "secondary" as const,
      description: "Manage applications, admissions, renewals, lapsed members, exceptions, and member records.",
    },
    {
      href: "/payroll",
      label: "Timesheets / Payroll",
      allowed: canManagePayroll(user),
      tone: "secondary" as const,
      description: "Enter monthly staff hours, update pay rates, calculate lock-up and deputising payments, and prepare the accountant payroll pack.",
    },
    {
      href: "/annual-leave",
      label: "Annual leave",
      allowed: Boolean(user) && !isBookkeeper && !isChairman,
      tone: "secondary" as const,
      description: isManagementLead
        ? "Track holiday accrual by holiday year, review leave requests, and view the leave calendar."
        : "Request annual leave, see your holiday balance, and check your leave history.",
    },
    {
      href: "/staff-rota",
      label: "Staff rota",
      allowed: Boolean(user) && !isBookkeeper,
      tone: "secondary" as const,
      description: isManagementLead
        ? "Create standard and one-off shifts, monitor accepted cover, and see outstanding rota responses."
        : "View shifts offered to you, accept or decline assigned work, and claim eligible open shifts.",
    },
    {
      href: "/golf-society",
      label: "Golf Society",
      allowed: canViewGolfSociety(user),
      tone: "secondary" as const,
      description: "Manage society golfers, upcoming golf days, Stripe payment links, the ring-fenced fund balance, and society handicaps.",
    },
    {
      href: "/reports?invoiceView=payment-position#invoice-register",
      label: "Invoice register",
      allowed: user?.role === "general-manager" || user?.role === "treasurer" || user?.role === "secretary",
      tone: "secondary" as const,
      description: isSecretary
        ? "Open the invoice intake area, add the OneDrive link, and complete invoice details before the Bookkeeper posts them."
        : "Open the shared invoice register to review overdue items, payment position, and linked OneDrive invoices.",
    },
    {
      href: "/audit-log",
      label: "Audit log",
      allowed: canViewAuditLog(user),
      tone: "secondary" as const,
      description: "Review who changed what across tills, cash, finance, bookings, and other logged activity.",
    },
  ].filter((item) => item.allowed);
  const managementActions = [
    {
      href: "/opening-float-review",
      label: "Opening float exceptions",
      allowed: isManagementLead,
      description: "Review non-standard opening float reports from staff. Exceptions are audit items and do not stop trading.",
    },
    {
      href: "/till-close",
      label: "Till balancing",
      allowed: isManagementLead,
      description: "Use this when management is covering a shift and needs to complete the till close directly.",
    },
    {
      href: "/stock-ullage",
      label: "Stock / ullage",
      allowed: canViewReports(user) && !isBookkeeper && !isSecretary,
      description: "Review staff ullage against GM non-staff wastage and keep stock-loss records in one place.",
    },
    {
      href: "/hall-bookings",
      label: "Hall bookings",
      allowed: canViewHallBookings(user) && !isSecretary,
      description: "Manage enquiries, confirmed bookings, invoices, and the live hall diary.",
    },
    {
      href: "/manual-till",
      label: "Manual till entry",
      allowed: isManagementLead,
      description: "Use only when a shift could not be captured through the normal till-balancing process.",
    },
    {
      href: "/user-management",
      label: "User management",
      allowed: canManageUsers(user),
      description: "Maintain logins, roles, and the operational staff list used in till balancing.",
    },
    {
      href: "/members",
      label: "Membership Portal",
      allowed: canViewMembership(user) && !isSecretary,
      description: "Run applications, renewals, lapsed members, exceptions, and member records from one screen.",
    },
    {
      href: "/pool-league",
      label: "Pool League Display",
      allowed: canManagePoolLeagueDisplay(user),
      description: "Manage the public Yodeck pool league display links and preview the Club Hub TV screen.",
    },
    {
      href: "/reports?invoiceView=payment-position#invoice-register",
      label: "Invoice register",
      allowed: (user?.role === "general-manager" || user?.role === "treasurer" || user?.role === "secretary") && !isSecretary,
      description: isSecretary
        ? "Open the Secretary invoice intake and complete missing invoice details before the Bookkeeper posts them."
        : "Open the shared invoice register to review what has been logged, what is ready for the Bookkeeper, and what may need follow-up.",
    },
  ].filter((item) => item.allowed);
  const latestSafeBalance = safeBalances[0] ?? null;
  const allDailyVariances = useMemo(
    () =>
      weeklyReports.flatMap((report) => {
        const liveEntries = allSubmissions
          .filter((submission) => submission.status === "manager-approved" || submission.status === "treasurer-locked")
          .filter((submission) => {
            const shiftDate = submission.shiftDate ?? submission.shiftLabel.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
            if (!shiftDate) return false;
            return weekEndingForDate(new Date(`${shiftDate}T12:00:00`)) === report.weekCommencing;
          })
          .flatMap((submission) =>
            submission.areas.map((area) => {
              const countedTotal =
                area.cashCounted +
                area.cardPayment +
                (area.cashback ?? 0) +
                (area.lottoPayouts ?? 0) +
                (area.fruitMachinePayouts ?? 0);
              return {
                areaName: area.areaName as DashboardVarianceEntry["areaName"],
                shiftDate: submission.shiftDate ?? submission.shiftLabel.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "",
                shiftLabel: submission.shiftLabel,
                submittedBy: submission.submittedBy.displayName,
                variance: countedTotal - area.zTotal,
                source: "live-till-submission" as const,
              } satisfies DashboardVarianceEntry;
            }),
          );

        const importedEntries = (report.dailyBreakdown ?? []).map((day) => ({
          areaName: day.areaName,
          shiftDate: day.date,
          shiftLabel: `${day.date} · ${day.areaName} imported workbook entry`,
          submittedBy: "Imported workbook history",
          variance: day.variance,
          source: day.source,
        })) satisfies DashboardVarianceEntry[];

        if (liveEntries.length === 0) {
          return importedEntries
            .filter((entry) => Math.abs(entry.variance) > 0)
            .map((entry) => ({ ...entry, varianceReviews: report.varianceReviews ?? [] }));
        }

        const merged = new Map<string, DashboardVarianceEntry>();

        for (const entry of importedEntries) {
          merged.set(`${entry.shiftDate}:${entry.areaName}:imported:${entry.shiftLabel}`, entry);
        }

        for (const entry of liveEntries) {
          for (const [key, value] of merged.entries()) {
            if (
              value.shiftDate === entry.shiftDate &&
              value.areaName === entry.areaName &&
              value.source === "imported-workbook"
            ) {
              merged.delete(key);
            }
          }
          merged.set(`${entry.shiftDate}:${entry.areaName}:live:${entry.shiftLabel}`, entry);
        }

        return Array.from(merged.values())
          .filter((entry) => Math.abs(entry.variance) > 0)
          .map((entry) => ({ ...entry, varianceReviews: report.varianceReviews ?? [] }));
      }),
    [allSubmissions, weeklyReports],
  );
  const liveControlVariances = useMemo(
    () => allDailyVariances.filter((entry) => entry.shiftDate >= LIVE_TILL_DIFFERENCE_START_DATE),
    [allDailyVariances],
  );
  const pendingVarianceReviewCount = useMemo(
    () =>
      liveControlVariances.filter(({ varianceReviews, ...day }) => {
        const review = matchingVarianceReview(day, varianceReviews);
        if (needsTreasurerEscalation(day) && !review?.escalatedToTreasurer) return true;
        if (review?.writeOffApprovedAt) return false;
        return !review || (!review.explanation.trim() && !review.escalatedToTreasurer && !review.acknowledgedByManager);
      }).length,
    [liveControlVariances],
  );
  const submittedVarianceCount = useMemo(
    () =>
      approvalQueue.filter(
        (submission) =>
          submission.status === "submitted" && Math.abs(submission.totals.variance) > 0.009,
      ).length,
    [approvalQueue],
  );
  const expectedTreasurerEscalationCount = useMemo(
    () =>
      liveControlVariances.filter(({ varianceReviews, ...day }) => {
        const review = matchingVarianceReview(day, varianceReviews);
        return needsTreasurerEscalation(day) && !review?.escalatedToTreasurer;
      }).length,
    [liveControlVariances],
  );
  const todaysStaffFloatChecks = useMemo(
    () =>
      openingFloatChecks.filter(
        (entry) => entry.entryDate === todayIso && entry.submittedBy.uid === user?.uid,
      ),
    [openingFloatChecks, todayIso, user?.uid],
  );
  const pendingOpeningFloatExceptions = useMemo(
    () =>
      openingFloatChecks
        .filter((entry) => entry.status === "exception-awaiting-review")
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
    [openingFloatChecks],
  );
  const pendingOpeningFloatExceptionCount = pendingOpeningFloatExceptions.length;
  const openingFloatTrendActionChecks = useMemo(
    () =>
      openingFloatChecks
        .filter(openingFloatNeedsTrendAction)
        .sort((left, right) => {
          const dateCompare = right.entryDate.localeCompare(left.entryDate);
          return dateCompare !== 0 ? dateCompare : right.submittedAt.localeCompare(left.submittedAt);
        }),
    [openingFloatChecks],
  );
  const openingFloatTrendPreparerCount = new Set(
    openingFloatTrendActionChecks.map((check) => check.expectedPreparedBy?.displayName || "Unknown preparer"),
  ).size;
  const missingTillBalanceChecks = useMemo(
    () =>
      openingFloatChecks
        .filter((check) => DASHBOARD_FLOAT_CONTROL_STATUSES.has(check.status))
        .filter((check) => check.entryDate < todayIso)
        .filter((check) => {
          const relatedSubmission = allSubmissions.find((submission) => {
            if (submission.shiftDate !== check.entryDate) return false;
            return tillNameFromShiftLabel(submission.shiftLabel) === check.tillName;
          });
          return !relatedSubmission || relatedSubmission.status === "draft";
        })
        .sort((left, right) => {
          const dateCompare = right.entryDate.localeCompare(left.entryDate);
          return dateCompare !== 0 ? dateCompare : right.submittedAt.localeCompare(left.submittedAt);
        }),
    [allSubmissions, openingFloatChecks, todayIso],
  );
  const missingTillBalanceCount = missingTillBalanceChecks.length;
  const needsAttentionToday = useMemo<AttentionQueueItem[]>(() => {
    if (isStaff) {
      return [
        {
          title: "Start of day",
          countLabel: todaysStaffFloatChecks.length ? "Done" : "Open",
          detail: todaysStaffFloatChecks.length
            ? "Your opening float has already been confirmed for today."
            : "Confirm the opening float before service starts.",
          href: "/opening-floats",
        },
        {
          title: "Till close-down",
          countLabel: recentSubmissions.some((submission) => submission.shiftDate === todayIso && submission.submittedBy.uid === user?.uid) ? "Recorded" : "Waiting",
          detail: "Use Till balancing at the end of the shift and submit it for management review.",
          href: "/till-close",
        },
      ];
    }

    if (isSecretary) {
      const invoiceActionCount = overdueInvoices.length || dueSoonInvoices.length;
      return [
        {
          title: "Daily cash log",
          countLabel: "Open",
          detail: "Record today’s non-till cash activity here.",
          href: "/secretary-cash-log",
        },
        {
          title: "Invoices",
          countLabel: invoiceActionCount ? String(invoiceActionCount) : "Clear",
          detail: invoiceActionCount
            ? "Invoices are due or overdue and need checking."
            : "No invoice payments are pressing today.",
          href: invoiceRegisterHref,
        },
        {
          title: "Weekly review",
          countLabel: "Check",
          detail: "Review how daily cash log items and till figures have landed in the current week.",
          href: "/reports?reportTab=weekly",
        },
      ];
    }

    if (isManagementLead) {
      const bankingCount = bankingDueToday ? 1 : 0;
      const tillsAndFloatsCount = pendingOpeningFloatExceptionCount + missingTillBalanceCount + openingFloatTrendPreparerCount;
      return [
        {
          title: "Till approvals",
          countLabel: submittedCount ? String(submittedCount) : "Clear",
          detail: submittedCount
            ? "Submitted till balances are waiting for approval."
            : "No till balances are waiting for approval.",
          href: "/approvals",
        },
        {
          title: "Tills and floats",
          countLabel: tillsAndFloatsCount
            ? String(tillsAndFloatsCount)
            : "Clear",
          detail:
            tillsAndFloatsCount
              ? openingFloatTrendPreparerCount > 0
                ? "Opening float trends need a GM action note, coaching conversation, or refresher reset."
                : missingTillBalanceCount > 0
                ? "Opening float exceptions or missing till close-downs still need attention."
                : "Opening float exceptions still need attention."
              : "No float exceptions or missing close-downs are waiting.",
          href:
            openingFloatTrendPreparerCount > 0
              ? "/control-health?focus=float-conversations"
              : missingTillBalanceCount > 0
              ? "/control-health?focus=close-downs"
              : pendingOpeningFloatExceptionCount > 0
                ? "/control-health?focus=floats"
                : "/control-health?focus=floats",
        },
        {
          title: "Till differences",
          countLabel: pendingVarianceReviewCount ? String(pendingVarianceReviewCount) : "Clear",
          detail: pendingVarianceReviewCount
            ? "Till differences still need action in Till control."
            : "No till differences are currently waiting for action.",
          href: "/variances?filter=all",
        },
        {
          title: "Safe and banking",
          countLabel: bankingCount ? "Due" : "Clear",
          detail: bankingDueToday
            ? "The two-week banking review is due today."
            : "No banking review is due today.",
          href: "/cash-control",
        },
        {
          title: "Weekly review",
          countLabel: gmNeedsWeeklyReview ? "Overdue" : "Clear",
          detail: gmNeedsWeeklyReview
            ? `Week ending ${gmReviewWeekLabel} still needs management review.`
            : "No weekly review is currently waiting.",
          href: "/weekly-takings",
        },
      ];
    }

    if (isBookkeeper) {
      return [
        {
          title: "Monthly finance pack",
          countLabel: "Open",
          detail: "Use the monthly finance workspace and linked support papers.",
          href: "/reports",
        },
      ];
    }

    return [
      {
        title: "Till control",
        countLabel: pendingVarianceReviewCount ? String(pendingVarianceReviewCount) : "Clear",
        detail: pendingVarianceReviewCount
          ? "There are till differences needing oversight."
          : "No till differences are currently waiting for action.",
        href: "/variances?filter=all",
      },
      {
        title: "Cash control",
        countLabel: bankingDueToday ? "Due" : "Open",
        detail: bankingDueToday
          ? "A banking review is due today."
          : "Open Cash control for the current safe and banking picture.",
        href: "/cash-control",
      },
    ];
  }, [
    bankingDueToday,
    gmNeedsWeeklyReview,
    gmReviewWeekLabel,
    invoiceRegisterHref,
    isBookkeeper,
    isManagementLead,
    isSecretary,
    isStaff,
    missingTillBalanceCount,
    openingFloatTrendPreparerCount,
    overdueInvoices.length,
    dueSoonInvoices.length,
    pendingOpeningFloatExceptionCount,
    recentSubmissions,
    submittedCount,
    todaysStaffFloatChecks.length,
    todayIso,
    pendingVarianceReviewCount,
    user?.uid,
  ]);
  const dashboardMetrics: Metric[] = [];
  const rotaDashboardNotifications = useMemo(() => {
    const actorStaffRole = rotaStaff.find((entry) => entry.id === rotaActorStaffId)?.role;
    const upcomingRotaShifts = rotaShifts
      .filter((shift) => shift.shiftDate >= todayIso && shift.status !== "cancelled" && shift.status !== "completed")
      .sort((left, right) => `${left.shiftDate}${left.startTime}`.localeCompare(`${right.shiftDate}${right.startTime}`));

    if (isManagementLead) {
      return upcomingRotaShifts
        .filter((shift) => shift.status === "offered" || shift.status === "open" || shift.status === "declined")
        .map((shift) => ({
          id: `rota-manager-${shift.id}`,
          title: shift.status === "open" ? "Open rota shift unclaimed" : shift.status === "declined" ? "Rota shift declined" : "Rota response outstanding",
          detail: `${shift.title} · ${shift.shiftDate} · ${shift.assignedStaffName || shift.assignedBar || "Staff cover"}`,
          when: shift.updatedAt || `${shift.shiftDate}T${shift.startTime || "09:00"}:00`,
          href: "/staff-rota",
        }));
    }

    if (!rotaActorStaffId) return [];
    return upcomingRotaShifts
      .filter(
        (shift) =>
          (shift.status === "offered" && (shift.assignedStaffId === rotaActorStaffId || shift.responses.some((response) => response.staffId === rotaActorStaffId && response.response === "pending"))) ||
          (shift.status === "open" && actorStaffRole !== undefined && shift.eligibleRoles.includes(actorStaffRole)),
      )
      .map((shift) => ({
        id: `rota-staff-${shift.id}`,
        title: shift.status === "open" ? "Open rota shift available" : "Rota shift waiting for your response",
        detail: `${shift.title} · ${shift.shiftDate} · ${shift.startTime} to ${shift.endTime}`,
        when: shift.updatedAt || `${shift.shiftDate}T${shift.startTime || "09:00"}:00`,
        href: "/staff-rota",
      }));
  }, [isManagementLead, rotaActorStaffId, rotaShifts, rotaStaff, todayIso]);
  const allNotifications = useMemo(() => {
    const next = [
      ...rotaDashboardNotifications,
      ...recentSubmissions.map((submission) => ({
        id: `submission-${submission.id}`,
        title: submission.status === "submitted" ? "Till submitted for review" : "Till activity recorded",
        detail: `${submission.shiftLabel} · ${submission.submittedBy.displayName}`,
        when: submission.submittedAt,
        href: "/approvals",
      })),
      ...hallBookings
        .filter((booking) => booking.status !== "completed" && booking.status !== "cancelled")
        .map((booking) => ({
          id: `booking-${booking.id}`,
          title:
            booking.status === "enquiry"
              ? "New hall booking enquiry"
              : booking.status === "provisional"
                ? "Hall booking awaiting confirmation"
                : "Confirmed hall booking in diary",
          detail: `${booking.title} · ${new Date(booking.date).toLocaleDateString("en-GB")}`,
          when: `${booking.date}T${booking.startTime}:00`,
          href: "/hall-bookings",
        })),
      ...safeBalances.map((balance) => ({
        id: `safe-${balance.id}`,
        title: "Safe balance recorded",
        detail: `${currency(balance.total)} counted`,
        when: balance.countedAt,
              href: "/safe-balance",
            })),
      ...cashLedgerEntries.map((entry) => ({
        id: `cash-${entry.id}`,
        title: "Cash movement recorded",
        detail: `${entry.type.replace("-", " ")} · ${currency(entry.amount)}`,
        when: entry.recordedAt,
        href: `/cash-ledger?tab=history&entry=${entry.id}`,
      })),
      ...(gmNeedsWeeklyReview && pendingWeeklyReviewReport
        ? [
            {
              id: `weekly-review-${pendingWeeklyReviewReport.id}`,
              title: "Weekly review waiting for GM",
              detail: `Week ending ${gmReviewWeekLabel} is still in review`,
              when: `${pendingWeeklyReviewReport.weekCommencing}T23:59:00`,
              href: "/weekly-takings",
            },
          ]
        : []),
      ...(user?.role === "treasurer"
        ? monthCloses
            .filter((entry) => entry.status === "locked")
            .map((entry) => ({
              id: `month-close-${entry.id}`,
              title: "Month end locked by Bookkeeper",
              detail: `${entry.month} is locked. Review Sage and check the latest profit and loss account before committee sign-off.`,
              when: entry.lockedAt || `${entry.month}-28T23:59:00`,
              href: "/reports",
            }))
        : []),
    ]
      .sort((a, b) => b.when.localeCompare(a.when));

    return next;
  }, [rotaDashboardNotifications, recentSubmissions, hallBookings, safeBalances, cashLedgerEntries, gmNeedsWeeklyReview, pendingWeeklyReviewReport, gmReviewWeekLabel, monthCloses, user?.role]);
  const notifications = useMemo(
    () => allNotifications.filter((item) => !dismissedNotifications.includes(item.id)).slice(0, 10),
    [allNotifications, dismissedNotifications],
  );
  const todaysActivity = useMemo(
    () =>
      allNotifications
        .filter((item) => item.when.slice(0, 10) === todayIso)
        .filter((item) => !dismissedNotifications.includes(item.id))
        .slice(0, 6),
    [allNotifications, dismissedNotifications, todayIso],
  );
  const controlHealthItems = useMemo(
    () =>
      [
        {
          title: "Till approvals",
          status: submittedCount > 0 ? "Needs review" : "Clear",
          detail:
            submittedCount > 0
              ? submittedVarianceCount > 0
                ? `${submittedCount} submitted till balance${submittedCount === 1 ? "" : "s"} waiting for approval, including ${submittedVarianceCount} with a difference still to be reviewed.`
                : `${submittedCount} submitted till balance${submittedCount === 1 ? "" : "s"} waiting for approval.`
              : "No till balances are currently waiting for approval.",
          href: "/approvals",
        },
        {
          title: "Opening float exceptions",
          status: pendingOpeningFloatExceptionCount > 0 ? "Needs review" : "Clear",
          detail:
            pendingOpeningFloatExceptionCount > 0
              ? `${pendingOpeningFloatExceptionCount} opening float exception${pendingOpeningFloatExceptionCount === 1 ? "" : "s"} waiting for review.`
              : "No opening float exceptions are waiting.",
          href: "/control-health?focus=floats",
        },
        {
          title: "Missing till close-downs",
          status: missingTillBalanceCount > 0 ? "Needs review" : "Clear",
          detail:
            missingTillBalanceCount > 0
              ? `${missingTillBalanceCount} till${missingTillBalanceCount === 1 ? "" : "s"} had an opening float recorded but still have no submitted till balance.`
              : "No tills are currently showing as opened without a submitted close-down.",
          href: "/control-health?focus=close-downs",
        },
        {
          title: "Till differences",
          status: pendingVarianceReviewCount > 0 ? "Open" : "Clear",
          detail:
            pendingVarianceReviewCount > 0
              ? `${pendingVarianceReviewCount} till difference${pendingVarianceReviewCount === 1 ? "" : "s"} still need action.`
              : "No till differences are currently waiting for action.",
          href: "/variances?filter=all",
        },
        {
          title: "Banking review",
          status: bankingDueToday ? "Due" : "Clear",
          detail: bankingDueToday
            ? "The two-week banking review is due today."
            : "No banking review is due today.",
          href: "/cash-control",
        },
      ].filter((item) => {
        if (isStaff) return item.title === "Till approvals";
        if (isSecretary) {
          return item.title !== "Till approvals" && item.title !== "Opening float exceptions";
        }
        if (isBookkeeper) return item.title === "Banking review";
        return true;
      }),
    [
      bankingDueToday,
      isBookkeeper,
      isSecretary,
      isStaff,
      missingTillBalanceCount,
      pendingOpeningFloatExceptionCount,
      submittedVarianceCount,
      submittedCount,
      pendingVarianceReviewCount,
    ],
  );
  const visibleNotifications = showAllLatestActivity ? notifications : notifications.slice(0, 5);
  const hiddenNotificationsCount = Math.max(notifications.length - visibleNotifications.length, 0);

  const roleGuide: RoleGuideContent = isStaff
    ? {
        title: "Staff guide",
        instructions: [
          {
            title: "1. Install Club Hub on your device",
            body: "Open the Club Hub URL in your browser and sign in. On PC or laptop, use the browser Install app option. On iPhone/iPad, use Safari, tap Share, then Add to Home Screen. On Android, use Chrome and choose Install app or Add to Home screen.",
          },
          {
            title: "2. Enable rota notifications",
            body: "Open Staff rota from the dashboard and press Enable notifications. When your browser asks, allow notifications. Do this on each phone, tablet, or computer where you want rota alerts.",
          },
          {
            title: "3. Respond to rota shifts promptly",
            body: "Assigned shifts appear under My rota and should be accepted or declined as soon as possible. Open shifts are offered to eligible staff groups; if you claim one, it becomes your shift and the GM is notified. If you can no longer work an accepted shift, use the rota swap request rather than making private arrangements off-system.",
          },
          {
            title: "4. Confirm the opening float before service starts",
            body: "Open Start of day when you begin, select the float bag, and confirm the actual float received. If it is wrong, record the real breakdown there and continue. Do not wait until close-down to fix the opening float.",
          },
          {
            title: "5. Record safe money leaving the safe straight away",
            body: "If cash is taken from the safe for a till, that movement must go into Cash ledger immediately. Do not wait until end of day and do not keep payout cash in a cup, drawer, or side pot without recording it.",
          },
          {
            title: "6. Put game and Lotto payouts through the till close for that day",
            body: "Games machine wins and Lotto ticket wins paid during service must be reflected in the same day’s till balancing. If a Safe to till payout has been logged for your till, the till close must include at least that much in the prize payout fields or the till will show out of balance.",
          },
          {
            title: "7. Balance the till at the end of the shift",
            body: "Enter gross sales, refunds, card payments, cashback, prize payouts, cash returned to safe, and the next day’s float bag. Select all till operators; normally there should be at least two names unless you tick and explain the one-person exception. If a separate handheld card device was used, tick the handheld box and enter its gross, refunds, and net sales.",
          },
          {
            title: "8. Request annual leave through Club Hub",
            body: "Use Annual Leave to tell the GM the full unavailable date range and the holiday hours or days you want paid. Requests inside the two-week notice period can still be submitted, but must include an exceptional reason and may be declined.",
          },
          {
            title: "9. Save draft if needed, then submit cleanly",
            body: "Use Save draft only if you genuinely need to come back. Once you submit for review, staff cannot alter it without management correction or return for resubmission.",
          },
          {
            title: "10. Explain any unusual movement clearly",
            body: "If there was a late payout, correction, missing note, machine issue, or anything else unusual, add a short note. Clear notes save time and stop management guessing what happened.",
          },
        ],
        faqs: [
          {
            title: "Why do I need to install the app?",
            body: "You can use Club Hub in a browser, but installing it to your desktop or home screen makes it easier to find and helps phone/tablet notifications work properly.",
          },
          {
            title: "Why am I not getting rota notifications?",
            body: "Open Staff rota and check Device notifications. Notifications must be enabled on each device separately, and your browser or phone settings must allow notifications for Club Hub.",
          },
          {
            title: "What is the difference between my usual shifts and open shifts?",
            body: "My rota shows shifts assigned directly to you and open shifts you have claimed. Open shifts are extra shifts available to eligible staff groups; the first eligible person to claim one takes that shift, subject to any manager controls shown on the rota.",
          },
          {
            title: "What happens if a shift is edited after I accepted it?",
            body: "Material changes reset the response, so you will be asked to accept the updated shift again. If you are removed from a shift, Club Hub records that change and sends the relevant notification.",
          },
          {
            title: "Can I ask someone else to cover my accepted shift?",
            body: "Use the swap workflow in Staff rota. A replacement can offer to take the shift, but the GM/Treasurer must approve the swap before the rota is treated as changed.",
          },
          {
            title: "What if I pay a games machine or Lotto win during the shift?",
            body: "If the cash comes from the safe, it must be recorded in Cash ledger immediately as Safe to till against the correct till. Then the same payout must be reflected in that day’s till balancing. If the till already had some cash in it, the till payout amount can be higher than the safe top-up.",
          },
          {
            title: "What if only part of the payout came from the safe?",
            body: "Record only the amount actually taken from the safe in Cash ledger, but record the full prize payout in Till balancing. Example: £200 from safe plus £100 already in the till means Cash ledger shows £200 and the till payout fields show £300.",
          },
          {
            title: "What if extra cash was moved just to rebuild change in the till?",
            body: "Do not code that extra amount as a games or Lotto win. Record the prize-funding amount against the win, and use Change / top-up for any separate change float being added to the till.",
          },
          {
            title: "What if I forgot to enter a payout before the till was submitted?",
            body: "Do not guess or work around it. Tell the GM or keyholder straight away so the correct day and till can be corrected properly. Entering it on the wrong day will put another till out of balance.",
          },
          {
            title: "Can I use ad-hoc cash payments for prize payouts?",
            body: "No. Ad-hoc till cash payments are for genuine one-off cash expenses paid through the till, not for games or Lotto prize payouts.",
          },
          {
            title: "What if the float bag is wrong when I start?",
            body: "Record the actual float and bag in Start of day. That creates an opening-float exception for management review and keeps your close-down control figure correct.",
          },
        ],
      }
    : isSecretary
      ? {
          title: "Secretary guide",
          instructions: [
            {
              title: "1. Use Daily cash log for simple day-to-day cash items",
              body: "Record straightforward cash received and cash paid there with the correct Sage category. The activity view defaults to the current safe period since the last saved safe balance, with week-by-week and all-history views available for checking back. Do not use Weekly review as a second cash book.",
            },
            {
              title: "2. Keep the shared cash record clean",
              body: "The daily cash log is one shared club record. Use clear descriptions, not vague labels such as 'No receipt'. While the weekly review is still open, you can edit the description, Sage category, evidence link, and notes; after weekly sign-off the entry is locked.",
            },
            {
              title: "3. Use Membership Portal for member administration",
              body: "Applications, admissions, renewals, lapsed members, and membership communication should stay inside Membership Portal rather than separate notebooks or spreadsheets.",
            },
            {
              title: "4. Use hall bookings and invoice register as the live record",
              body: "Keep bookings, invoices, and follow-up in the system so email trails, payments, and booking history stay attached to the right record.",
            },
            {
              title: "5. Review reports rather than re-keying figures",
              body: "Use Weekly review, Reports, and the monthly finance pack to check how entries have landed. If something is wrong, correct the source record while the week is open rather than manually duplicating the cash entry elsewhere.",
            },
          ],
          faqs: [
            {
              title: "Should I log cash that has not yet been handed into the safe?",
              body: "For current workflow, Daily cash log entries are treated as included in the safe immediately. The working activity list then resets after the next saved safe balance, while older entries remain available through week-by-week or all-history views.",
            },
            {
              title: "Why can I not edit an older daily cash entry?",
              body: "Daily cash entries can only be edited while the relevant weekly review is still open. Once the week has been signed off, the entry becomes part of the completed finance record and must stay locked for audit.",
            },
            {
              title: "Should I create member or booking notes outside the system?",
              body: "Only if legally required elsewhere. Operationally, the system should be the working record so another role can pick it up without losing context.",
            },
            {
              title: "Can I correct till or safe figures directly?",
              body: "No, not normally. Tills and safe controls remain with the operational management roles unless you are specifically covering that role.",
            },
          ],
        }
      : user?.role === "general-manager"
        ? {
            title: "General Manager guide",
            instructions: [
              {
                title: "1. Start with safe and float control",
                body: "Prepare only the float bags actually needed, issue the correct till floats, and review any opening-float exceptions first so the day starts with a clean control position.",
              },
              {
                title: "2. Record safe movements at the time they happen",
                body: "Any cash leaving or entering the safe must be logged in Cash ledger immediately. Prize payouts funded from the safe should never sit off-system while you wait for till close.",
              },
              {
                title: "3. Keep prize payouts linked to the correct till and date",
                body: "If you log a Games machine win or Lotto ticket win as Safe to till, that same till and date must also be corrected in Till balancing. The till can show a higher total payout than the safe top-up if some cash was already in the till, but it must not show less than the safe top-up. Late historic entries must be posted against the original date, not today’s till.",
              },
              {
                title: "4. Work Till control in order",
                body: "Review approvals first, then investigate differences. Correct obvious entry mistakes before considering escalation or write-off. Use Approved tills and the day-detail drilldowns before changing figures.",
              },
              {
                title: "5. Use Cash control as the single cash position",
                body: "Move between Safe balance, Cash ledger, Daily cash log, and weekly review from Cash control. Daily cash activity is shown by current safe period, week, or all history. Avoid parallel notes or side records.",
              },
              {
                title: "6. Follow the banking-review approval chain",
                body: "Record the safe count, save the HSBC banking review, escalate any safe difference to the Treasurer, then complete the review only after Treasurer approval or write-off has been recorded.",
              },
              {
                title: "7. Keep weekly finance in order",
                body: "Once tills, floats, daily cash items, and Clover figures are right, complete the Weekly review. The review cannot be completed while there are missing till close-downs, unresolved till differences, or Clover cash/card split differences that need correction. Open weeks can show live till entries before the stored weekly rollup has caught up.",
              },
              {
                title: "8. Keep rota and payroll source records clean",
                body: "Create rota shifts from the calendar or staff-week view, use copy functions for repeats, and deal with outstanding rota responses on the Actions tab. Payroll should stay as draft until you are happy with the hours, holiday totals, premiums, starters, and leavers, then export the accountant CSV.",
              },
              {
                title: "9. Keep manual overrides exceptional and temporary",
                body: "If you override something to reflect reality, correct the real source record afterwards and remove the override so the system can be trusted again.",
              },
            ],
            faqs: [
              {
                title: "What should I do if staff forgot to put a prize payout through the till?",
                body: "Identify the correct till and original date, then correct that historical till and any matching safe movement. Do not dump the payout onto a later day, because that simply moves the imbalance elsewhere.",
              },
              {
                title: "What if only part of a payout needed cash from the safe?",
                body: "That is fine. The safe entry should show only the amount actually taken from the safe, while Till balancing should show the full payout. If extra cash was moved just to rebuild change, record that separately as Change / top-up rather than inflating the prize payout amount.",
              },
              {
                title: "Can I record a safe payout today for an older win?",
                body: "Only if you are intentionally correcting the original day and understand the knock-on effect. The system now warns when a closed-week or till-contra entry is likely to put a till out of balance.",
              },
              {
                title: "When should I escalate to the Treasurer?",
                body: "Escalate when a genuine difference remains after checking the source record and obvious corrections. Do not escalate entry mistakes that can still be fixed cleanly.",
              },
              {
                title: "Why does weekly takings show figures before the week is complete?",
                body: "For open weeks, Reports can use live approved till entries before the stored weekly finance rollup is complete. Once the weekly report is synced and reviewed, the stored rollup becomes the formal completed view.",
              },
              {
                title: "What does the rota Actions tab do?",
                body: "It is a live action queue, not a permanent inbox. Declined shifts, open shifts, swap requests, and shifts awaiting response stay there until the rota state is resolved.",
              },
              {
                title: "Can staff close a till if there were safe-funded prize payouts during the day?",
                body: "Yes, but the till close must include the matching payout figures. If the ledger shows a same-day prize payout top-up and the till close does not match it, the till will appear out of balance.",
              },
            ],
          }
        : user?.role === "treasurer"
          ? {
              title: "Treasurer guide",
              instructions: [
                {
                  title: "1. Use the live controls, but focus on approval rather than duplicate entry",
                  body: "You can access operational screens when needed, but your main value is reviewing escalations, safe differences, month-end controls, and unresolved finance issues.",
                },
                {
                  title: "2. Review escalated till and safe differences in order",
                  body: "Check the source detail, confirm the GM comment, decide whether the difference is resolved or should be written off, and record a clear Treasurer note.",
                },
                {
                  title: "3. Approve safe differences before final banking completion",
                  body: "The GM now records the banking review first, escalates the safe difference, and then you approve or write off the variance before the GM completes the review.",
                },
                {
                  title: "4. Use Cash control and Reports as the official finance view",
                  body: "Work from Safe balance, Cash ledger, Weekly review, Reports, and the monthly finance pack rather than separate manual schedules wherever possible. The Secretary can access the monthly finance pack, so keep naming and notes clear enough for shared use.",
                },
                {
                  title: "5. Review annual leave and payroll controls",
                  body: "Annual leave keeps holiday year balances, request decisions, cancellation reasons, compliance records, carry-over, and six-year recordkeeping evidence. Payroll remains draft/export only for now, with starters and leavers included in the accountant CSV.",
                },
                {
                  title: "6. Review locked month-end once the Bookkeeper has finished",
                  body: "Check the posted month, Sage outputs, and support papers before treating the month as closed for committee reporting.",
                },
              ],
              faqs: [
                {
                  title: "When should I write off a difference?",
                  body: "Only after the source entry has been checked and the difference is genuinely unresolved. Write-off is the final accounting treatment, not the first response.",
                },
                {
                  title: "Can I complete the banking review myself?",
                  body: "Yes, but the intended control flow is that the GM records and completes the review, while the Treasurer approves or writes off any safe difference in between.",
                },
                {
                  title: "Why can daily cash log entries disappear from the normal activity view?",
                  body: "They have not disappeared. The default Daily cash log view is the current safe period since the last safe balance. Use Week by week or All history to review older entries.",
                },
                {
                  title: "What note should I leave when approving a safe difference?",
                  body: "State briefly what was checked and why the difference was resolved or written off. The note should make sense to someone reading the record later without asking you.",
                },
              ],
            }
          : isBookkeeper
            ? {
                title: "Bookkeeper guide",
                instructions: [
                  {
                    title: "1. Start from the monthly finance pack",
                    body: "Use the monthly finance pack, month-end status, and linked support papers as the working source for Sage preparation and review.",
                  },
                  {
                    title: "2. Work month by month from the system outputs",
                    body: "Use reports for turnover, cash receipts, bankings, VAT support, memberships, branch subscriptions, and daily cash log lines rather than rebuilding the month manually.",
                  },
                  {
                    title: "3. Keep support papers linked and complete",
                    body: "Invoices, receipts, banking evidence, and VAT support should sit with the month-end pack so review does not depend on private folders or memory.",
                  },
                  {
                    title: "4. Leave day-to-day operations to operational roles",
                    body: "Till balancing, cash ledger, safe control, membership administration, and booking workflows remain operational records, not bookkeeping substitutes.",
                  },
                ],
                faqs: [
                  {
                    title: "Should I correct operational cash records for bookkeeping convenience?",
                    body: "No. If something is wrong, the source operational record should be corrected by the role that owns it. Bookkeeping should reflect the operational truth, not silently rewrite it.",
                  },
                  {
                    title: "What should I do if a week or month does not reconcile?",
                    body: "Identify which source record is wrong, feed that back to operations, and only proceed once the live system agrees with the real-world paperwork. Open weekly figures may use live till entries before the stored weekly rollup has caught up.",
                  },
                ],
              }
            : isChairman
              ? {
                  title: "Chairman guide",
                  instructions: [
                    {
                      title: "1. Use the system for oversight, not duplicate administration",
                      body: "Chairman access is for visibility across till control, cash control, hall bookings, reports, and membership without turning the role into a second operator.",
                    },
                    {
                      title: "2. Focus on trends, exceptions, and unresolved items",
                      body: "Use Till control, Cash control, Reports, Annual Leave, Staff rota, and Membership Portal to spot recurring issues, control gaps, and patterns that need committee attention.",
                    },
                    {
                      title: "3. Keep role ownership clear",
                      body: "Operational entry should stay with the role holder so the audit trail remains clear and no one is left guessing who actually did the work.",
                    },
                    {
                      title: "4. Use access to challenge weak controls early",
                      body: "Repeated till differences, poor safe discipline, missing booking follow-up, or weak membership administration should be raised before they become normal practice.",
                    },
                  ],
                  faqs: [
                    {
                      title: "Should I correct live entries myself?",
                      body: "Only in genuine cover situations. Normally, the best use of Chairman access is to review, question, and ensure the correct role fixes the source record.",
                    },
                    {
                      title: "What is the main control question to ask?",
                      body: "Ask whether the system record matches what physically happened, and whether the right role recorded it at the right time.",
                    },
                  ],
                }
              : {
                  title: "Role guide",
                  instructions: [],
                  faqs: [],
                };
  const guideCards = roleGuide.instructions;
  const guideFaqs = roleGuide.faqs;
  const roleGuideTitle = roleGuide.title;
  const roleWorkspaceTabs = isBookkeeper
    ? [
        { key: "workspace" as const, label: "Workspace" },
        { key: "guide" as const, label: "Help & training" },
      ]
    : [
        { key: "attention" as const, label: "Attention" },
        { key: "activity" as const, label: "Latest activity" },
        { key: "guide" as const, label: "Help & training" },
      ];

  function dismissNotification(id: string) {
    setDismissedNotifications((current) => {
      const next = [...current, id];
      if (typeof window !== "undefined") {
        window.localStorage.setItem("greenhithe.dismissed-notifications", JSON.stringify(next));
      }
      return next;
    });
  }

  function dismissAllNotifications() {
    const ids = allNotifications.map((item) => item.id);
    setDismissedNotifications((current) => {
      const next = Array.from(new Set([...current, ...ids]));
      if (typeof window !== "undefined") {
        window.localStorage.setItem("greenhithe.dismissed-notifications", JSON.stringify(next));
      }
      return next;
    });
  }

  function moveStaffContract(documentId: string, status: "current" | "former") {
    setFormerStaffContractIds((current) => {
      const next =
        status === "former"
          ? Array.from(new Set([...current, documentId]))
          : current.filter((id) => id !== documentId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("greenhithe.former-staff-contracts", JSON.stringify(next));
      }
      return next;
    });
  }

  async function openStaffContract(documentId: string) {
    const popup = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setStaffContractError(null);
    setOpeningStaffContractId(documentId);
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Sign in again before opening staff contracts.");
      const response = await fetch(`/api/company-documents/staff-contracts/${documentId}`, {
        headers: {
          Authorization: `Bearer ${await current.getIdToken()}`,
        },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Unable to open staff contract.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      if (popup) {
        popup.location.href = url;
      } else {
        window.open(url, "_blank");
      }
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (popup) popup.close();
      setStaffContractError(error instanceof Error ? error.message : "Unable to open staff contract.");
    } finally {
      setOpeningStaffContractId(null);
    }
  }

  async function handleMarkWeeklyReviewComplete() {
    if (!pendingWeeklyReviewReport) return;
    setCompletingWeeklyReview(true);
    try {
      const updated = await setWeeklyReportGmReviewComplete({
        weekCommencing: pendingWeeklyReviewReport.weekCommencing,
        completed: true,
      });
      setWeeklyReports((current) =>
        current.map((report) => (report.id === updated.id || report.weekCommencing === updated.weekCommencing ? updated : report)),
      );
    } finally {
      setCompletingWeeklyReview(false);
    }
  }

  return (
    <DashboardShell metrics={dashboardMetrics}>
      {gmNeedsWeeklyReview ? (
        <SectionCard
          eyebrow="Weekly Review"
          title={`Week ending ${gmReviewWeekLabel} is waiting for management review`}
          description={
            submittedCount > 0
              ? `${submittedCount} till submission${submittedCount === 1 ? "" : "s"} still need approval before you complete the weekly review and lock.`
              : "All current till submissions are clear. Review the weekly takings, check other income and deductions, then lock the week when you are satisfied."
          }
        >
          <div className="flex flex-wrap gap-3">
            <Link href="/approvals" className={primaryActionClass}>
              Review approvals
            </Link>
            <Link href="/weekly-takings" className={secondaryActionClass}>
              Review weekly takings
            </Link>
            <button onClick={() => void handleMarkWeeklyReviewComplete()} disabled={completingWeeklyReview} className={subtleActionClass}>
              {completingWeeklyReview ? "Saving..." : "Review complete"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <section className="grid gap-6">
        <SectionCard
          eyebrow="Session"
          title={`Signed in as ${displayName}${user ? `, ${roleLabel(user.role)}` : ""}`}
          description={
            isStaff
              ? "Staff access is focused on till close-down and recent submissions."
              : isSecretary
                ? "Secretary access is focused on the daily cash log, invoice intake, the booking diary, and membership administration."
                : isBookkeeper
                  ? "Bookkeeper access is limited to the monthly Sage support dashboard and linked support documents."
                : "Access is organised by role for approvals, reports, bookings, and club administration."
          }
        >
          <div className="flex flex-wrap gap-2">
              {[
              { key: "profile" as const, label: "Profile" },
              { key: "actions" as const, label: "Action board" },
              ...(usesRoleWorkspace ? [{ key: "workspace" as const, label: "Workspace" }] : []),
              { key: "documents" as const, label: "Company documents" },
              ...(isStaff ? [{ key: "setup" as const, label: "App setup" }] : []),
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSessionTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  sessionTab === tab.key
                    ? "bg-[linear-gradient(135deg,#1b4d5c,#24697c)] text-white shadow-[0_12px_30px_rgba(27,77,92,0.18)]"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {sessionTab === "profile" ? (
            <div className="mt-4 grid gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-sm">
                        {environmentLabel}
                      </span>
                      {user ? (
                        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                          {roleLabel(user.role)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Account</p>
                    <p className="mt-2 text-sm text-slate-600">{user?.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {canSelfServePassword ? (
                      <button
                        onClick={() => {
                          setShowPasswordModal(true);
                          setPasswordError(null);
                          setPasswordMessage(null);
                        }}
                        className={subtleActionClass}
                      >
                        Change my password
                      </button>
                    ) : null}
                    <button
                      onClick={() => signOut()}
                      className={subtleActionClass}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-700">
                  {isStaff
                    ? "Use this dashboard to complete till close-down, check recent submissions, and hand figures over for review."
                    : isSecretary
                      ? "Use this dashboard to record live daily cash activity, review reports, maintain the invoice register, view hall bookings, and manage membership work."
                      : isBookkeeper
                        ? "Use this dashboard to open the monthly finance pack, review the Sage support figures, and work from the linked OneDrive support papers."
                        : "Use this dashboard to move between daily operations, finance review, bookings, and administration without switching systems."}
                </p>
              </div>
              <div className={`grid gap-4 ${usesRoleWorkspace ? "" : "xl:grid-cols-[1.05fr_0.95fr]"}`}>
                {!usesRoleWorkspace ? (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(27,77,92,0.08),rgba(255,255,255,0.96))] px-5 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">What changed today</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">A quick timeline of today’s operational activity.</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Hiding an item clears it from this dashboard only. It does not delete the underlying record.</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {todaysActivity.length} item{todaysActivity.length === 1 ? "" : "s"}
                        </span>
                        {todaysActivity.length > 0 ? (
                          <button
                            type="button"
                            onClick={dismissAllNotifications}
                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
                          >
                            Hide all from dashboard
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {todaysActivity.length === 0 ? (
                      <div className="mt-4 rounded-[1.2rem] border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                        No operational activity has been recorded yet today.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {todaysActivity.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:border-amber-300"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1b4d5c]">
                                    {notificationCategoryLabel(item.id)}
                                  </span>
                                  <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                    {new Date(item.when).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <p className="mt-3 text-sm font-semibold text-slate-950">{item.title}</p>
                                <p className="mt-1 text-sm leading-6 text-slate-700">{item.detail}</p>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <Link
                                  href={item.href}
                                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline"
                                >
                                  Open
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => dismissNotification(item.id)}
                                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  Hide from dashboard
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Control health</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">A quick sense check on the main control points that matter today.</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {controlHealthItems.map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        className="block rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4 no-underline transition hover:-translate-y-0.5 hover:border-amber-300"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                              item.status === "Clear"
                                ? "bg-emerald-50 text-emerald-800"
                                : item.status === "Due"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-rose-50 text-rose-800"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{item.detail}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {sessionTab === "actions" ? (
            <div className="mt-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(27,77,92,0.08),rgba(255,255,255,0.96))] px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Most used</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Start here for the screens this role is most likely to open during the day.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {primaryActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className={`rounded-[1.4rem] border p-4 no-underline shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 ${
                        action.tone === "primary"
                          ? "border-slate-900 bg-slate-950 !text-white [&_p]:!text-white"
                          : "border-[#2c6675]/20 bg-[linear-gradient(135deg,rgba(27,77,92,0.08),rgba(36,105,124,0.04))] text-slate-950"
                      }`}
                    >
                      <p className={`text-base font-semibold ${action.tone === "primary" ? "!text-white" : "text-slate-950"}`}>{action.label}</p>
                      <p className={`mt-2 text-sm leading-6 ${action.tone === "primary" ? "!text-slate-200" : "text-slate-700"}`}>{action.description}</p>
                      <p className={`mt-3 text-xs font-semibold uppercase tracking-[0.14em] ${action.tone === "primary" ? "!text-amber-200" : "text-[#1b4d5c]"}`}>
                        Open screen
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
              {managementActions.length > 0 ? (
                <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white/85 px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">More tools</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Lower-frequency screens that still need to stay easy to reach, including Hall bookings and Membership Portal where this role can use them.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {managementActions.length} tools
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {managementActions.map((action) => (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="rounded-[1.4rem] border border-slate-200 bg-white p-4 no-underline shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-amber-300"
                      >
                        <p className="text-base font-semibold text-slate-950">{action.label}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{action.description}</p>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#1b4d5c]">Open screen</p>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {sessionTab === "documents" ? (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Company documents</p>
                  <p className="mt-2 font-serif text-2xl text-slate-950">Employee Handbook</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Current employee handbook for staff policies, expectations, and employment procedures.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/company-documents/employee-handbook-current.pdf" target="_blank" className={secondaryActionClass}>
                      Open handbook
                    </Link>
                    <Link href="/annual-leave" className={subtleActionClass}>
                      Open annual leave policy
                    </Link>
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-5 text-amber-950">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">Annual leave reference</p>
                  <p className="mt-2 text-sm leading-6">
                    Annual leave entitlement, accrual and carry-over guidance is now held in the Annual Leave screen under the Policy tab. The handbook remains the wider employment reference.
                  </p>
                </div>
              </div>
              {isManagementLead ? (
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Restricted documents</p>
                      <p className="mt-2 font-serif text-2xl text-slate-950">Staff contracts and SOEs</p>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                        Visible to the General Manager and Treasurer only. All uploaded contracts are treated as current for now; move a record to no longer employed when required.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {staffContractDocuments.length} documents
                    </span>
                  </div>
                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    {staffContractError ? (
                      <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800 xl:col-span-2">
                        {staffContractError}
                      </div>
                    ) : null}
                    <div className="rounded-[1.3rem] border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-emerald-950">Current employees</p>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                          {currentStaffContracts.length}
                        </span>
                      </div>
                      <div className="mt-3 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
                        {currentStaffContracts.length === 0 ? (
                          <p className="rounded-[1rem] border border-dashed border-emerald-200 bg-white/70 px-3 py-3 text-sm text-emerald-900">
                            No current employee contracts are showing.
                          </p>
                        ) : (
                          currentStaffContracts.map((document) => (
                            <div key={document.id} className="rounded-[1rem] border border-emerald-100 bg-white px-3 py-3">
                              <p className="text-sm font-semibold text-slate-950">{document.employeeName}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{document.documentType}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void openStaffContract(document.id)}
                                  disabled={openingStaffContractId === document.id}
                                  className="rounded-full bg-[#1b4d5c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {openingStaffContractId === document.id ? "Opening..." : "Open PDF"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStaffContract(document.id, "former")}
                                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  Move to no longer employed
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">No longer employed</p>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {formerStaffContracts.length}
                        </span>
                      </div>
                      <div className="mt-3 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
                        {formerStaffContracts.length === 0 ? (
                          <p className="rounded-[1rem] border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-sm text-slate-600">
                            No former employee contracts have been moved here yet.
                          </p>
                        ) : (
                          formerStaffContracts.map((document) => (
                            <div key={document.id} className="rounded-[1rem] border border-slate-200 bg-white px-3 py-3">
                              <p className="text-sm font-semibold text-slate-950">{document.employeeName}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{document.documentType}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void openStaffContract(document.id)}
                                  disabled={openingStaffContractId === document.id}
                                  className="rounded-full bg-[#1b4d5c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {openingStaffContractId === document.id ? "Opening..." : "Open PDF"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStaffContract(document.id, "current")}
                                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  Move back to current
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {sessionTab === "setup" && isStaff ? (
            <div className="mt-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Staff app setup</p>
                <p className="mt-2 font-serif text-2xl text-slate-950">Install Club Hub and use rota notifications</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">Use these steps once on each device you want to receive rota alerts on.</p>
              </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Get the app on your device</p>
                <div className="mt-4 grid gap-3">
                  {[
                    {
                      title: "1. Open the Club Hub link",
                      body: "Open the Club Hub URL in your browser and sign in with the details provided by the club. Use the normal browser first; once installed, use the app icon.",
                    },
                    {
                      title: "2. Save or install it",
                      body: "On a PC or laptop, use the browser install option, usually shown as Install app in the address bar or browser menu. On iPhone/iPad, open Safari, tap Share, then Add to Home Screen. On Android, open Chrome and choose Install app or Add to Home screen.",
                    },
                    {
                      title: "3. Open it from the new icon",
                      body: "After installing, open Club Hub from the desktop, home screen, or app list. This makes it behave more like an app and helps notifications work properly.",
                    },
                  ].map((item) => (
                    <div key={item.title} className="rounded-[1.2rem] border border-white/80 bg-white/85 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Rota and notifications</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-[1.2rem] border border-white/80 bg-white/85 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-950">Enable rota alerts</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Open Staff rota and press Enable notifications on each device. When the browser asks, allow notifications. If you use more than one phone, tablet, or computer, enable notifications on each one.
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/80 bg-white/85 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-950">Assigned shifts</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Assigned shifts appear under My rota. Please accept or decline them promptly so the GM can see whether cover is confirmed. If a shift changes after acceptance, you may be asked to accept it again.
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/80 bg-white/85 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-950">Open shifts</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Open shifts are extra shifts offered to the relevant staff groups. If you claim one, it becomes yours and the GM is notified. Use the rota swap request if you later need someone else to cover an accepted shift.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/staff-rota" className={secondaryActionClass}>
                    Open Staff rota
                  </Link>
                  <button type="button" onClick={() => setShowRoleGuide(true)} className={subtleActionClass}>
                    Open staff guide
                  </button>
                </div>
              </div>
            </div>
            </div>
          ) : null}
        </SectionCard>
        
        {usesRoleWorkspace && sessionTab === "workspace" ? (
          <SectionCard
            eyebrow={isManager ? "GM Workspace" : isTreasurer ? "Treasurer Workspace" : isBookkeeper ? "Bookkeeper Workspace" : "Chairman Workspace"}
            title={
              isManagementLead
                ? "Workspace"
                : isBookkeeper
                  ? "Bookkeeper workspace"
                  : "Oversight workspace"
            }
            description={
              isManagementLead
                ? "Keep the live management tasks, activity, and guide in one cleaner working area."
                : isBookkeeper
                  ? "Keep the Sage support area and the role guide together in one cleaner working area."
                  : "Use this area for the live oversight queue, recent activity, and the Chairman guide."
            }
          >
            <div className="flex flex-wrap gap-2">
              {roleWorkspaceTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRoleWorkspaceTab(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    roleWorkspaceTab === tab.key
                      ? "bg-[linear-gradient(135deg,#1b4d5c,#24697c)] text-white shadow-[0_12px_30px_rgba(27,77,92,0.18)]"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {roleWorkspaceTab === "workspace" ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(27,77,92,0.08),rgba(255,255,255,0.95))] px-4 py-4">
                  <p className="text-sm font-semibold text-slate-950">Monthly finance pack</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Use this for the monthly finance pack, week-by-week Sage posting tracker, month-end lock, and linked OneDrive support papers.
                  </p>
                  <div className="mt-4">
                    <Link href="/reports" className={secondaryActionClass}>
                      Open monthly finance pack
                    </Link>
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(255,255,255,0.92))] px-4 py-4">
                  <p className="text-sm font-semibold text-slate-950">Month-end discipline</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Work through the weekly Sage posting items as the month progresses, then lock the month only when the monthly pack is complete and the support papers are in place.
                  </p>
                </div>
              </div>
            ) : null}

            {roleWorkspaceTab === "attention" ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Needs attention today</p>
                      <p className="mt-1 text-sm text-slate-600">Open the live items that still need action, without digging through the rest of the dashboard.</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {needsAttentionToday.length} queue item{needsAttentionToday.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {needsAttentionToday.map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        className="rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(27,77,92,0.06),rgba(255,255,255,0.94))] px-4 py-4 no-underline transition hover:-translate-y-0.5 hover:border-amber-300"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#1b4d5c]">
                            {item.countLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{item.detail}</p>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#1b4d5c]">Open now</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {roleWorkspaceTab === "activity" ? (
              <div className="mt-4">
                {notifications.length > 0 ? (
                  <div className="mb-4 grid gap-4">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(27,77,92,0.08),rgba(255,255,255,0.96))] px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-3xl">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Latest activity</p>
                          <p className="mt-3 text-lg font-semibold text-slate-950">{notifications[0].title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{notifications[0].detail}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#1b4d5c]">
                              {notificationCategoryLabel(notifications[0].id)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                              {new Date(notifications[0].when).toLocaleString("en-GB")}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Link href={notifications[0].href} className={secondaryActionClass}>
                            Open latest item
                          </Link>
                          <button
                            type="button"
                            onClick={dismissAllNotifications}
                            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
                          >
                            Hide all from dashboard
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-white/80 px-4 py-3">
                      <p className="text-sm text-slate-600">
                        Showing the latest {notifications.length} item{notifications.length === 1 ? "" : "s"} in time order.
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                  {notifications.length === 0 ? (
                    <p className="rounded-[1.4rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                      No notifications at the moment.
                    </p>
                  ) : (
                    visibleNotifications.map((notification, index) => (
                      <div key={notification.id} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1b4d5c]">
                                {notificationCategoryLabel(notification.id)}
                              </span>
                              {index === 0 ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                  Newest
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-3 text-base font-semibold text-slate-950">{notification.title}</p>
                            <p className="mt-1 text-sm text-slate-600">{notification.detail}</p>
                            <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">
                              {new Date(notification.when).toLocaleString("en-GB")}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link href={notification.href} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline">
                              Open
                            </Link>
                            <button
                              type="button"
                              onClick={() => dismissNotification(notification.id)}
                              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Hide from dashboard
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {hiddenNotificationsCount > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm text-slate-600">
                      {hiddenNotificationsCount} older activit{hiddenNotificationsCount === 1 ? "y is" : "ies are"} hidden to keep this list compact.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAllLatestActivity((current) => !current)}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
                    >
                      {showAllLatestActivity ? "Show fewer items" : "Show full activity"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {roleWorkspaceTab === "guide" ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(36,105,124,0.10),rgba(255,255,255,0.96))] px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Help & training</p>
                      <p className="mt-3 text-lg font-semibold text-slate-950">Role guide and working order</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Use the guide during go-live, when someone covers another role, or whenever a workflow changes. It keeps everyone working from the same rules and gives people one place to check the process before they save anything.
                      </p>
                    </div>
                    <button type="button" onClick={() => setShowRoleGuide(true)} className={secondaryActionClass}>
                      Open full role guide
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Top instructions</p>
                    <div className="mt-3 space-y-3">
                      {guideCards.slice(0, 4).map((item) => (
                        <div key={item.title} className="rounded-[1.1rem] border border-white/80 bg-white/80 px-3 py-3">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-700">{item.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Quick answers</p>
                    <div className="mt-3 space-y-3">
                      {guideFaqs.slice(0, 3).map((item) => (
                        <div key={item.title} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-700">{item.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">About Club Hub</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">System credits, ownership and data responsibilities</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                      Internal governance
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {clubHubGovernanceCards.map((item) => (
                      <div key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </SectionCard>
        ) : !isStaff && !isBookkeeper ? (
          <SectionCard
            eyebrow="Needs attention today"
            title="Open the live actions for today"
            description="A compact queue of what still needs looking at, without digging through the rest of the dashboard."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {needsAttentionToday.map((item) => (
                <div key={item.title} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#1b4d5c]">
                      {item.countLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.detail}</p>
                  <div className="mt-3">
                    <Link href={item.href} className="text-sm font-semibold text-[#1b4d5c]">
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {!usesRoleWorkspace ? (
        <SectionCard
          eyebrow={isStaff ? "Recent Entries" : isBookkeeper ? "Monthly Finance" : "Notifications"}
          title={isStaff ? "Your latest till submissions" : isBookkeeper ? "Monthly finance workspace" : "Latest activity"}
          description={
            isStaff
              ? "Saved drafts and submitted till-balancing entries appear here. Tap a draft to reopen it and carry on."
              : isBookkeeper
                ? "Open the monthly Sage support view and work from the monthly finance pack rather than the operational screens."
                : "The latest operational activity, limited to the 10 most recent items."
          }
        >
          {isStaff ? (
            <div className="max-h-[24rem] space-y-3 overflow-y-auto pr-1">
              {recentSubmissions.length === 0 ? (
                <p className="rounded-[1.4rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                  No submissions yet. Open the till close screen and save a draft or submit a shift.
                </p>
              ) : (
                recentSubmissions.map((submission) => (
                  <button
                    type="button"
                    key={submission.id}
                    onClick={() => setSelectedSubmission(submission)}
                    className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-amber-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-slate-950">{submission.shiftLabel}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {submission.submittedBy.displayName} · {new Date(submission.submittedAt).toLocaleString("en-GB")}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          Counted total {currency(submission.totals.countedTotal)} · Variance {currency(submission.totals.variance)}
                        </p>
                      </div>
                      <StatusPill
                        tone={
                          submission.status === "draft"
                            ? "reserved"
                            : submission.status === "submitted"
                              ? "confirmed"
                              : submission.status === "returned-for-resubmission"
                                ? "in-progress"
                              : submission.status === "manager-approved"
                                ? "in-progress"
                                : "checked-in"
                        }
                      >
                        {submission.status.replace("-", " ")}
                      </StatusPill>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#1b4d5c]">Open submission</p>
                  </button>
                ))
              )}
            </div>
          ) : isBookkeeper ? (
            <div className="grid gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-base font-semibold text-slate-950">Monthly finance pack</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Use this for the monthly finance pack, month-end lock status, membership and branch-subscription summaries, and linked OneDrive support papers.
                </p>
                <div className="mt-3">
                  <Link href="/reports" className="text-sm font-semibold text-[#1b4d5c]">
                    Open monthly finance pack
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {notifications.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    Showing the latest {notifications.length} item{notifications.length === 1 ? "" : "s"}.
                  </p>
                  <button
                    type="button"
                    onClick={dismissAllNotifications}
                    className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
                  >
                    Hide all from dashboard
                  </button>
                </div>
              ) : null}
              <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <p className="rounded-[1.4rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                    No notifications at the moment.
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <div key={notification.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-slate-950">{notification.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{notification.detail}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">
                            {new Date(notification.when).toLocaleString("en-GB")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissNotification(notification.id)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          Hide from dashboard
                        </button>
                      </div>
                      <div className="mt-3">
                        <Link href={notification.href} className="text-sm font-semibold text-[#1b4d5c]">
                          Open
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </SectionCard>
        ) : null}
      </section>

      {showRoleGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Role Guide</p>
                <h2 className="mt-2 font-serif text-3xl text-slate-950">{roleGuideTitle}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Use this as the training guide for the role. It explains the working order, the control points that matter, and the FAQ for common issues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleGuide(false)}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Instructions</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {guideCards.map((item) => (
                    <div key={item.title} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
              {guideFaqs.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">FAQ</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {guideFaqs.map((item) => (
                      <div key={item.title} className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">About Club Hub | System Credits | Data & Legal</p>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  {clubHubGovernanceCards.map((item) => (
                    <div key={item.title} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {showPasswordModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <section className="w-full max-w-xl rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Account security</p>
                <h2 className="mt-2 font-serif text-3xl text-slate-950">Change my password</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Enter your current password, then choose a new one. This is only available for email-based accounts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError(null);
                  setPasswordMessage(null);
                }}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Current password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">New password</span>
                <input
                  type="password"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </label>
              {passwordError ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">{passwordError}</p> : null}
              {passwordMessage ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{passwordMessage}</p> : null}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleChangePassword()}
                  disabled={savingPassword}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingPassword ? "Saving..." : "Save new password"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {selectedSubmission ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Till submission</p>
                <h2 className="mt-2 font-serif text-3xl text-slate-950">{selectedSubmission.shiftLabel}</h2>
                <p className="mt-2 text-sm text-slate-600">{new Date(selectedSubmission.submittedAt).toLocaleString("en-GB")}</p>
              </div>
              <button onClick={() => setSelectedSubmission(null)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4">
              {selectedSubmission.areas.map((area) => (
                <div key={`${selectedSubmission.id}-${area.areaName}`} className="rounded-[1.4rem] bg-slate-50 p-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{area.areaName}</p>
                  <div className="mt-3 rounded-[1rem] border border-emerald-100 bg-emerald-50 p-3 text-sm text-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Sales entered by staff</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <p>Gross sales: {currency(grossSalesForDisplay(area))}</p>
                      <p>Refunds: {currency(refundsForDisplay(area))}</p>
                      <p>Net sales: {currency(area.zTotal)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <p>Actual total: {currency(area.actualTotal)}</p>
                    <p>Net sales: {currency(area.zTotal)}</p>
                    <p>Cash counted: {currency(area.cashCounted)}</p>
                    <p>Card payment: {currency(area.cardPayment)}</p>
                    <p>Cashback: {currency(area.cashback ?? 0)}</p>
                    <p>Lotto (pull tabs): {currency(area.lottoPayouts ?? 0)}</p>
                    <p>Ullage: {currency(area.ullage ?? 0)}</p>
                  </div>
                </div>
              ))}
              {selectedSubmission.notes ? (
                <div className="rounded-[1.4rem] bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Notes</p>
                  <p className="mt-2 text-sm text-slate-700">{selectedSubmission.notes}</p>
                </div>
              ) : null}
              {selectedSubmission.managerFeedback ? (
                <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-amber-800">Manager feedback</p>
                  <p className="mt-2 text-sm text-amber-950">{selectedSubmission.managerFeedback}</p>
                </div>
              ) : null}
            </div>
            {isStaff && (selectedSubmission.status === "draft" || selectedSubmission.status === "returned-for-resubmission") ? (
              <div className="mt-6 flex justify-end">
                <Link
                  href={`/till-close?submission=${selectedSubmission.id}`}
                  onClick={() => setSelectedSubmission(null)}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  {selectedSubmission.status === "returned-for-resubmission" ? "Open and re-submit" : "Continue editing"}
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
