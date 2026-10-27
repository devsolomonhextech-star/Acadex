import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useChildren } from "../services/parentData";
import { colors, radius } from "../theme/tokens";
import { EmptyState, LoadingState } from "./ui";

export function ChildPicker() {
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {children.map((child) => {
        const active = child.id === selectedChild?.id;
        const initials =
          `${child.first_name[0] ?? ""}${child.last_name[0] ?? ""}`.toUpperCase();
        return (
          <Pressable
            key={child.id}
            onPress={() => selectChild(child.id)}
            accessibilityRole="button"
            accessibilityLabel={`Select ${child.first_name} ${child.last_name}`}
            style={[styles.item, active && styles.active]}
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
              <Text style={styles.className}>
                {child.class_name || child.admission_number}
              </Text>
            </View>
            {active ? <Check size={16} color={colors.blue} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  row: { gap: 10 },
  item: {
    minWidth: 220,
    maxWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  active: { borderColor: colors.blue, backgroundColor: "#F3F7FF" },
  avatar: {
    width: 38,
    height: 38,
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
});
