import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { MAX_WIDGET_ROWS } from './widgetData';
import { t } from '../i18n';
import { palette } from '../theme/tokens';
import { resolveAccent } from '../theme/accents';

// Today's habits widget. Renders from the model built in widgetData.js. Every row
// is tappable: the click action carries the habit id and the task handler toggles it.
// Headless (no React context), so it reads the role tokens directly (§2.1). The count pill is a
// meter when the day is complete (onMeter: ink on #818CF8 in dark, 5.98:1; white was 2.98:1)
// and the selection pair otherwise; the row check is the habit accent (resolveAccent: the
// ring when open, the fill plus its ✓ glyph when done, >= 3:1 each, CHK-2).
const roles = (p) => ({
  bg: p.surface, text: p.text, muted: p.textSecondary, border: p.border,
  meter: p.meter, onMeter: p.onMeter, selection: p.selection, onSelection: p.onSelection,
});
const LIGHT = roles(palette.light);
const DARK = roles(palette.dark);

// `maxRows` is derived from the widget height by the caller (about 34dp per row).
export function TodayWidget({ model, dark = false, maxRows = MAX_WIDGET_ROWS }) {
  const c = dark ? DARK : LIGHT;
  const rows = model.rows.slice(0, Math.max(1, maxRows));
  const extra = model.rows.length - rows.length;
  return (
    <FlexWidget
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: c.bg, borderRadius: 20, padding: 14, flexDirection: 'column' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'groov://today' }}
      accessibilityLabel={t('widget.a11y', { done: model.done, total: model.total })}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <TextWidget text={t('widget.title')} style={{ fontSize: 15, fontWeight: 'bold', color: c.text }} />
        <FlexWidget style={{ backgroundColor: model.total > 0 && model.done >= model.total ? c.meter : c.selection, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
          <TextWidget text={`${model.done}/${model.total}`} style={{ fontSize: 12, fontWeight: 'bold', color: model.total > 0 && model.done >= model.total ? c.onMeter : c.onSelection }} />
        </FlexWidget>
      </FlexWidget>

      {rows.length === 0 ? (
        <TextWidget text={model.total === 0 && model.rows.length === 0 ? t('widget.restDay') : t('widget.addHabit')} style={{ fontSize: 13, color: c.muted }} />
      ) : rows.map(r => {
        const accent = resolveAccent(r.color, dark ? 'dark' : 'light');
        const label = r.type === 'volume' || r.type === 'timed' || r.type === 'atMost'
          ? t('widget.rowCount', { name: r.name, count: r.count, goal: r.goal })
          : r.name;
        return (
          <FlexWidget
            key={r.id}
            style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}
            clickAction="TOGGLE_HABIT"
            clickActionData={{ habitId: r.id }}
            accessibilityLabel={r.done ? t('widget.rowDone', { name: r.name }) : r.name}
          >
            <TextWidget text={r.icon} style={{ fontSize: 16, marginRight: 8 }} />
            <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
              <TextWidget text={label} truncate="END" maxLines={1} style={{ width: 'match_parent', fontSize: 13, color: r.done ? c.muted : c.text, fontWeight: r.done ? 'normal' : '600' }} />
            </FlexWidget>
            <FlexWidget style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: r.done ? accent.fill : accent.ring, backgroundColor: r.done ? accent.fill : c.bg, alignItems: 'center', justifyContent: 'center' }}>
              {r.done ? <TextWidget text="✓" style={{ fontSize: 12, color: accent.onFill, fontWeight: 'bold' }} /> : null}
            </FlexWidget>
          </FlexWidget>
        );
      })}
      {extra > 0 ? <TextWidget text={t('widget.more', { count: extra })} style={{ fontSize: 11, color: c.muted, marginTop: 6 }} /> : null}
    </FlexWidget>
  );
}
