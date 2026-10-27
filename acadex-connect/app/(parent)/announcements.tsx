import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react-native";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiErrorMessage } from "../../src/api/client";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../src/components/ui";
import { communicationsApi } from "../../src/features/communicationsApi";
import { colors, radius } from "../../src/theme/tokens";

export default function AnnouncementsScreen() {
  const query = useQuery({
    queryKey: ["announcements"],
    queryFn: ({ signal }) => communicationsApi.announcements(signal),
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
        title="School updates"
        subtitle="Announcements shared with your family."
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="School updates unavailable"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <EmptyState
          title="No updates yet"
          body="Your school’s published announcements will appear here."
        />
      ) : (
        query.data.map((item) => (
          <Card key={item.id} style={styles.card}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Megaphone size={17} color={colors.blue} />
              </View>
              <Text style={styles.date}>
                {new Date(item.published_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            {item.expires_at ? (
              <Text style={styles.expires}>
                Until {new Date(item.expires_at).toLocaleDateString()}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { padding: 15, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  date: { color: colors.muted, fontSize: 11 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  expires: { color: colors.mutedLight, fontSize: 10 },
});
