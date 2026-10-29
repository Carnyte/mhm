// Global action sheet + option picker + toast, rendered once at the root. Material style: a bottom
// sheet with large rounded corners and a drag handle, list items without dividers, and toasts as
// snackbars (the inverse surface; errors and successes marked by an icon in their colour).

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStore, useStore } from '../state/store';
import { useTheme } from '../theme';
import { MINI_PLAYER_HEIGHT, useMiniPlayerVisible } from './miniPlayerLayout';
import { haptic, type IconName } from './ui';

export interface SheetAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
}

interface PickerOption<T> {
  value: T;
  label: string;
  sub?: string;
}

type SheetState =
  | { kind: 'actions'; title?: string; message?: string; actions: SheetAction[] }
  | { kind: 'picker'; title: string; options: PickerOption<unknown>[]; value: unknown; onPick: (v: unknown) => void; multi?: false }
  | null;

const sheetStore = createStore<SheetState>(null);
const toastStore = createStore<{ message: string; id: number; kind: 'info' | 'error' | 'success' } | null>(null);

export function showActions(actions: SheetAction[], title?: string, message?: string) {
  sheetStore.set({ kind: 'actions', actions, title, message });
}

export function pickOption<T>(title: string, options: PickerOption<T>[], value: T, onPick: (v: T) => void) {
  sheetStore.set({ kind: 'picker', title, options: options as PickerOption<unknown>[], value, onPick: onPick as (v: unknown) => void });
}

export function toast(message: string, kind: 'info' | 'error' | 'success' = 'info') {
  if (kind === 'success') haptic('success');
  if (kind === 'error') haptic('warning');
  toastStore.set({ message, id: Date.now(), kind });
}

export function SheetHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const sheet = useStore(sheetStore);
  const close = () => sheetStore.set(null);
  const shown = useRef(false);

  // Safety net: if iOS refuses to present the sheet (another modal is already up), reset it so
  // later menus can still open instead of every sheet staying stuck.
  useEffect(() => {
    if (!sheet) {
      shown.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!shown.current) sheetStore.set(null);
    }, 1500);
    return () => clearTimeout(t);
  }, [sheet]);

  return (
    <>
      <Modal
        visible={!!sheet}
        transparent
        animationType="fade"
        onRequestClose={close}
        onShow={() => (shown.current = true)}
        supportedOrientations={['portrait', 'landscape']}
      >
        <Pressable style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={close} accessibilityLabel="Close" />
        {sheet && (
          <View style={[styles.sheet, { backgroundColor: c.surfaceContainer, paddingBottom: insets.bottom + 8 }]}>
            <View style={[styles.grabber, { backgroundColor: c.outline }]} />
            {sheet.kind === 'actions' && (
              <>
                {(sheet.title || sheet.message) && (
                  <View style={styles.header}>
                    {!!sheet.title && (
                      <Text style={{ color: c.text, fontWeight: '500', fontSize: 18 }} numberOfLines={2}>
                        {sheet.title}
                      </Text>
                    )}
                    {!!sheet.message && <Text style={{ color: c.textMuted, marginTop: 6, fontSize: 14, lineHeight: 20 }}>{sheet.message}</Text>}
                  </View>
                )}
                <ScrollView style={{ maxHeight: 460 }}>
                  {sheet.actions.map((a, i) => (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      onPress={() => {
                        close();
                        setTimeout(a.onPress, 250);
                      }}
                      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? c.surfaceContainerHigh : 'transparent' }]}
                    >
                      {a.icon && <Ionicons name={a.icon} size={22} color={a.destructive ? c.danger : c.textMuted} />}
                      <Text style={{ color: a.destructive ? c.danger : c.text, fontSize: 16 }}>{a.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            {sheet.kind === 'picker' && (
              <>
                <View style={styles.header}>
                  <Text style={{ color: c.text, fontWeight: '500', fontSize: 18 }}>{sheet.title}</Text>
                </View>
                <ScrollView style={{ maxHeight: 520 }}>
                  {sheet.options.map((o, i) => {
                    const active = o.value === sheet.value;
                    return (
                      <Pressable
                        key={i}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          close();
                          sheet.onPick(o.value);
                        }}
                        style={({ pressed }) => [styles.action, { backgroundColor: active ? c.secondaryContainer : pressed ? c.surfaceContainerHigh : 'transparent' }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: active ? c.onSecondaryContainer : c.text, fontSize: 16, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
                          {!!o.sub && <Text style={{ color: active ? c.onSecondaryContainer : c.textMuted, fontSize: 13, marginTop: 2 }}>{o.sub}</Text>}
                        </View>
                        {active && <Ionicons name="checkmark" size={20} color={c.onSecondaryContainer} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <Pressable onPress={close} style={({ pressed }) => [styles.cancel, { backgroundColor: pressed ? c.surfaceContainerHigh : 'transparent' }]} accessibilityRole="button">
              <Text style={{ color: c.primary, fontWeight: '600', fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </Modal>
      <ToastView />
    </>
  );
}

function ToastView() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const visible = useStore(toastStore);
  const lifted = useMiniPlayerVisible();
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => toastStore.set(null), 2800);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!visible) return null;
  // A snackbar: the inverse surface; an icon in the error / success colour says which kind.
  const mark = visible.kind === 'error' ? 'alert-circle' : visible.kind === 'success' ? 'checkmark-circle' : null;
  const markColor = visible.kind === 'error' ? (c.dark ? '#B3261E' : '#F2B8B5') : c.dark ? '#146C2E' : '#6DD58C';
  return (
    <View
      pointerEvents="none"
      style={[styles.toast, { bottom: insets.bottom + 90 + (lifted ? MINI_PLAYER_HEIGHT + 8 : 0), backgroundColor: c.inverseSurface }]}
      accessibilityLiveRegion="polite"
    >
      {mark && <Ionicons name={mark} size={20} color={markColor} />}
      <Text style={{ color: c.inverseText, fontSize: 14, flex: 1, lineHeight: 20 }}>{visible.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: StyleSheet.absoluteFill,
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  grabber: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.6 },
  header: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    minHeight: 56,
    paddingVertical: 12,
  },
  cancel: { margin: 12, marginBottom: 4, borderRadius: 999, alignItems: 'center', paddingVertical: 12 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    zIndex: 1100,
  },
});
