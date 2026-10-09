// Loading / error / empty states, with the right recovery action for each error type, in the
// words of the site the error came from.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { LoginRequiredError, NeedsWebError } from '../ffn/api';
import { FfnPageError } from '../ffn/parsers/story';
import { SourceBlockedError } from '../net/blocks';
import { bridge, BridgeError } from '../net/bridge';
import { HttpTimeoutError, NetworkError, RateLimitedError } from '../net/httpCore';
import { SOURCE_NAMES } from '../sources/keys';
import { Ao3AdultNoticeError, Ao3NotFoundError, Ao3RestrictedError, Ao3UnavailableError } from '../sources/ao3/api';
import { ComingSoonError } from '../sources/registry';
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
  if (error instanceof Ao3RestrictedError) {
    // Logging in to AO3 comes in a later version; until then the work opens on AO3's site.
    return (
      <Empty
        icon="lock-closed-outline"
        title="Log in to AO3 to read this"
        message="This work's creator made it visible only to people logged in to AO3. FicShelf can't log in to AO3 yet, so open it on AO3's site."
        action={{ label: 'Open on AO3', onPress: () => Linking.openURL(error.url).catch(() => {}) }}
      />
    );
  }
  if (error instanceof Ao3NotFoundError) {
    return <Empty icon="help-circle-outline" title="Not on AO3" message={error.message} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />;
  }
  if (error instanceof Ao3UnavailableError || error instanceof Ao3AdultNoticeError) {
    return <Empty icon="cloud-offline-outline" title={error instanceof Ao3UnavailableError ? 'AO3 is busy' : 'AO3 asked to confirm'} message={error.message} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />;
  }
  if (error instanceof ComingSoonError) {
    return (
      <Empty
        icon="time-outline"
        title={error.message}
        message={`This version of FicShelf can't open ${SOURCE_NAMES[error.source]} stories yet. FanFiction.net and AO3 stories work.`}
      />
    );
  }
  if (error instanceof RateLimitedError) {
    return (
      <Empty
        icon="hourglass-outline"
        title={`${error.site} asked FicShelf to slow down`}
        message={error.message}
        action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
      />
    );
  }
  if (error instanceof SourceBlockedError) {
    return <Empty icon="shield-checkmark-outline" title="Security check needed" message={error.message} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />;
  }
  const offline = (error instanceof BridgeError && (error.code === 'network' || error.code === 'timeout')) || error instanceof NetworkError || error instanceof HttpTimeoutError;
  const site = error instanceof NetworkError || error instanceof HttpTimeoutError ? error.site : 'FanFiction.net';
  return (
    <Empty
      icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
      title={offline ? `Can't reach ${site}` : error instanceof FfnPageError && error.code === 'not_found' ? 'Not found' : 'Something went wrong'}
      message={errorMessage(error)}
      action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

/** An inline message card (e.g. "Wattpad support is coming soon" under a pasted link). */
export function Notice({ icon = 'information-circle-outline', title, message }: { icon?: IconName; title: string; message?: string }) {
  const c = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="alert">
      <Ionicons name={icon} size={22} color={c.accent} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <T size={15} weight="600">
          {title}
        </T>
        {!!message && (
          <T muted size={13} style={{ marginTop: 3, lineHeight: 19 }}>
            {message}
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 240 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
