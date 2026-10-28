import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  History,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react-native";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { apiErrorMessage } from "../../src/api/client";
import { ChildSwitcher } from "../../src/components/ChildSwitcher";
import { PageHeader } from "../../src/components/insights/PageHeader";
import {
  AnimatedNumberText,
  AnimatedProgressBar,
  AnimatedRing,
  FloatingOrb,
  InsightSectionHeader,
  PressableScale,
  SegmentedTabs,
} from "../../src/components/insights/InsightVisuals";
import { EmptyState, LoadingState } from "../../src/components/ui";
import { familyApi } from "../../src/features/familyApi";
import {
  feeSummary,
  formatMoney,
  formatShortDate,
  insightColors,
  invoiceState,
  paymentMethodLabel,
  paymentStatus,
  prettyTerm,
  sortedInvoices,
  sortedPayments,
  statusColors as feeStatusColors,
  type FeeSummary,
} from "../../src/features/insights";
import { useAuth } from "../../src/services/auth";
import { useChildren } from "../../src/services/parentData";
import type {
  Child,
  FeeInvoice,
  FeePayment,
  FeesSummary,
} from "../../src/types/models";

const FEE_TABS = ["Overview", "Payments", "Invoices"] as const;
type FeeTab = (typeof FEE_TABS)[number];

export default function FeesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { parent } = useAuth();
  const {
    selectedChild,
    isLoading: childrenLoading,
    error: childrenError,
  } = useChildren();
  const [tab, setTab] = useState<FeeTab>("Overview");
  const scrollRef = useRef<ScrollViewInstance>(null);

  const query = useQuery({
    queryKey: ["fees", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.fees(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const fees = query.data;
  const summary = useMemo(() => feeSummary(fees), [fees]);
  const invoices = useMemo(() => sortedInvoices(fees?.invoices ?? []), [fees]);
  const payments = useMemo(() => sortedPayments(fees?.payments ?? []), [fees]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/(tabs)/home");
  };

  const showHelp = () => {
    Alert.alert(
      "Fees & payments",
      `Payments are handled by ${parent?.school_name ?? "your school"}. Contact the school office if you need help with a receipt, a balance or a payment plan.`,
      [{ text: "Got it" }],
    );
  };

  const changeTab = (next: FeeTab) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Fees & payments"
        subtitle="Invoices, balances and payment history"
        onBack={goBack}
        right={
          <PressableScale
            accessibilityLabel="Payment help"
            onPress={showHelp}
            style={styles.headerHelp}
          >
            <CircleHelp
              size={19}
              color={insightColors.blue}
              strokeWidth={2.1}
            />
          </PressableScale>
        }
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 26 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={insightColors.blue}
          />
        }
      >
        <ChildSwitcher />

        {childrenLoading ? null : !selectedChild ? (
          childrenError ? null : (
            <EmptyState
              title="No child selected"
              body="Link a child to this parent account to see their fee statement."
            />
          )
        ) : query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <EmptyState
            title="Fee details could not load"
            body={apiErrorMessage(query.error)}
            retry={() => void query.refetch()}
          />
        ) : !fees ? (
          <EmptyState
            title="No fee statement yet"
            body="Your school has not issued a fee statement for this child."
          />
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(420)}>
              <FeeHero child={selectedChild} fees={fees} summary={summary} />
            </Animated.View>

            <SegmentedTabs
              tabs={[...FEE_TABS]}
              value={tab}
              onChange={(next) => changeTab(next as FeeTab)}
            />

            <Animated.View
              key={tab}
              entering={FadeInDown.duration(280)}
              style={styles.tabContent}
            >
              {tab === "Overview" ? (
                <FeesOverview
                  summary={summary}
                  fees={fees}
                  invoices={invoices}
                  payments={payments}
                  onViewInvoices={() => changeTab("Invoices")}
                  onViewPayments={() => changeTab("Payments")}
                  onHelp={showHelp}
                />
              ) : tab === "Payments" ? (
                <PaymentsTab payments={payments} currency={fees.currency} />
              ) : (
                <InvoicesTab
                  invoices={invoices}
                  summary={summary}
                  currency={fees.currency}
                />
              )}
            </Animated.View>

            <View style={styles.disclaimer}>
              <ShieldCheck
                size={12}
                color={insightColors.mutedLight}
                strokeWidth={2}
              />
              <Text style={styles.disclaimerText}>
                Payment records reflect entries confirmed by{" "}
                {parent?.school_name ?? "your school"}. Online payment is not
                enabled for this account.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function FeeHero({
  child,
  fees,
  summary,
}: {
  child: Child;
  fees: FeesSummary;
  summary: FeeSummary;
}) {
  const palette = feeStatusColors(summary.status.tone);
  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={[
          insightColors.feeHeroStart,
          insightColors.feeHeroMid,
          insightColors.feeHeroEnd,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <FloatingOrb style={styles.heroOrbLarge} distance={11} duration={5600} />
      <FloatingOrb style={styles.heroOrbSmall} distance={-8} duration={4700} />
      <View style={styles.heroTopRow}>
        <View style={styles.heroPill}>
          <Wallet size={12} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.heroPillText}>FEE SUMMARY</Text>
        </View>
        <View
          style={[styles.heroStatus, { backgroundColor: palette.background }]}
        >
          <View
            style={[styles.heroStatusDot, { backgroundColor: palette.dot }]}
          />
          <Text style={[styles.heroStatusText, { color: palette.color }]}>
            {summary.status.label}
          </Text>
        </View>
      </View>
      <View style={styles.heroMain}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>OUTSTANDING BALANCE</Text>
          <View style={styles.heroAmountRow}>
            {fees.currency ? (
              <Text style={styles.heroCurrency}>{fees.currency}</Text>
            ) : null}
            <AnimatedNumberText
              value={summary.outstanding}
              style={styles.heroAmount}
              format={(value) => formatMoney(value, null)}
            />
          </View>
          <Text style={styles.heroCaption} numberOfLines={1}>
            {summary.invoiceCount}{" "}
            {summary.invoiceCount === 1 ? "invoice" : "invoices"} ·{" "}
            {child.first_name} {child.last_name}
          </Text>
        </View>
        <AnimatedRing
          size={92}
          strokeWidth={8}
          percent={summary.paidPercent}
          color={insightColors.mint}
          trackColor="rgba(255,255,255,0.3)"
        >
          <AnimatedNumberText
            value={summary.paidPercent}
            style={styles.heroRingValue}
            suffix="%"
          />
          <Text style={styles.heroRingLabel}>PAID</Text>
        </AnimatedRing>
      </View>
      <View style={styles.heroStats}>
        <FeeHeroStat
          label="Total billed"
          value={formatMoney(summary.total, fees.currency)}
          divider={false}
        />
        <FeeHeroStat
          label="Paid"
          value={formatMoney(summary.paid, fees.currency)}
        />
        <FeeHeroStat
          label="Outstanding"
          value={formatMoney(summary.outstanding, fees.currency)}
        />
      </View>
    </View>
  );
}

function FeeHeroStat({
  label,
  value,
  divider = true,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <>
      {divider ? <View style={styles.heroStatDivider} /> : null}
      <View style={styles.heroStat}>
        <Text
          style={styles.heroStatValue}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        <Text style={styles.heroStatLabel}>{label}</Text>
      </View>
    </>
  );
}

function FeesOverview({
  summary,
  fees,
  invoices,
  payments,
  onViewInvoices,
  onViewPayments,
  onHelp,
}: {
  summary: FeeSummary;
  fees: FeesSummary;
  invoices: FeeInvoice[];
  payments: FeePayment[];
  onViewInvoices: () => void;
  onViewPayments: () => void;
  onHelp: () => void;
}) {
  const latest = payments[0];
  return (
    <View style={styles.stack}>
      <PaymentProgressCard summary={summary} currency={fees.currency} />
      <InvoiceBreakdownCard
        invoices={invoices}
        currency={fees.currency}
        onViewAll={onViewInvoices}
      />
      {latest ? (
        <LatestPaymentCard
          payment={latest}
          currency={fees.currency}
          onPress={onViewPayments}
        />
      ) : (
        <View style={styles.noPaymentCard}>
          <View style={styles.noPaymentIcon}>
            <Clock3 size={18} color={insightColors.muted} strokeWidth={2.1} />
          </View>
          <View style={styles.noPaymentCopy}>
            <Text style={styles.noPaymentTitle}>No payments recorded yet</Text>
            <Text style={styles.noPaymentBody}>
              Confirmed school payments will appear here.
            </Text>
          </View>
        </View>
      )}
      <HelpCard onPress={onHelp} />
    </View>
  );
}

function PaymentProgressCard({
  summary,
  currency,
}: {
  summary: FeeSummary;
  currency: string | null;
}) {
  return (
    <View style={styles.card}>
      <InsightSectionHeader
        icon={BarChart3}
        title="Payment progress"
        subtitle="Paid against total billed"
        tint={insightColors.blueSoft}
        color={insightColors.blue}
      />
      <View style={styles.progressTop}>
        <View>
          <AnimatedNumberText
            value={summary.paidPercent}
            style={styles.progressPercent}
            suffix="%"
          />
          <Text style={styles.progressPercentLabel}>of fees paid</Text>
        </View>
        <View style={styles.progressTotal}>
          <Text style={styles.progressTotalLabel}>TOTAL BILLED</Text>
          <Text
            style={styles.progressTotalValue}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(summary.total, currency)}
          </Text>
        </View>
      </View>
      <AnimatedProgressBar
        percent={summary.paidPercent}
        color={insightColors.green}
        trackColor={insightColors.amberSoft}
        height={13}
        delay={100}
      />
      <View style={styles.progressLegend}>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: insightColors.green }]}
          />
          <Text style={styles.legendLabel}>Paid</Text>
          <Text
            style={[styles.legendValue, { color: insightColors.greenDark }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(summary.paid, currency)}
          </Text>
        </View>
        <View style={styles.legendDivider} />
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: insightColors.amber }]}
          />
          <Text style={styles.legendLabel}>Outstanding</Text>
          <Text
            style={[styles.legendValue, { color: insightColors.amberText }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(summary.outstanding, currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function InvoiceBreakdownCard({
  invoices,
  currency,
  onViewAll,
}: {
  invoices: FeeInvoice[];
  currency: string | null;
  onViewAll: () => void;
}) {
  return (
    <View style={styles.card}>
      <InsightSectionHeader
        icon={ReceiptText}
        title="Fee breakdown"
        subtitle={`${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"} issued`}
        tint="#EAF2FF"
        color={insightColors.blue}
        right={
          invoices.length ? (
            <PressableScale
              accessibilityLabel="View all invoices"
              onPress={onViewAll}
              style={styles.viewAll}
            >
              <Text style={styles.viewAllText}>View all</Text>
              <ChevronRight
                size={14}
                color={insightColors.blue}
                strokeWidth={2.4}
              />
            </PressableScale>
          ) : null
        }
      />
      {invoices.length ? (
        <View>
          {invoices.slice(0, 3).map((invoice, index) => (
            <View key={invoice.id}>
              {index > 0 ? <View style={styles.rowDivider} /> : null}
              <InvoiceCompactRow
                invoice={invoice}
                currency={currency}
                delay={index * 80}
                onPress={onViewAll}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No invoices issued yet.</Text>
      )}
    </View>
  );
}

function InvoiceCompactRow({
  invoice,
  currency,
  delay,
  onPress,
}: {
  invoice: FeeInvoice;
  currency: string | null;
  delay: number;
  onPress: () => void;
}) {
  const state = invoiceState(invoice);
  const palette = feeStatusColors(state.tone);
  return (
    <PressableScale
      accessibilityLabel={`View ${invoice.invoice_number}`}
      onPress={onPress}
      style={styles.invoiceRow}
    >
      <View style={styles.invoiceIcon}>
        <ReceiptText size={17} color={insightColors.blue} strokeWidth={2.1} />
      </View>
      <View style={styles.invoiceMain}>
        <View style={styles.invoiceTitleRow}>
          <Text style={styles.invoiceTerm} numberOfLines={1}>
            {prettyTerm(invoice.term_name)} · {invoice.academic_year_name}
          </Text>
          <Text style={styles.invoiceAmount} numberOfLines={1}>
            {formatMoney(invoice.total_amount, currency)}
          </Text>
        </View>
        <View style={styles.invoiceMetaRow}>
          <Text style={styles.invoiceNumber} numberOfLines={1}>
            {invoice.invoice_number}
          </Text>
          <View
            style={[styles.statusPill, { backgroundColor: palette.background }]}
          >
            <Text style={[styles.statusLabel, { color: palette.color }]}>
              {state.label}
            </Text>
          </View>
        </View>
        <AnimatedProgressBar
          percent={state.paidPercent}
          color={insightColors.green}
          trackColor={insightColors.amberSoft}
          height={5}
          delay={delay}
        />
      </View>
    </PressableScale>
  );
}

function LatestPaymentCard({
  payment,
  currency,
  onPress,
}: {
  payment: FeePayment;
  currency: string | null;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel="View payment history"
      onPress={onPress}
      style={styles.latestPaymentCard}
    >
      <View style={styles.latestIcon}>
        <Check size={18} color={insightColors.greenDark} strokeWidth={3} />
      </View>
      <View style={styles.latestCopy}>
        <Text style={styles.latestEyebrow}>LATEST PAYMENT</Text>
        <Text style={styles.latestAmount}>
          {formatMoney(payment.amount, currency)}
        </Text>
        <Text style={styles.latestMeta} numberOfLines={1}>
          {paymentMethodLabel(payment.method)} ·{" "}
          {formatShortDate(payment.payment_date)}
        </Text>
        <Text style={styles.latestRef} numberOfLines={1}>
          {payment.receipt_number}
          {payment.reference ? ` · ${payment.reference}` : ""}
        </Text>
      </View>
      <ChevronRight
        size={19}
        color={insightColors.greenDark}
        strokeWidth={2.2}
      />
    </PressableScale>
  );
}

function HelpCard({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale
      accessibilityLabel="Payment help"
      onPress={onPress}
      style={styles.helpCard}
    >
      <View style={styles.helpIcon}>
        <CircleHelp size={18} color={insightColors.blue} strokeWidth={2.1} />
      </View>
      <View style={styles.helpCopy}>
        <Text style={styles.helpTitle}>Need help with a payment?</Text>
        <Text style={styles.helpBody}>
          Contact your school office for payment options, receipts or a payment
          plan.
        </Text>
      </View>
      <ChevronRight size={18} color={insightColors.blue} strokeWidth={2.2} />
    </PressableScale>
  );
}

function PaymentsTab({
  payments,
  currency,
}: {
  payments: FeePayment[];
  currency: string | null;
}) {
  if (!payments.length)
    return (
      <EmptyState
        title="No payments recorded"
        body="Confirmed school payments and their receipt references will appear here."
      />
    );
  return (
    <View style={styles.card}>
      <InsightSectionHeader
        icon={History}
        title="Payment history"
        subtitle={`${payments.length} confirmed ${payments.length === 1 ? "payment" : "payments"}`}
        tint={insightColors.blueSoft}
        color={insightColors.blue}
      />
      <View style={styles.timeline}>
        {payments.map((payment, index) => (
          <PaymentTimelineItem
            key={payment.id}
            payment={payment}
            currency={currency}
            index={index}
            last={index === payments.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

function PaymentTimelineItem({
  payment,
  currency,
  index,
  last,
}: {
  payment: FeePayment;
  currency: string | null;
  index: number;
  last: boolean;
}) {
  const status = paymentStatus(payment.status);
  const palette = feeStatusColors(status.tone);
  return (
    <Animated.View
      entering={FadeInUp.delay(index * 60).duration(280)}
      style={styles.timelineItem}
    >
      <View style={styles.timelineRail}>
        <View style={styles.timelineDot}>
          <Check size={11} color="#FFFFFF" strokeWidth={3.2} />
        </View>
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <View
        style={[styles.timelineContent, !last && styles.timelineContentSpaced]}
      >
        <View style={styles.timelineTop}>
          <Text style={styles.timelineReceipt} numberOfLines={1}>
            {payment.receipt_number}
          </Text>
          <Text style={styles.timelineAmount}>
            {formatMoney(payment.amount, currency)}
          </Text>
        </View>
        <Text style={styles.timelineMeta}>
          {paymentMethodLabel(payment.method)} ·{" "}
          {formatShortDate(payment.payment_date)}
        </Text>
        <View style={styles.timelineFooter}>
          <Text style={styles.timelineRef} numberOfLines={1}>
            {payment.reference
              ? `Reference ${payment.reference}`
              : "Recorded by your school"}
          </Text>
          <View
            style={[styles.statusPill, { backgroundColor: palette.background }]}
          >
            <Text style={[styles.statusLabel, { color: palette.color }]}>
              {status.label}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function InvoicesTab({
  invoices,
  summary,
  currency,
}: {
  invoices: FeeInvoice[];
  summary: FeeSummary;
  currency: string | null;
}) {
  if (!invoices.length)
    return (
      <EmptyState
        title="No invoices available"
        body="Your school has not issued a fee invoice for this child yet."
      />
    );
  return (
    <View style={styles.stack}>
      <View style={styles.invoiceIntro}>
        <View>
          <Text style={styles.invoiceIntroTitle}>
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
          </Text>
          <Text style={styles.invoiceIntroSub}>Issued by your school</Text>
        </View>
        <View style={styles.invoiceIntroRight}>
          <Text style={styles.invoiceIntroAmount}>
            {formatMoney(summary.outstanding, currency)}
          </Text>
          <Text style={styles.invoiceIntroLabel}>outstanding</Text>
        </View>
      </View>
      {invoices.map((invoice, index) => (
        <InvoiceCard
          key={invoice.id}
          invoice={invoice}
          currency={currency}
          index={index}
        />
      ))}
    </View>
  );
}

function InvoiceCard({
  invoice,
  currency,
  index,
}: {
  invoice: FeeInvoice;
  currency: string | null;
  index: number;
}) {
  const state = invoiceState(invoice);
  const palette = feeStatusColors(state.tone);
  return (
    <Animated.View
      entering={FadeInUp.delay(index * 70).duration(300)}
      style={[
        styles.card,
        styles.invoiceCard,
        { borderLeftColor: palette.dot },
      ]}
    >
      <View style={styles.invoiceCardHeader}>
        <View style={styles.invoiceCardIcon}>
          <ReceiptText size={19} color={insightColors.blue} strokeWidth={2.1} />
        </View>
        <View style={styles.invoiceCardCopy}>
          <Text style={styles.invoiceCardTerm} numberOfLines={1}>
            {prettyTerm(invoice.term_name)} · {invoice.academic_year_name}
          </Text>
          <Text style={styles.invoiceCardNumber} numberOfLines={1}>
            {invoice.invoice_number}
          </Text>
        </View>
        <View
          style={[styles.statusPill, { backgroundColor: palette.background }]}
        >
          <Text style={[styles.statusLabel, { color: palette.color }]}>
            {state.label}
          </Text>
        </View>
      </View>
      <View style={styles.invoiceCardAmountRow}>
        <Text style={styles.invoiceCardTotal}>
          {formatMoney(invoice.total_amount, currency)}
        </Text>
        <Text style={styles.invoiceCardIssued}>
          Issued {formatShortDate(invoice.issued_on)}
        </Text>
      </View>
      <AnimatedProgressBar
        percent={state.paidPercent}
        color={insightColors.green}
        trackColor={insightColors.amberSoft}
        height={8}
        delay={90 + index * 80}
      />
      <View style={styles.invoiceCardFooter}>
        <View>
          <Text style={styles.invoiceFooterLabel}>Paid</Text>
          <Text
            style={[
              styles.invoiceFooterValue,
              { color: insightColors.greenDark },
            ]}
          >
            {formatMoney(invoice.paid_amount, currency)}
          </Text>
        </View>
        <View style={styles.invoiceFooterRight}>
          <Text style={styles.invoiceFooterLabel}>Balance</Text>
          <Text
            style={[
              styles.invoiceFooterValue,
              { color: insightColors.amberText },
            ]}
          >
            {formatMoney(state.balance, currency)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: insightColors.page },
  headerHelp: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: insightColors.blueSoft,
    borderWidth: 1,
    borderColor: "#DCE8FA",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 14,
  },
  tabContent: { minHeight: 10 },
  stack: { gap: 14 },
  hero: {
    borderRadius: 24,
    padding: 17,
    overflow: "hidden",
    shadowColor: "#062A73",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroOrbLarge: {
    position: "absolute",
    width: 196,
    height: 196,
    borderRadius: 98,
    top: -76,
    right: -48,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  heroOrbSmall: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    bottom: -40,
    left: -26,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroPillText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1.05,
  },
  heroStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroStatusDot: { width: 6, height: 6, borderRadius: 3 },
  heroStatusText: { fontSize: 9.5, fontWeight: "800" },
  heroMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1.05,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 2,
  },
  heroCurrency: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "800",
  },
  heroAmount: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1.1,
  },
  heroCaption: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10.5,
    marginTop: 4,
  },
  heroRingValue: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroRingLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 7.5,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 1,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroStat: { flex: 1, alignItems: "center", gap: 1, paddingHorizontal: 4 },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
    maxWidth: "100%",
  },
  heroStatLabel: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 8.5,
    fontWeight: "600",
  },
  heroStatDivider: {
    width: 1,
    height: 23,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  card: {
    backgroundColor: insightColors.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: insightColors.border,
    padding: 15,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  progressTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressPercent: {
    color: insightColors.greenDark,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.9,
  },
  progressPercentLabel: {
    color: insightColors.muted,
    fontSize: 9.5,
    marginTop: -2,
  },
  progressTotal: { alignItems: "flex-end", gap: 1 },
  progressTotalLabel: {
    color: insightColors.mutedLight,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  progressTotalValue: {
    color: insightColors.ink,
    fontSize: 13,
    fontWeight: "800",
    maxWidth: 140,
  },
  progressLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  legendItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: {
    color: insightColors.muted,
    fontSize: 10,
    flexShrink: 0,
  },
  legendValue: {
    marginLeft: "auto",
    fontSize: 10.5,
    fontWeight: "800",
    maxWidth: 82,
    textAlign: "right",
  },
  legendDivider: {
    width: 1,
    height: 20,
    backgroundColor: insightColors.border,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingVertical: 4,
    paddingLeft: 6,
  },
  viewAllText: {
    color: insightColors.blue,
    fontSize: 10.5,
    fontWeight: "700",
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F0F4FA",
    marginLeft: 48,
  },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
  },
  invoiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: insightColors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceMain: { flex: 1, minWidth: 0, gap: 4 },
  invoiceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  invoiceTerm: {
    flex: 1,
    color: insightColors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  invoiceAmount: {
    color: insightColors.ink,
    fontSize: 12.5,
    fontWeight: "800",
  },
  invoiceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  invoiceNumber: {
    color: insightColors.muted,
    fontSize: 9.5,
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusLabel: { fontSize: 9.5, fontWeight: "800" },
  latestPaymentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 18,
    backgroundColor: insightColors.greenSoft,
    borderWidth: 1,
    borderColor: "#CDEBDD",
  },
  latestIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  latestCopy: { flex: 1, minWidth: 0, gap: 1 },
  latestEyebrow: {
    color: insightColors.greenDark,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  latestAmount: {
    color: insightColors.greenDark,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  latestMeta: {
    color: insightColors.muted,
    fontSize: 10.5,
    marginTop: 1,
  },
  latestRef: {
    color: insightColors.mutedLight,
    fontSize: 9,
  },
  noPaymentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 18,
    backgroundColor: insightColors.card,
    borderWidth: 1,
    borderColor: insightColors.border,
  },
  noPaymentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F1F4F9",
    alignItems: "center",
    justifyContent: "center",
  },
  noPaymentCopy: { flex: 1, gap: 2 },
  noPaymentTitle: {
    color: insightColors.ink,
    fontSize: 12.5,
    fontWeight: "700",
  },
  noPaymentBody: { color: insightColors.muted, fontSize: 10.5 },
  helpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 18,
    backgroundColor: insightColors.blueSoft,
    borderWidth: 1,
    borderColor: "#D8E9FC",
  },
  helpIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  helpCopy: { flex: 1, minWidth: 0, gap: 2 },
  helpTitle: {
    color: insightColors.blueDeep,
    fontSize: 12,
    fontWeight: "800",
  },
  helpBody: {
    color: "#5C7BA6",
    fontSize: 10,
    lineHeight: 14,
  },
  timeline: { marginTop: 2 },
  timelineItem: { flexDirection: "row", gap: 10 },
  timelineRail: { width: 24, alignItems: "center" },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: insightColors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  timelineLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: "#DCE8FA",
    marginTop: 3,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#EDF3FA",
    padding: 11,
  },
  timelineContentSpaced: { marginBottom: 12 },
  timelineTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineReceipt: {
    flex: 1,
    color: insightColors.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  timelineAmount: {
    color: insightColors.greenDark,
    fontSize: 14,
    fontWeight: "800",
  },
  timelineMeta: {
    color: insightColors.muted,
    fontSize: 10.5,
    marginTop: 2,
  },
  timelineFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 7,
  },
  timelineRef: {
    flex: 1,
    color: insightColors.mutedLight,
    fontSize: 9,
  },
  invoiceIntro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  invoiceIntroTitle: {
    color: insightColors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  invoiceIntroSub: {
    color: insightColors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  invoiceIntroRight: { alignItems: "flex-end" },
  invoiceIntroAmount: {
    color: insightColors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  invoiceIntroLabel: {
    color: insightColors.muted,
    fontSize: 9,
    marginTop: 1,
  },
  invoiceCard: { borderLeftWidth: 3 },
  invoiceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  invoiceCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: insightColors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceCardCopy: { flex: 1, minWidth: 0, gap: 2 },
  invoiceCardTerm: {
    color: insightColors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  invoiceCardNumber: {
    color: insightColors.muted,
    fontSize: 10,
  },
  invoiceCardAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 9,
  },
  invoiceCardTotal: {
    color: insightColors.ink,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  invoiceCardIssued: {
    color: insightColors.muted,
    fontSize: 9.5,
  },
  invoiceCardFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 9,
  },
  invoiceFooterRight: { alignItems: "flex-end" },
  invoiceFooterLabel: {
    color: insightColors.muted,
    fontSize: 9,
  },
  invoiceFooterValue: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 1,
  },
  emptyText: {
    color: insightColors.muted,
    fontSize: 11.5,
    paddingVertical: 6,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 2,
  },
  disclaimerText: {
    flex: 1,
    color: insightColors.mutedLight,
    fontSize: 9,
    lineHeight: 13.5,
  },
});
