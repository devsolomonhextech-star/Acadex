import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, LockKeyhole, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/tokens";
import { PAYMENT_METHODS, type PaymentMethodId } from "../../features/payments";
import { PressableScale } from "../insights/InsightVisuals";
import { PaymentLogo } from "./PaymentLogo";

export function PaymentMethodsSheet({
  visible,
  value,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: PaymentMethodId | null;
  onClose: () => void;
  onSave: (method: PaymentMethodId) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PaymentMethodId>(value ?? "mtn");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close payment methods"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetTitle}>Payment methods</Text>
              <Text style={styles.sheetSubtitle}>
                Choose how you’d like to pay school fees.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.close}
            >
              <X size={17} color={colors.blueDeep} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            {PAYMENT_METHODS.map((method) => {
              const active = selected === method.id;
              return (
                <Pressable
                  key={method.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setSelected(method.id)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <PaymentLogo method={method.id} size={43} />
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionName}>{method.name}</Text>
                    <Text style={styles.optionDetail}>{method.detail}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? (
                      <Check size={12} color="#FFFFFF" strokeWidth={3.2} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {selected === "cards" ? (
              <Text style={styles.cardsNote}>
                Card payments are available only where your school supports
                them.
              </Text>
            ) : null}

            <View style={styles.secureNote}>
              <LockKeyhole size={14} color={colors.blue} strokeWidth={2.1} />
              <Text style={styles.secureText}>
                Payments are processed by your school’s provider. Acadex never
                stores your card details.
              </Text>
            </View>
          </ScrollView>

          <PressableScale
            accessibilityLabel="Save payment method"
            onPress={() => onSave(selected)}
            style={styles.saveButton}
          >
            <Text style={styles.saveText}>Save payment method</Text>
            <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7, 20, 45, 0.48)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E3EAF4",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  sheetCopy: { flex: 1, minWidth: 0, gap: 3 },
  sheetTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: 8, paddingBottom: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionActive: {
    borderColor: colors.blue,
    backgroundColor: "#F7FAFF",
  },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionName: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: "800",
  },
  optionDetail: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.7,
    borderColor: "#D5E0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  cardsNote: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "600",
  },
  secureNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
  },
  secureText: {
    flex: 1,
    color: colors.blueDeep,
    fontSize: 9.5,
    lineHeight: 14,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  savePressed: { opacity: 0.86 },
  saveText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
