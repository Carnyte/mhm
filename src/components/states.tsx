// Loading / error / empty states, with the right recovery action for each error type.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LoginRequiredError, NeedsWebError } from '../ffn/api';
import { FfnPageError } from '../ffn/parsers/story';
import { bridge, BridgeError } from '../net/bridge';
import { useTheme } from '../theme';
import { errorMessage } from '../utils/format';
import { Button, T, type IconName } from './ui';

export function Loading({ label }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.accent} />
      {!!label && (
        <T muted size={13} style={{ marginTop: 10 }}>
          {label}
        </T>
      )}
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={c.textFaint} />
      <T size={17} weight="600" style={{ marginTop: 12 }} center>
        {title}
      </T>
      {!!message && (
        <T muted center style={{ marginTop: 6, maxWidth: 320, lineHeight: 20 }}>
          {message}
        </T>
      )}
      {action && <Button title={action.label} onPress={action.onPress} style={{ marginTop: 16 }} />}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof LoginRequiredError || (error instanceof FfnPageError && error.code === 'login_required')) {
    return (
      <Empty
        icon="lock-closed-outline"
        title="Log in to see this"
        message="This page needs your FanFiction.net account."
        action={{ label: 'Log in', onPress: () => router.push('/login') }}
      />
    );
  }
  if (error instanceof NeedsWebError) {
    return (
      <Empty
        icon="globe-outline"
        title="Open on FanFiction.net"
        message={error.message}
        action={{ label: 'Open page', onPress: () => router.push({ pathname: '/web', params: { path: error.path } }) }}
      />
    );
  }
  if (error instanceof BridgeError && error.code === 'challenge') {
    return (
      <Empty
        icon="shield-checkmark-outline"
        title="Security check needed"
        message="FanFiction.net wants to confirm you're human. This usually takes one tap."
        action={{
          label: 'Verify',
          onPress: () => {
            bridge.showVerification();
            setTimeout(() => onRetry?.(), 500);
          },
        }}
      />
    );
  }
  const offline = error instanceof BridgeError && (error.code === 'network' || error.code === 'timeout');
  return (
    <Empty
      icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
      title={offline ? "Can't reach FanFiction.net" : error instanceof FfnPageError && error.code === 'not_found' ? 'Not found' : 'Something went wrong'}
      message={errorMessage(error)}
      action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 240 },
});
