import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Megaphone } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiErrorMessage } from "../../../src/api/client";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../../src/components/ui";
import { communicationsApi } from "../../../src/features/communicationsApi";
import { colors, radius } from "../../../src/theme/tokens";

export default function NotificationsScreen() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => communicationsApi.notifications(signal),
  });
  const markRead = async (id: string) => {
    await communicationsApi.markRead(id);
    await client.invalidateQueries({ queryKey: ["notifications"] });
  };
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
        title="Notifications"
        subtitle="Important messages sent to your account."
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Notifications unavailable"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <EmptyState
          title="You’re all caught up"
          body="School notifications sent to your account will appear here."
        />
      ) : (
        query.data.map((item) => (
          <Card
            key={item.id}
            style={{ ...styles.item, ...(item.read_at ? {} : styles.unread) }}
          >
            <View style={styles.icon}>
              <Bell size={17} color={colors.blue} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.head}>
                <Text style={styles.title}>{item.title}</Text>
                {!item.read_at ? <View style={styles.dot} /> : null}
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            {!item.read_at ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark notification as read"
                onPress={() => void markRead(item.id)}
                style={styles.read}
              >
                <Check size={16} color={colors.blue} />
              </Pressable>
            ) : null}
          </Card>
        ))
      )}
      <View style={styles.subhead}>
        <Megaphone size={16} color={colors.muted} />
        <Text style={styles.subtext}>
          School notices are listed in School updates.
        </Text>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
  },
  unread: { borderColor: "#C8DCFF", backgroundColor: "#FAFCFF" },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: colors.ink, fontWeight: "700", fontSize: 14, flex: 1 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
  },
  body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  date: { color: colors.mutedLight, fontSize: 10, marginTop: 2 },
  read: { padding: 7 },
  subhead: { flexDirection: "row", alignItems: "center", gap: 8 },
  subtext: { color: colors.muted, fontSize: 12 },
});
