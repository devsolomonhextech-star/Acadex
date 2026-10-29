import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { PaymentMethodId } from "../../features/payments";

const VISA_PATH =
  "M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z";

export function PaymentLogo({
  method,
  size = 46,
}: {
  method: PaymentMethodId;
  size?: number;
}) {
  const radius = size * 0.28;
  const frame = { width: size, height: size, borderRadius: radius };

  if (method === "mtn")
    return (
      <View style={[styles.tile, frame, { backgroundColor: "#FFCC00" }]}>
        <Text
          style={[
            styles.mtn,
            { fontSize: size * 0.235, letterSpacing: -size * 0.014 },
          ]}
        >
          MTN
        </Text>
      </View>
    );

  if (method === "telecel")
    return (
      <View style={[styles.tile, frame, { backgroundColor: "#E40000" }]}>
        <Text
          style={[
            styles.telecel,
            { fontSize: size * 0.17, letterSpacing: -size * 0.008 },
          ]}
        >
          telecel
        </Text>
      </View>
    );

  if (method === "at")
    return (
      <View style={[styles.tile, styles.lightTile, frame]}>
        <View style={styles.atRow}>
          <Text
            style={[
              styles.atLetter,
              { color: "#E40000", fontSize: size * 0.3 },
            ]}
          >
            A
          </Text>
          <Text
            style={[
              styles.atLetter,
              { color: "#0066B3", fontSize: size * 0.3 },
            ]}
          >
            T
          </Text>
        </View>
      </View>
    );

  return (
    <View style={[styles.tile, styles.lightTile, frame, styles.cardsTile]}>
      <Svg width={size * 0.58} height={size * 0.25} viewBox="0 7 24 10">
        <Path d={VISA_PATH} fill="#1A1F71" />
      </Svg>
      <View style={styles.mastercardRow}>
        <View
          style={{
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: size * 0.1,
            backgroundColor: "#EB001B",
          }}
        />
        <View
          style={{
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: size * 0.1,
            backgroundColor: "#F79E1B",
            marginLeft: -size * 0.075,
            opacity: 0.92,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lightTile: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4EAF3",
  },
  mtn: {
    color: "#0B0B0B",
    fontWeight: "900",
  },
  telecel: {
    color: "#FFFFFF",
    fontWeight: "800",
    marginTop: 1,
  },
  atRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
  atLetter: {
    fontWeight: "900",
    letterSpacing: -1,
  },
  cardsTile: { gap: 2 },
  mastercardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
});
