import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ReceiptText,
} from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiErrorMessage } from "../../src/api/client";
import { EmptyState, LoadingState, Screen } from "../../src/components/ui";
import { useAuth } from "../../src/services/auth";
import { useChildren } from "../../src/services/parentData";
import { familyApi } from "../../src/features/familyApi";
import { colors } from "../../src/theme/tokens";

type FeeTab = "Overview" | "Payment history" | "Invoices";
const tabs: FeeTab[] = ["Overview", "Payment history", "Invoices"];

function amount(value: string, currency: string | null) {
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

export default function FeesScreen() {
  const router = useRouter();
  const { parent } = useAuth();
  const { selectedChild } = useChildren();
  const [activeTab, setActiveTab] = useState<FeeTab>("Overview");
  const query = useQuery({
    queryKey: ["fees", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.fees(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const fees = query.data;

  return (
    <Screen
      contentStyle={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.blue}
        />
      }
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft color={colors.ink} size={21} />
        </Pressable>
        <Text style={styles.pageTitle}>Fees & payments</Text>
      </View>

      {selectedChild ? (
        <View style={styles.studentCard}>
          <View style={styles.studentAvatar}>
            <Text style={styles.studentInitials}>
              {selectedChild.first_name[0]}
              {selectedChild.last_name[0]}
            </Text>
          </View>
          <View style={styles.studentInfo}>
            <Text style={styles.studentName} numberOfLines={1}>
              {selectedChild.first_name} {selectedChild.last_name}
            </Text>
            <Text style={styles.schoolLine} numberOfLines={1}>
              {selectedChild.class_name ?? selectedChild.admission_number} ·{" "}
              {parent?.school_name}
            </Text>
          </View>
          <ChevronRight size={19} color={colors.mutedLight} />
        </View>
      ) : null}

      <View style={styles.tabRail}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Fee details could not load"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : fees ? (
        <>
          {activeTab === "Overview" ? (
            <>
              <View style={styles.balanceCard}>
                <View style={styles.balanceTop}>
                  <View style={styles.balanceIcon}>
                    <CreditCard color={colors.blue} size={21} />
                  </View>
                  {Number(fees.outstanding_total) > 0 ? (
                    <Text style={styles.dueBadge}>Outstanding</Text>
                  ) : (
                    <Text style={styles.paidBadge}>Up to date</Text>
                  )}
                </View>
                <Text style={styles.overline}>Total outstanding</Text>
                <Text style={styles.outstanding}>
                  {amount(fees.outstanding_total, fees.currency)}
                </Text>
                <Text style={styles.balanceNote}>
                  Outstanding amount across issued invoices
                </Text>
                <View style={styles.totalStrip}>
                  <Total
                    label="Paid"
                    value={amount(fees.paid_total, fees.currency)}
                    kind="paid"
                  />
                  <View style={styles.separator} />
                  <Total
                    label="Total fees"
                    value={amount(fees.invoiced_total, fees.currency)}
                  />
                  <View style={styles.separator} />
                  <Total
                    label="Remaining"
                    value={amount(fees.outstanding_total, fees.currency)}
                    kind="remaining"
                  />
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Fee breakdown</Text>
                <Pressable onPress={() => setActiveTab("Invoices")}>
                  <Text style={styles.viewAll}>View all</Text>
                </Pressable>
              </View>
              {!fees.invoices.length ? (
                <View style={styles.emptyCard}>
                  <ReceiptText color={colors.blue} size={20} />
                  <Text style={styles.emptyTitle}>No invoices yet</Text>
                  <Text style={styles.emptyBody}>
                    Invoices issued by your school will appear here.
                  </Text>
                </View>
              ) : (
                <View style={styles.listCard}>
                  {fees.invoices.slice(0, 5).map((invoice, index) => (
                    <View
                      key={invoice.id}
                      style={[styles.feeRow, index > 0 && styles.rowBorder]}
                    >
                      <View style={styles.feeIcon}>
                        <ReceiptText color={colors.blue} size={17} />
                      </View>
                      <View style={styles.feeInfo}>
                        <Text style={styles.feeTitle} numberOfLines={1}>
                          {invoice.term_name} · {invoice.academic_year_name}
                        </Text>
                        <Text style={styles.feeMeta}>
                          {invoice.invoice_number}
                        </Text>
                      </View>
                      <View style={styles.feeAmountColumn}>
                        <Text style={styles.feeAmount}>
                          {amount(invoice.total_amount, fees.currency)}
                        </Text>
                        <Text
                          style={[
                            styles.status,
                            Number(invoice.balance) <= 0
                              ? styles.statusPaid
                              : styles.statusPending,
                          ]}
                        >
                          {Number(invoice.balance) <= 0
                            ? "Paid"
                            : Number(invoice.paid_amount) > 0
                              ? "Partial"
                              : "Pending"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.helpCard}>
                <View style={styles.helpIcon}>
                  <CircleHelp size={18} color={colors.blue} />
                </View>
                <View style={styles.helpText}>
                  <Text style={styles.helpTitle}>
                    Need help with a payment?
                  </Text>
                  <Text style={styles.helpBody}>
                    Contact your school office for payment options and
                    assistance.
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.mutedLight} />
              </View>
            </>
          ) : activeTab === "Invoices" ? (
            <>
              <Text style={styles.sectionTitle}>Invoices</Text>
              {!fees.invoices.length ? (
                <EmptyState
                  title="No invoices available"
                  body="Your school has not issued a fee invoice for this student yet."
                />
              ) : (
                <View style={styles.listCard}>
                  {fees.invoices.map((invoice, index) => (
                    <View
                      key={invoice.id}
                      style={[styles.invoiceRow, index > 0 && styles.rowBorder]}
                    >
                      <View style={styles.feeIcon}>
                        <ReceiptText color={colors.blue} size={17} />
                      </View>
                      <View style={styles.feeInfo}>
                        <Text style={styles.feeTitle}>
                          {invoice.invoice_number}
                        </Text>
                        <Text style={styles.feeMeta}>
                          {invoice.term_name} · {invoice.academic_year_name}
                        </Text>
                        <Text style={styles.feeMeta}>
                          Issued{" "}
                          {new Date(
                            `${invoice.issued_on}T00:00:00`,
                          ).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={styles.feeAmountColumn}>
                        <Text style={styles.feeAmount}>
                          {amount(invoice.total_amount, fees.currency)}
                        </Text>
                        <Text style={styles.balanceDue}>
                          Due {amount(invoice.balance, fees.currency)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Payment history</Text>
              {!fees.payments.length ? (
                <EmptyState
                  title="No payments recorded"
                  body="Confirmed school payments and their receipt references will appear here."
                />
              ) : (
                <View style={styles.listCard}>
                  {fees.payments.map((payment, index) => (
                    <View
                      key={payment.id}
                      style={[styles.invoiceRow, index > 0 && styles.rowBorder]}
                    >
                      <View style={[styles.feeIcon, styles.paidIcon]}>
                        <Check color={colors.blue} size={17} />
                      </View>
                      <View style={styles.feeInfo}>
                        <Text style={styles.feeTitle}>
                          {payment.receipt_number}
                        </Text>
                        <Text style={styles.feeMeta}>
                          {payment.method.replaceAll("_", " ")} ·{" "}
                          {new Date(
                            `${payment.payment_date}T00:00:00`,
                          ).toLocaleDateString()}
                        </Text>
                        {payment.reference ? (
                          <Text style={styles.feeMeta}>
                            Reference {payment.reference}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.feeAmount}>
                        {amount(payment.amount, fees.currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          <Text style={styles.disclaimer}>
            Payment records reflect entries confirmed by{" "}
            {parent?.school_name ?? "your school"}. Online payment is not
            enabled for this account.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

function Total({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind?: "paid" | "remaining";
}) {
  return (
    <View style={styles.totalItem}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text
        style={[
          styles.totalValue,
          kind === "paid" && styles.paidValue,
          kind === "remaining" && styles.remainingValue,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 17, paddingTop: 8, paddingBottom: 30, gap: 15 },
  header: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 40 },
  backButton: {
    width: 30,
    height: 38,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  pageTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  studentCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 25,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  studentInitials: { color: colors.blue, fontSize: 15, fontWeight: "800" },
  studentInfo: { flex: 1, gap: 5 },
  studentName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  schoolLine: { color: colors.muted, fontSize: 10 },
  tabRail: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: -17,
    paddingHorizontal: 9,
  },
  tab: {
    minHeight: 42,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: colors.blue },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "500" },
  activeTabText: { color: colors.blue, fontWeight: "700" },
  balanceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  balanceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceIcon: {
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dueBadge: {
    color: colors.blue,
    backgroundColor: colors.blueSoft,
    overflow: "hidden",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: "700",
  },
  paidBadge: {
    color: colors.blue,
    backgroundColor: colors.blueSoft,
    overflow: "hidden",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: "700",
  },
  overline: { color: colors.muted, fontSize: 11, marginTop: 12 },
  outstanding: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  balanceNote: { color: colors.muted, fontSize: 10, marginTop: 4 },
  totalStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderTopColor: "#EAF0FA",
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 12,
    gap: 7,
  },
  totalItem: { flex: 1, gap: 6 },
  totalLabel: { color: colors.muted, fontSize: 9 },
  totalValue: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  paidValue: { color: colors.blue },
  remainingValue: { color: colors.blueDeep },
  separator: { width: 1, height: 34, backgroundColor: "#EAF0FA" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 1,
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  viewAll: { color: colors.blue, fontSize: 10, fontWeight: "600" },
  listCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 11,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 62,
    gap: 9,
    paddingVertical: 8,
  },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    gap: 9,
    paddingVertical: 10,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#EDF1F7" },
  feeIcon: {
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  paidIcon: { backgroundColor: "#EAF2FF" },
  feeInfo: { flex: 1, gap: 4 },
  feeTitle: { color: colors.ink, fontSize: 11, fontWeight: "600" },
  feeMeta: { color: colors.muted, fontSize: 9 },
  feeAmountColumn: { alignItems: "flex-end", gap: 4 },
  feeAmount: { color: colors.ink, fontSize: 10, fontWeight: "600" },
  status: {
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: "700",
  },
  statusPaid: { color: colors.blue, backgroundColor: colors.blueSoft },
  statusPending: { color: colors.blueDeep, backgroundColor: "#EDF4FF" },
  balanceDue: { color: colors.blue, fontSize: 9 },
  helpCard: {
    backgroundColor: "#EFF5FF",
    borderRadius: 15,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#DFEAFC",
  },
  helpIcon: {
    width: 33,
    height: 33,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  helpText: { flex: 1, gap: 4 },
  helpTitle: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  helpBody: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  emptyBody: { color: colors.muted, fontSize: 10, textAlign: "center" },
  disclaimer: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
