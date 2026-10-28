import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useChildren } from "../services/parentData";
import { colors, radius } from "../theme/tokens";
import { EmptyState, LoadingState } from "./ui";

export function ChildPicker({
  variant = "horizontal",
}: {
  variant?: "horizontal" | "list";
}) {
  const { children, selectedChild, selectChild, isLoading, error, refetch } =
    useChildren();
  if (isLoading) return <LoadingState />;
  if (error)
    return (
      <EmptyState
        title="Children could not load"
        body={error.message}
        retry={refetch}
      />
    );
  if (!children.length)
    return (
      <EmptyState
        title="No linked children yet"
        body="Your school has not linked a child to this account. Contact the school office to request a verified link."
      />
    );
  const childCards = children.map((child) => {
    const active = child.id === selectedChild?.id;
    const initials =
      `${child.first_name[0] ?? ""}${child.last_name[0] ?? ""}`.toUpperCase();
    return (
      <Pressable
        key={child.id}
        onPress={() => selectChild(child.id)}
        accessibilityRole="button"
        accessibilityLabel={`Select ${child.first_name} ${child.last_name}`}
        style={[
          styles.item,
          variant === "list" && styles.listItem,
          active && styles.active,
        ]}
      >
        <View style={[styles.avatar, active && styles.avatarActive]}>
          <Text style={[styles.initials, active && styles.initialsActive]}>
            {initials}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[styles.name, active && styles.nameActive]}
          >
            {child.first_name} {child.last_name}
          </Text>
          <Text style={styles.className} numberOfLines={1}>
            {child.class_name || "Class not assigned"}
          </Text>
          {variant === "list" ? (
            <Text style={styles.admission}>{child.admission_number}</Text>
          ) : null}
        </View>
        {active ? (
          <View style={styles.selected}>
            <Check size={14} color="#fff" strokeWidth={3} />
          </View>
        ) : variant === "list" ? (
          <View style={styles.unselected} />
        ) : null}
      </Pressable>
    );
  });
  if (variant === "list")
    return (
      <View style={styles.list}>
        <View style={styles.listHeading}>
          <Text style={styles.listTitle}>Linked children</Text>
          <Text style={styles.listCount}>{children.length}</Text>
        </View>
        {childCards}
      </View>
    );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {childCards}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  row: { gap: 10 },
  list: { gap: 9 },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  listCount: {
    color: colors.blueDeep,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.pill,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "800",
  },
  item: {
    width: 194,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  listItem: { width: "100%", minHeight: 76, padding: 13, borderRadius: 18 },
  active: { borderColor: colors.blue, backgroundColor: "#F3F7FF" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActive: { backgroundColor: colors.blue },
  initials: { fontSize: 12, fontWeight: "800", color: colors.blueDeep },
  initialsActive: { color: "#fff" },
  name: { fontSize: 13, fontWeight: "700", color: colors.ink },
  nameActive: { color: colors.blueDeep },
  className: { fontSize: 11, color: colors.muted, marginTop: 2 },
  admission: { fontSize: 10, color: colors.mutedLight, marginTop: 2 },
  selected: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blue,
  },
  unselected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
