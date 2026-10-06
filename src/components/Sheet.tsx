// Global action sheet + option picker + toast, rendered once at the root.

import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStore, useStore } from '../state/store';
import { useTheme } from '../theme';
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

  return (
    <>
      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={close} accessibilityLabel="Close" />
        {sheet && (
          <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 8 }]}>
            <View style={[styles.grabber, { backgroundColor: c.border }]} />
            {sheet.kind === 'actions' && (
              <>
                {(sheet.title || sheet.message) && (
                  <View style={styles.header}>
                    {!!sheet.title && (
                      <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }} numberOfLines={2}>
                        {sheet.title}
                      </Text>
                    )}
                    {!!sheet.message && <Text style={{ color: c.textMuted, marginTop: 4 }}>{sheet.message}</Text>}
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
                      style={({ pressed }) => [styles.action, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
                    >
                      {a.icon && <Ionicons name={a.icon} size={20} color={a.destructive ? c.danger : c.text} />}
                      <Text style={{ color: a.destructive ? c.danger : c.text, fontSize: 16 }}>{a.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            {sheet.kind === 'picker' && (
              <>
                <View style={styles.header}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{sheet.title}</Text>
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
                        style={({ pressed }) => [styles.action, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text, fontSize: 16, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
                          {!!o.sub && <Text style={{ color: c.textMuted, fontSize: 12 }}>{o.sub}</Text>}
                        </View>
                        {active && <Ionicons name="checkmark" size={20} color={c.accent} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <Pressable onPress={close} style={[styles.cancel, { backgroundColor: c.surfaceAlt }]} accessibilityRole="button">
              <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>Cancel</Text>
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
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => toastStore.set(null), 2800);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!visible) return null;
  const bg = visible.kind === 'error' ? c.danger : visible.kind === 'success' ? c.success : c.dark ? '#2A323D' : '#1F2A37';
  return (
    <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 90, backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>{visible.message}</Text>
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  header: { paddingHorizontal: 20, paddingVertical: 10 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancel: { margin: 12, marginBottom: 4, borderRadius: 12, alignItems: 'center', paddingVertical: 14 },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignSelf: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
