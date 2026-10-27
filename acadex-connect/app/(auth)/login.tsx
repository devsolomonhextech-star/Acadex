import { useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
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
          <View style={styles.brandPill}>
            <View style={styles.dot} />
            <Text style={styles.brandText}>PARENT ACCESS</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.eyebrow}>ACADEX CONNECT</Text>
          <Text style={styles.title}>
            {challenge
              ? "Verify it’s you"
              : "Your child’s school life, connected."}
          </Text>
          <Text style={styles.subtitle}>
            {challenge
              ? "Enter the 6-digit code from your authenticator app."
              : "Sign in to see updates and records shared by your school."}
          </Text>
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
              title={challenge ? "Verify and continue" : "Sign in securely"}
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
            <ShieldCheck size={16} color={colors.success} />
            <Text style={styles.securityText}>
              Your school controls what information is shared with your account.
            </Text>
          </View>
          {!challenge ? (
            <Text style={styles.forgot}>
              Forgot your password? Contact your school administrator for help
              signing in.
            </Text>
          ) : null}
        </View>
        <Text style={styles.footer}>Acadex Connect · Secure family access</Text>
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
    paddingTop: 44,
    paddingBottom: 12,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { width: 132, height: 44 },
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
    marginTop: 44,
    gap: 13,
  },
  eyebrow: {
    color: colors.blue,
    letterSpacing: 1.8,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 10,
  },
  form: { padding: 20, gap: 15 },
  field: { gap: 7 },
  label: { fontSize: 13, color: colors.ink, fontWeight: "700" },
  inputWrap: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#FBFCFE",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, color: colors.ink, fontSize: 15, paddingVertical: 12 },
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
    marginTop: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  securityText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted },
  forgot: {
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  footer: {
    marginTop: "auto",
    textAlign: "center",
    fontSize: 11,
    color: colors.mutedLight,
    paddingVertical: 16,
  },
});
