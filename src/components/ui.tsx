// Shared UI primitives, in Material You's style (the look of Google's own apps): pill-shaped
// buttons (filled, tonal, text), rounded cards and grouped lists without borders on tinted
// surfaces, outlined filter chips that fill when selected, pill text fields and segmented buttons.
// Colours come from the theme (src/theme), which follows the reader theme.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type SwitchProps,
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
  const base: StyleProp<ViewStyle> = [styles.card, { backgroundColor: c.card }, style];
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, pressed && { backgroundColor: c.surfaceAlt }]}
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
  // primary: filled; secondary: tonal; ghost: a text button; danger: filled in the error colour.
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? c.danger : kind === 'secondary' ? c.secondaryContainer : 'transparent';
  const fg = kind === 'primary' ? c.primaryText : kind === 'danger' ? (c.dark ? '#601410' : '#FFFFFF') : kind === 'secondary' ? c.onSecondaryContainer : c.primary;
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
        { backgroundColor: bg, opacity: disabled ? 0.38 : pressed ? 0.82 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 14, letterSpacing: 0.1 }}>{title}</Text>
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
      style={({ pressed }) => [
        styles.iconBtn,
        { opacity: disabled ? 0.38 : 1, backgroundColor: active ? c.secondaryContainer : pressed ? c.surfaceAlt : 'transparent' },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? (active ? c.onSecondaryContainer : c.textMuted)} />
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
  // A filter chip: outlined, filled (with a tick) when selected.
  const fg = active ? c.onSecondaryContainer : c.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      disabled={!onPress && !onRemove}
      style={({ pressed }) => [
        styles.chip,
        active ? { backgroundColor: c.secondaryContainer, borderColor: c.secondaryContainer } : { backgroundColor: pressed ? c.surfaceAlt : 'transparent', borderColor: c.border },
        style,
      ]}
    >
      {active && !icon ? <Ionicons name="checkmark" size={15} color={fg} /> : icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={{ color: active ? c.onSecondaryContainer : c.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
        {label}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
          <Ionicons name="close" size={16} color={fg} />
        </Pressable>
      )}
    </Pressable>
  );
}

export function Badge({ label, color, textColor }: { label: string; color?: string; textColor?: string }) {
  const c = useTheme();
  return (
    // Tonal (a soft tint of the colour, the label in it) unless a text colour asks for a solid one.
    <View style={[styles.badge, { backgroundColor: textColor ? (color ?? c.primary) : (color ?? c.primary) + '26' }]}>
      <Text style={{ color: textColor ?? color ?? c.primary, fontSize: 11, fontWeight: '600' }}>{label}</Text>
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
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface }]}
    >
      {icon && (
        // A tonal circle; a site's own colour (iconColor) tints it.
        <View style={[styles.rowIcon, { backgroundColor: destructive ? c.danger + '22' : iconColor ? iconColor + '22' : c.secondaryContainer }]}>
          <Ionicons name={icon} size={19} color={destructive ? c.danger : (iconColor ?? c.onSecondaryContainer)} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: destructive ? c.danger : c.text, fontSize: 16 }}>{title}</Text>
        {!!subtitle && <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 2, lineHeight: 19 }}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={{ color: c.textMuted, fontSize: 14 }}>{value}</Text>}
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
          {title ? <Text style={[styles.sectionTitle, { color: c.primary }]}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      <View style={[styles.sectionBody, { backgroundColor: c.surface }]}>{children}</View>
      {!!footer && <Text style={[styles.sectionFooter, { color: c.textFaint }]}>{footer}</Text>}
    </View>
  );
}

export function Input(props: TextInputProps & { icon?: IconName; onClear?: () => void }) {
  const c = useTheme();
  const { icon, onClear, style, ...rest } = props;
  return (
    <View style={[styles.input, { backgroundColor: c.surfaceAlt }]}>
      {icon && <Ionicons name={icon} size={20} color={c.textMuted} />}
      <TextInput
        placeholderTextColor={c.textFaint}
        style={[{ flex: 1, color: c.text, fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 13 : 9 }, style]}
        {...rest}
      />
      {!!onClear && !!props.value && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear">
          <Ionicons name="close" size={20} color={c.textMuted} />
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
    <View style={[styles.segmented, { borderColor: c.outline }, style]}>
      {options.map((o, i) => {
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
            style={[styles.segment, i > 0 && { borderLeftWidth: 1, borderLeftColor: c.outline }, active && { backgroundColor: c.secondaryContainer }]}
          >
            {active && options.length <= 3 && <Ionicons name="checkmark" size={15} color={c.onSecondaryContainer} />}
            <Text style={{ color: active ? c.onSecondaryContainer : c.text, fontWeight: '500', fontSize: 13 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A switch in the theme's colours (on: the primary colour; off: an outlined grey track). */
export function Switch(props: SwitchProps) {
  const c = useTheme();
  return (
    <RNSwitch
      trackColor={{ true: c.primary, false: c.surfaceContainerHigh }}
      thumbColor={Platform.OS === 'android' ? (props.value ? c.primaryText : c.outline) : undefined}
      ios_backgroundColor={c.surfaceContainerHigh}
      {...(Platform.OS === 'web' ? { activeThumbColor: c.primaryText } : {})}
      {...props}
    />
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function ProgressBar({ value, color, height = 4 }: { value: number; color?: string; height?: number }) {
  const c = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.secondaryContainer, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, borderRadius: height, backgroundColor: color ?? c.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    minHeight: 44,
    borderRadius: 999,
  },
  buttonSmall: { paddingHorizontal: 16, minHeight: 34 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 28, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  sectionBody: { marginHorizontal: 16, borderRadius: 24, overflow: 'hidden' },
  sectionFooter: { fontSize: 13, paddingHorizontal: 28, marginTop: 8, lineHeight: 18 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 28,
    paddingHorizontal: 18,
  },
  segmented: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
});
