import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FloatingOrb,
  PressableScale,
} from "../../src/components/insights/InsightVisuals";
import { useAuth } from "../../src/services/auth";
import { apiErrorMessage } from "../../src/api/client";
import { colors } from "../../src/theme/tokens";

const logo = require("../../assets/images/acadex-logo.png");
const school3d = require("../../assets/images/3d/school.webp");

const credentialsSchema = z.object({
  school: z.string().trim().min(3, "Enter your school workspace address"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type Credentials = z.infer<typeof credentialsSchema>;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const formY = useRef(0);
  const { signIn, verifyCode } = useAuth();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorSeq, setErrorSeq] = useState(0);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeFocused, setCodeFocused] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { school: "", email: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    setError("");
    try {
      const result = await signIn(values.school, values.email, values.password);
      if (result.requiresTwoFactor) setChallenge(result.challengeToken ?? null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setErrorSeq(value => value + 1);
    } finally {
      setBusy(false);
    }
  });

  const submitCode = async () => {
    if (!challenge || !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyCode(challenge, code);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setErrorSeq(value => value + 1);
    } finally {
      setBusy(false);
    }
  };

  // Bring the error banner into view whenever a sign-in attempt fails.
  useEffect(() => {
    if (!errorSeq) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, formY.current - 16),
      animated: true,
    });
  }, [errorSeq]);

  const showHelp = () => {
    Alert.alert(
      "Need help signing in?",
      "Contact your school administrator to reset your password or confirm your school workspace.",
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={FadeInDown.duration(420)}
            style={[styles.hero, { paddingTop: insets.top + 12 }]}
          >
            <LinearGradient
              colors={["#071F57", "#0F49C7", "#2D8CFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <FloatingOrb
              style={styles.heroOrbLarge}
              distance={11}
              duration={5600}
            />
            <FloatingOrb
              style={styles.heroOrbSmall}
              distance={-8}
              duration={4800}
            />
            <View style={styles.heroTop}>
              <Animated.View
                entering={ZoomIn.delay(80).duration(380)}
                style={styles.logoCard}
              >
                <Image source={logo} style={styles.logo} resizeMode="contain" />
              </Animated.View>
              <View style={styles.portalPill}>
                <ShieldCheck size={12} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.portalText}>PARENT PORTAL</Text>
              </View>
            </View>
            <View style={styles.heroBody}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>ACADEX CONNECT</Text>
                <Text style={styles.heroTitle}>Welcome back.</Text>
                <Text style={styles.heroText}>
                  A clear view of your child’s school day, results and payments.
                </Text>
              </View>
              <FloatingSchool />
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(120).duration(450)}
            style={styles.formShell}
            onLayout={event => {
              formY.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <Text style={styles.formEyebrow}>
                  {challenge ? "SECURITY CHECK" : "PARENT SIGN IN"}
                </Text>
                <Text style={styles.formTitle}>
                  {challenge ? "Verify it’s you" : "Sign in to your account"}
                </Text>
                <Text style={styles.formSubtitle}>
                  {challenge
                    ? "Enter the 6-digit code from your authenticator app."
                    : "Use the school workspace and details provided by your school."}
                </Text>
              </View>

              {error ? <ErrorBox message={error} /> : null}

              {challenge ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Authenticator code</Text>
                    <View
                      style={[
                        styles.codeWrap,
                        codeFocused && styles.inputFocused,
                      ]}
                    >
                      <ShieldCheck
                        size={18}
                        color={codeFocused ? colors.blue : colors.muted}
                        strokeWidth={2.1}
                      />
                      <TextInput
                        value={code}
                        onChangeText={(value) => {
                          setCode(value.replace(/\D/g, ""));
                          if (error) setError("");
                        }}
                        onFocus={() => setCodeFocused(true)}
                        onBlur={() => setCodeFocused(false)}
                        editable={!busy}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoComplete="one-time-code"
                        placeholder="000000"
                        placeholderTextColor={colors.mutedLight}
                        style={styles.codeInput}
                      />
                    </View>
                  </View>
                  <PrimaryAction
                    title="Verify and continue"
                    busy={busy}
                    onPress={() => void submitCode()}
                    disabled={code.length !== 6}
                  />
                  <PressableScale
                    accessibilityLabel="Back to sign in"
                    onPress={() => {
                      setChallenge(null);
                      setCode("");
                      setError("");
                    }}
                    style={styles.backLink}
                  >
                    <Text style={styles.backLinkText}>Back to sign in</Text>
                  </PressableScale>
                </>
              ) : (
                <>
                  <Field
                    label="School workspace"
                    name="school"
                    icon={Building2}
                    control={control}
                    placeholder="e.g. greenwood-demo"
                    error={errors.school?.message}
                    autoCapitalize="none"
                    disabled={busy}
                  />
                  <Field
                    label="Email address"
                    name="email"
                    icon={Mail}
                    control={control}
                    placeholder="you@school.example"
                    error={errors.email?.message}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    disabled={busy}
                  />
                  <PasswordField
                    control={control}
                    error={errors.password?.message}
                    visible={passwordVisible}
                    onToggle={() => setPasswordVisible((value) => !value)}
                    disabled={busy}
                  />
                  <PrimaryAction
                    title="Sign in"
                    busy={busy}
                    onPress={() => void submit()}
                  />
                  <View style={styles.helperRow}>
                    <Text style={styles.helperText}>Forgot your password?</Text>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={showHelp}
                    >
                      <Text style={styles.helperLink}>Contact school</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <View style={styles.secureRow}>
                <ShieldCheck size={13} color={colors.blue} strokeWidth={2.1} />
                <Text style={styles.secureText}>
                  Your school controls what information is shared with your
                  account.
                </Text>
              </View>
            </View>
          </Animated.View>

          <Text style={styles.footer}>
            Don’t have an account? Contact your school.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FloatingSchool() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, {
        duration: 5000,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [drift]);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * 6 }],
  }));
  return (
    <Animated.View
      entering={ZoomIn.delay(140).duration(450)}
      style={styles.schoolWrap}
    >
      <Animated.View style={floatStyle}>
        <Image
          source={school3d}
          resizeMode="contain"
          style={styles.schoolImage}
        />
      </Animated.View>
    </Animated.View>
  );
}

function Field({
  label,
  name,
  icon: Icon,
  control,
  placeholder,
  error,
  autoCapitalize = "sentences",
  keyboardType = "default",
  disabled = false,
}: {
  label: string;
  name: "school" | "email";
  icon: typeof Building2;
  control: Control<Credentials>;
  placeholder: string;
  error?: string;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "email-address";
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused]}>
        <View style={[styles.inputIcon, focused && styles.inputIconFocused]}>
          <Icon
            size={16}
            color={focused ? colors.blue : colors.muted}
            strokeWidth={2.1}
          />
        </View>
        <Controller
          control={control}
          name={name}
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={() => {
                setFocused(false);
                onBlur();
              }}
              onFocus={() => setFocused(true)}
              editable={!disabled}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              keyboardType={keyboardType}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedLight}
              style={[styles.input, disabled && styles.inputDisabled]}
            />
          )}
        />
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PasswordField({
  control,
  error,
  visible,
  onToggle,
  disabled = false,
}: {
  control: Control<Credentials>;
  error?: string;
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Password</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused]}>
        <View style={[styles.inputIcon, focused && styles.inputIconFocused]}>
          <LockKeyhole
            size={16}
            color={focused ? colors.blue : colors.muted}
            strokeWidth={2.1}
          />
        </View>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={() => {
                setFocused(false);
                onBlur();
              }}
              onFocus={() => setFocused(true)}
              editable={!disabled}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Your password"
              placeholderTextColor={colors.mutedLight}
              style={[styles.input, disabled && styles.inputDisabled]}
            />
          )}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          hitSlop={8}
          onPress={onToggle}
          style={styles.eye}
        >
          {visible ? (
            <EyeOff size={17} color={colors.muted} strokeWidth={2} />
          ) : (
            <Eye size={17} color={colors.muted} strokeWidth={2} />
          )}
        </Pressable>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function PrimaryAction({
  title,
  busy,
  onPress,
  disabled,
}: {
  title: string;
  busy: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      accessibilityLabel={title}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.primary, (busy || disabled) && styles.primaryDisabled]}
    >
      <LinearGradient
        colors={["#155EEF", "#2D8CFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {busy ? (
        <>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.primaryText}>{title === "Sign in" ? "Signing in…" : "Checking…"}</Text>
        </>
      ) : (
        <>
          <Text style={styles.primaryText}>{title}</Text>
          <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.6} />
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F8FD" },
  page: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  hero: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 18,
    paddingBottom: 76,
    overflow: "hidden",
  },
  heroOrbLarge: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -76,
    right: -62,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroOrbSmall: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -48,
    left: -32,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  logoCard: {
    width: 140,
    height: 49,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    shadowColor: "#041D4A",
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  logo: { width: 124, height: 34 },
  portalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  portalText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 22,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 4,
  },
  heroText: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 5,
    maxWidth: 220,
  },
  schoolWrap: {
    width: 142,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  schoolImage: { width: 154, height: 136 },
  formShell: {
    marginTop: -48,
    paddingHorizontal: 16,
  },
  formCard: {
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EEF8",
    padding: 18,
    gap: 11,
    shadowColor: "#0E356F",
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  formHeader: { gap: 2, marginBottom: 2 },
  formEyebrow: {
    color: colors.blue,
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  formTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.55,
    marginTop: 1,
  },
  formSubtitle: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },
  field: { gap: 4 },
  label: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "700",
  },
  inputWrap: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3EAF5",
    backgroundColor: "#F8FBFF",
  },
  inputFocused: {
    borderColor: colors.blue,
    backgroundColor: "#FFFFFF",
    shadowColor: "#155EEF",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  inputIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: "#EFF4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  inputIconFocused: { backgroundColor: colors.blueSoft },
  inputDisabled: { opacity: 0.6 },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: 12.5,
    paddingVertical: 12,
  },
  eye: {
    width: 30,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldError: {
    color: colors.danger,
    fontSize: 10,
  },
  codeWrap: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3EAF5",
    backgroundColor: "#F8FBFF",
  },
  codeInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: 10,
  },
  errorBox: {
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    color: colors.danger,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "500",
  },
  primary: {
    minHeight: 53,
    borderRadius: 15,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 3,
  },
  primaryDisabled: { opacity: 0.55 },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  helperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 1,
  },
  helperText: {
    color: colors.muted,
    fontSize: 9.5,
  },
  helperLink: {
    color: colors.blue,
    fontSize: 9.5,
    fontWeight: "800",
  },
  backLink: {
    alignSelf: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  backLinkText: {
    color: colors.blue,
    fontSize: 11.5,
    fontWeight: "800",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F4FA",
  },
  secureText: {
    flex: 1,
    color: colors.muted,
    fontSize: 8.5,
    lineHeight: 12.5,
  },
  footer: {
    textAlign: "center",
    color: colors.mutedLight,
    fontSize: 9.5,
    paddingTop: 16,
    paddingHorizontal: 24,
  },
});
