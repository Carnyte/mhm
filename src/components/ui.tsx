// Shared UI primitives.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { settingsStore } from '../state/settings';
import { useTheme } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (!settingsStore.get().haptics || Platform.OS === 'web') return;
  if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function T({
  children,
  style,
  muted,
  faint,
  size = 15,
  weight,
  numberOfLines,
  selectable,
  center,
  onPress,
}: {
  onPress?: () => void;
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
  muted?: boolean;
  faint?: boolean;
  size?: number;
  weight?: TextStyle['fontWeight'];
  numberOfLines?: number;
  selectable?: boolean;
  center?: boolean;
}) {
  const c = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      onPress={onPress}
      suppressHighlighting
      style={[
        { color: faint ? c.textFaint : muted ? c.textMuted : c.text, fontSize: size, fontWeight: weight },
        center && { textAlign: 'center' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress, onLongPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; onLongPress?: () => void }) {
  const c = useTheme();
  const base: StyleProp<ViewStyle> = [styles.card, { backgroundColor: c.card, borderColor: c.border }, style];
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  icon,
  kind = 'primary',
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? c.danger : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.primaryText : kind === 'danger' ? '#fff' : kind === 'secondary' ? c.text : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
  active,
  disabled,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [styles.iconBtn, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={color ?? (active ? c.accent : c.text)} />
    </Pressable>
  );
}

export function Chip({
  label,
  onPress,
  active,
  icon,
  onRemove,
  style,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  icon?: IconName;
  onRemove?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const fg = active ? c.primaryText : c.chipText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      disabled={!onPress && !onRemove}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? c.primary : c.chip, opacity: pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={13} color={fg} />}
      <Text style={{ color: fg, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
        {label}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
          <Ionicons name="close-circle" size={15} color={fg} />
        </Pressable>
      )}
    </Pressable>
  );
}

export function Badge({ label, color, textColor }: { label: string; color?: string; textColor?: string }) {
  const c = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: color ?? c.accent }]}>
      <Text style={{ color: textColor ?? '#fff', fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  right,
  onPress,
  chevron = !!onPress,
  destructive,
  value,
  iconColor,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  value?: string;
  iconColor?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
    >
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconColor ?? (destructive ? c.danger : c.primary) }]}>
          <Ionicons name={icon} size={17} color="#fff" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: destructive ? c.danger : c.text, fontSize: 16 }}>{title}</Text>
        {!!subtitle && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={{ color: c.textMuted, fontSize: 15 }}>{value}</Text>}
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={c.textFaint} />}
    </Pressable>
  );
}

export function Section({ title, children, footer, style, action }: { title?: string; children: ReactNode; footer?: string; style?: StyleProp<ViewStyle>; action?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={[{ marginTop: 22 }, style]}>
      {(title || action) && (
        <View style={styles.sectionHeader}>
          {title ? <Text style={[styles.sectionTitle, { color: c.textMuted }]}>{title.toUpperCase()}</Text> : <View />}
          {action}
        </View>
      )}
      <View style={[styles.sectionBody, { borderColor: c.border, backgroundColor: c.surface }]}>{children}</View>
      {!!footer && <Text style={[styles.sectionFooter, { color: c.textFaint }]}>{footer}</Text>}
    </View>
  );
}

export function Input(props: TextInputProps & { icon?: IconName; onClear?: () => void }) {
  const c = useTheme();
  const { icon, onClear, style, ...rest } = props;
  return (
    <View style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      {icon && <Ionicons name={icon} size={18} color={c.textFaint} />}
      <TextInput
        placeholderTextColor={c.textFaint}
        style={[{ flex: 1, color: c.text, fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 6 }, style]}
        {...rest}
      />
      {!!onClear && !!props.value && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={18} color={c.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surfaceAlt }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic();
              onChange(o.value);
            }}
            style={[styles.segment, active && { backgroundColor: c.surface, shadowOpacity: 0.12 }]}
          >
            <Text style={{ color: active ? c.text : c.textMuted, fontWeight: active ? '600' : '500', fontSize: 13 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function ProgressBar({ value, color, height = 4 }: { value: number; color?: string; height?: number }) {
  const c = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, backgroundColor: color ?? c.accent }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonSmall: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  iconBtn: { padding: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 50,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  sectionBody: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionFooter: { fontSize: 12, paddingHorizontal: 20, marginTop: 6, lineHeight: 17 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0,
  },
});
