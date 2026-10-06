// Log in to FanFiction.net: native email/password (same steps as the site's form), with the real
// login page (captcha / Google / Facebook / X / Amazon / Microsoft / FictionPress) as fallback.

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { toast } from '../components/Sheet';
import { Button, Input, T } from '../components/ui';
import { login } from '../ffn/api';
import { ACCOUNT_PATHS } from '../ffn/urls';
import { invalidate } from '../hooks/useQuery';
import { useSession } from '../state/session';
import { useTheme } from '../theme';
import { errorMessage } from '../utils/format';

export default function LoginScreen() {
  const c = useTheme();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (session.loggedIn) {
      invalidate('');
      toast(`Logged in as ${session.username}`, 'success');
      router.back();
    }
  }, [session.loggedIn, session.username]);

  const openWebLogin = (prefill?: string) =>
    router.push({ pathname: '/web', params: { path: ACCOUNT_PATHS.login + '?cache=bust', title: 'Log in', email: prefill ?? '', login: '1' } });

  const submit = async () => {
    if (!email.trim() || !password) {
      setMessage('Enter your email and password.');
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const r = await login(email.trim(), password);
      if (r.ok) return; // the session effect above closes the screen
      if (r.reason === 'captcha') {
        toast('FanFiction.net wants a quick captcha', 'info');
        openWebLogin(email.trim());
      } else setMessage(r.message);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Log in' }} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <T size={24} weight="800">
          FanFiction.net account
        </T>
        <T muted style={{ lineHeight: 20 }}>
          Your login goes straight to FanFiction.net. The app keeps the site’s session cookie on this device and never stores your password.
        </T>
        <Input
          icon="mail-outline"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <Input
          icon="lock-closed-outline"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {!!message && (
          <T size={14} style={{ color: c.danger }}>
            {message}
          </T>
        )}
        <Button title="Log in" icon="log-in-outline" onPress={submit} loading={busy} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button kind="ghost" small title="Forgot password?" onPress={() => router.push({ pathname: '/web', params: { path: ACCOUNT_PATHS.recover, title: 'Reset password' } })} />
          <Button kind="ghost" small title="Create account" onPress={() => router.push({ pathname: '/web', params: { path: ACCOUNT_PATHS.signup, title: 'Sign up' } })} />
        </View>
        <View style={{ height: 1, backgroundColor: c.border, marginVertical: 8 }} />
        <T size={15} weight="600">
          Other ways to sign in
        </T>
        <T muted size={13} style={{ lineHeight: 19 }}>
          Opens FanFiction.net’s own login page, which has Google, Facebook, X, Amazon, Microsoft and FictionPress sign-in plus the captcha when it’s needed. Google may block sign-in inside apps. If it does, set a password on your account and use email login.
        </T>
        <Button kind="secondary" icon="globe-outline" title="Use the FanFiction.net login page" onPress={() => openWebLogin(email.trim())} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
