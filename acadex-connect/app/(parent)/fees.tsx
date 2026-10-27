import { useQuery } from "@tanstack/react-query";
import { CreditCard, ReceiptText } from "lucide-react-native";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiErrorMessage } from "../../src/api/client";
import { ChildPicker } from "../../src/components/ChildPicker";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../src/components/ui";
import { familyApi } from "../../src/features/familyApi";
import { useChildren } from "../../src/services/parentData";
import { colors, radius } from "../../src/theme/tokens";

function amount(value: string, currency: string | null) {
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}
export default function FeesScreen() {
  const { selectedChild } = useChildren();
  const query = useQuery({
    queryKey: ["fees", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.fees(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.blue}
        />
      }
    >
      <Heading
        title="Fees & payments"
        subtitle="Balances and payment records shared by your school."
      />
      <ChildPicker />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Fee details could not load"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          <Card style={styles.balance}>
            <View style={styles.icon}>
              <CreditCard color={colors.blue} size={19} />
            </View>
            <Text style={styles.label}>Outstanding balance</Text>
            <Text style={styles.total}>
              {amount(query.data.outstanding_total, query.data.currency)}
            </Text>
            <View style={styles.totals}>
              <View>
                <Text style={styles.small}>Billed</Text>
                <Text style={styles.value}>
                  {amount(query.data.invoiced_total, query.data.currency)}
                </Text>
              </View>
              <View>
                <Text style={styles.small}>Paid</Text>
                <Text style={[styles.value, { color: colors.success }]}>
                  {amount(query.data.paid_total, query.data.currency)}
                </Text>
              </View>
            </View>
          </Card>
          <Text style={styles.section}>INVOICES</Text>
          {!query.data.invoices.length ? (
            <EmptyState
              title="No invoices available"
              body="Your school has not issued a fee invoice for this student yet."
            />
          ) : (
            query.data.invoices.map((invoice) => (
              <Card key={invoice.id} style={styles.row}>
                <View style={styles.iconSmall}>
                  <ReceiptText color={colors.blue} size={17} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoice}>{invoice.invoice_number}</Text>
                  <Text style={styles.meta}>
                    {invoice.term_name} · {invoice.academic_year_name}
                  </Text>
                  <Text style={styles.meta}>
                    Issued{" "}
                    {new Date(
                      `${invoice.issued_on}T00:00:00`,
                    ).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.value}>
                    {amount(invoice.total_amount, query.data.currency)}
                  </Text>
                  <Text style={styles.status}>
                    {invoice.status.replace("_", " ")}
                  </Text>
                  <Text style={styles.balanceSmall}>
                    Due {amount(invoice.balance, query.data.currency)}
                  </Text>
                </View>
              </Card>
            ))
          )}
          <Text style={styles.section}>PAYMENT HISTORY</Text>
          {!query.data.payments.length ? (
            <EmptyState
              title="No payments recorded"
              body="Payments recorded by the school will appear here with their receipt references."
            />
          ) : (
            query.data.payments.map((payment) => (
              <Card key={payment.id} style={styles.row}>
                <View
                  style={[
                    styles.iconSmall,
                    { backgroundColor: colors.successSoft },
                  ]}
                >
                  <ReceiptText color={colors.success} size={17} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoice}>{payment.receipt_number}</Text>
                  <Text style={styles.meta}>
                    {payment.method.replace("_", " ")} ·{" "}
                    {new Date(
                      `${payment.payment_date}T00:00:00`,
                    ).toLocaleDateString()}
                  </Text>
                  {payment.reference ? (
                    <Text style={styles.meta}>
                      Reference {payment.reference}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.value, { color: colors.success }]}>
                  {amount(payment.amount, query.data.currency)}
                </Text>
              </Card>
            ))
          )}
          <Text style={styles.disclaimer}>
            Payments shown here reflect entries confirmed by your school. Online
            payment is not enabled for this account.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  balance: { backgroundColor: "#F1F6FF", borderColor: "#D6E5FF", padding: 19 },
  icon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  label: { color: colors.muted, fontSize: 12, marginTop: 12 },
  total: { color: colors.ink, fontSize: 27, fontWeight: "800", marginTop: 2 },
  totals: {
    flexDirection: "row",
    borderTopColor: "#D6E5FF",
    borderTopWidth: 1,
    paddingTop: 13,
    marginTop: 15,
    gap: 42,
  },
  small: { color: colors.muted, fontSize: 11 },
  value: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 4 },
  section: {
    color: colors.mutedLight,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "800",
    marginTop: 5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  iconSmall: {
    width: 35,
    height: 35,
    borderRadius: radius.sm,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  invoice: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  meta: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
    textTransform: "capitalize",
  },
  status: {
    color: colors.warning,
    fontSize: 10,
    textTransform: "capitalize",
    marginTop: 3,
  },
  balanceSmall: { color: colors.danger, fontSize: 10, marginTop: 4 },
  disclaimer: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});
