import { useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import {
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
} from "react-native";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react-native";
import { useAuth } from "../../src/services/auth";
import { apiErrorMessage } from "../../src/api/client";
import { colors, radius, space } from "../../src/theme/tokens";
import { Card, PrimaryButton } from "../../src/components/ui";

const credentialsSchema = z.object({
  school: z.string().trim().min(3, "Enter your school workspace address"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type Credentials = z.infer<typeof credentialsSchema>;

export default function LoginScreen() {
  const { signIn, verifyCode } = useAuth();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Image
            source={require("../../assets/images/acadex-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Smarter Schools. Brighter Futures.</Text>
          <Text style={styles.parentCaption}>
            Parent portal — stay connected with your child’s learning journey.
          </Text>
        </View>
        <View style={styles.body}>
          {challenge ? (
            <>
              <Text style={styles.eyebrow}>ACADEX CONNECT</Text>
              <Text style={styles.title}>Verify it’s you</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code from your authenticator app.
              </Text>
            </>
          ) : null}
          {!challenge ? <SchoolIllustration /> : null}
          <Card style={styles.form}>
            {challenge ? (
              <View style={styles.field}>
                <Text style={styles.label}>Authenticator code</Text>
                <View style={styles.inputWrap}>
                  <ShieldCheck color={colors.muted} size={18} />
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="000000"
                    placeholderTextColor={colors.mutedLight}
                    style={styles.input}
                  />
                </View>
              </View>
            ) : (
              <>
                <Field
                  label="School workspace"
                  name="school"
                  control={control}
                  placeholder="e.g. greenwood-demo"
                  error={errors.school?.message}
                  autoCapitalize="none"
                />
                <Field
                  label="Email address"
                  name="email"
                  control={control}
                  placeholder="you@school.example"
                  error={errors.email?.message}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrap}>
                    <LockKeyhole color={colors.muted} size={18} />
                    <Controller
                      control={control}
                      name="password"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          secureTextEntry={!passwordVisible}
                          autoCapitalize="none"
                          placeholder="Your password"
                          placeholderTextColor={colors.mutedLight}
                          style={styles.input}
                        />
                      )}
                    />
                    <Pressable
                      onPress={() => setPasswordVisible((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        passwordVisible ? "Hide password" : "Show password"
                      }
                    >
                      {passwordVisible ? (
                        <EyeOff color={colors.muted} size={18} />
                      ) : (
                        <Eye color={colors.muted} size={18} />
                      )}
                    </Pressable>
                  </View>
                  {errors.password?.message ? (
                    <Text style={styles.fieldError}>
                      {errors.password.message}
                    </Text>
                  ) : null}
                </View>
              </>
            )}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <PrimaryButton
              title={challenge ? "Verify and continue" : "Login"}
              onPress={challenge ? submitCode : () => void submit()}
              busy={busy}
              disabled={challenge ? code.length !== 6 : false}
            />
            {challenge ? (
              <Pressable
                onPress={() => {
                  setChallenge(null);
                  setCode("");
                  setError("");
                }}
                style={styles.back}
              >
                <Text style={styles.link}>Back to sign in</Text>
              </Pressable>
            ) : null}
          </Card>
          <View style={styles.security}>
            <ShieldCheck size={16} color={colors.blue} />
            <Text style={styles.securityText}>
              Your school controls what information is shared with your account.
            </Text>
          </View>
          {!challenge ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  "Need help signing in?",
                  "Contact your school administrator to reset your password or confirm your school workspace.",
                )
              }
            >
              <Text style={styles.forgot}>
                Forgot password? Contact your school.
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.footer}>
          Don’t have an account? Contact your school.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  name,
  control,
  placeholder,
  error,
  autoCapitalize = "sentences",
  keyboardType = "default",
}: {
  label: string;
  name: "school" | "email";
  control: Control<Credentials>;
  placeholder: string;
  error?: string;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {name === "email" ? (
          <Mail color={colors.muted} size={18} />
        ) : (
          <LockKeyhole color={colors.muted} size={18} />
        )}
        <Controller
          control={control}
          name={name}
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize={autoCapitalize}
              keyboardType={keyboardType}
              autoCorrect={false}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedLight}
              style={styles.input}
            />
          )}
        />
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  page: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: 62,
    paddingBottom: 8,
  },
  top: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  logo: { width: 138, height: 42 },
  tagline: {
    color: colors.ink,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 5,
  },
  parentCaption: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 270,
    marginTop: 2,
  },
  brandPill: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    backgroundColor: colors.cyan,
    borderRadius: radius.pill,
  },
  brandText: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
    color: colors.muted,
  },
  body: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    marginTop: 15,
    gap: 9,
  },
  eyebrow: {
    color: colors.blue,
    letterSpacing: 1.8,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  form: { padding: 15, gap: 9 },
  field: { gap: 4 },
  label: { fontSize: 11, color: colors.ink, fontWeight: "700" },
  inputWrap: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#FBFCFE",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, color: colors.ink, fontSize: 13, paddingVertical: 9 },
  fieldError: { fontSize: 12, color: colors.danger },
  errorBox: {
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  back: { paddingVertical: 8, alignItems: "center" },
  link: { color: colors.blue, fontSize: 14, fontWeight: "700" },
  security: {
    marginTop: 5,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  securityText: { flex: 1, fontSize: 10, lineHeight: 15, color: colors.muted },
  forgot: {
    textAlign: "center",
    fontSize: 10,
    color: colors.muted,
    lineHeight: 15,
  },
  footer: {
    marginTop: "auto",
    textAlign: "center",
    fontSize: 10,
    color: colors.mutedLight,
    paddingVertical: 9,
  },
});

function SchoolIllustration() {
  return (
    <View style={illustration.container} accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 360 132">
        <Circle cx="56" cy="36" r="17" fill="#DCEAFF" />
        <Circle cx="76" cy="39" r="21" fill="#DCEAFF" />
        <Circle cx="99" cy="37" r="16" fill="#DCEAFF" />
        <Circle cx="269" cy="33" r="15" fill="#DCEAFF" />
        <Circle cx="288" cy="36" r="20" fill="#DCEAFF" />
        <Circle cx="309" cy="35" r="14" fill="#DCEAFF" />
        <Rect x="45" y="87" width="7" height="33" rx="3" fill="#6F95E2" />
        <Circle cx="49" cy="76" r="22" fill="#83A9EF" />
        <Circle cx="40" cy="65" r="14" fill="#A6C4F8" />
        <Circle cx="60" cy="65" r="14" fill="#A6C4F8" />
        <Rect x="308" y="87" width="7" height="33" rx="3" fill="#6F95E2" />
        <Circle cx="312" cy="76" r="22" fill="#83A9EF" />
        <Circle cx="303" cy="65" r="14" fill="#A6C4F8" />
        <Circle cx="323" cy="65" r="14" fill="#A6C4F8" />
        <Rect
          x="86"
          y="57"
          width="188"
          height="73"
          rx="3"
          fill="#FFFFFF"
          stroke="#BCD3FA"
          strokeWidth="2"
        />
        <Path d="M72 60 180 10l108 50H72Z" fill="#2563EB" />
        <Rect x="158" y="35" width="44" height="38" rx="2" fill="#4E83F0" />
        <Circle cx="180" cy="52" r="8" fill="#EAF2FF" />
        <Path
          d="M202 20v-14"
          stroke="#164BB7"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <Path d="M203 7h19l-7 6h-12Z" fill="#74A1F8" />
        <Rect
          x="101"
          y="75"
          width="24"
          height="21"
          rx="3"
          fill="#D7E6FF"
          stroke="#9DBCF5"
        />
        <Rect
          x="135"
          y="75"
          width="24"
          height="21"
          rx="3"
          fill="#D7E6FF"
          stroke="#9DBCF5"
        />
        <Rect
          x="201"
          y="75"
          width="24"
          height="21"
          rx="3"
          fill="#D7E6FF"
          stroke="#9DBCF5"
        />
        <Rect
          x="235"
          y="75"
          width="24"
          height="21"
          rx="3"
          fill="#D7E6FF"
          stroke="#9DBCF5"
        />
        <Path
          d="M113 75v21M147 75v21M213 75v21M247 75v21"
          stroke="#A9C5F4"
          strokeWidth="1"
        />
        <Rect x="164" y="94" width="32" height="36" rx="15" fill="#B8D0F8" />
        <Path d="M86 129h188" stroke="#AFC9F5" strokeWidth="3" />
      </Svg>
    </View>
  );
}

const illustration = StyleSheet.create({
  container: {
    height: 126,
    width: "100%",
    backgroundColor: "#EEF5FF",
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
