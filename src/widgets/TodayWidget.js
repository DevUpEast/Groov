import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { MAX_WIDGET_ROWS } from './widgetData';

// Today's habits widget. Renders from the model built in widgetData.js. Every row
// is tappable: the click action carries the habit id and the task handler toggles it.
const LIGHT = { bg: '#FFFFFF', text: '#111827', muted: '#6B7280', primary: '#4F46E5', primaryLight: '#EEF2FF', border: '#E5E7EB' };
const DARK = { bg: '#1E293B', text: '#F8FAFC', muted: '#CBD5E1', primary: '#818CF8', primaryLight: '#312E81', border: '#334155' };

// `maxRows` is derived from the widget height by the caller (about 34dp per row).
export function TodayWidget({ model, dark = false, maxRows = MAX_WIDGET_ROWS }) {
  const t = dark ? DARK : LIGHT;
  const rows = model.rows.slice(0, Math.max(1, maxRows));
  const extra = model.rows.length - rows.length;
  return (
    <FlexWidget
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: t.bg, borderRadius: 20, padding: 14, flexDirection: 'column' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'groov://today' }}
      accessibilityLabel={`Groov: ${model.done} of ${model.total} habits done`}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <TextWidget text="Today" style={{ fontSize: 15, fontWeight: 'bold', color: t.text }} />
        <FlexWidget style={{ backgroundColor: model.total > 0 && model.done >= model.total ? t.primary : t.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
          <TextWidget text={`${model.done}/${model.total}`} style={{ fontSize: 12, fontWeight: 'bold', color: model.total > 0 && model.done >= model.total ? '#FFFFFF' : t.primary }} />
        </FlexWidget>
      </FlexWidget>

      {rows.length === 0 ? (
        <TextWidget text={model.total === 0 && model.rows.length === 0 ? 'Rest day. Nothing scheduled.' : 'Add a habit to get started'} style={{ fontSize: 13, color: t.muted }} />
      ) : rows.map(r => {
        const label = r.type === 'volume' || r.type === 'timed' || r.type === 'atMost'
          ? `${r.name}  ·  ${r.count}/${r.goal}`
          : r.name;
        return (
          <FlexWidget
            key={r.id}
            style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.border }}
            clickAction="TOGGLE_HABIT"
            clickActionData={{ habitId: r.id }}
            accessibilityLabel={`${r.name}${r.done ? ', done' : ''}`}
          >
            <TextWidget text={r.icon} style={{ fontSize: 16, marginRight: 8 }} />
            <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
              <TextWidget text={label} truncate="END" maxLines={1} style={{ width: 'match_parent', fontSize: 13, color: r.done ? t.muted : t.text, fontWeight: r.done ? 'normal' : '600' }} />
            </FlexWidget>
            <FlexWidget style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: r.done ? (r.color || t.primary) : t.border, backgroundColor: r.done ? (r.color || t.primary) : t.bg, alignItems: 'center', justifyContent: 'center' }}>
              {r.done ? <TextWidget text="✓" style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 'bold' }} /> : null}
            </FlexWidget>
          </FlexWidget>
        );
      })}
      {extra > 0 ? <TextWidget text={`+${extra} more in the app`} style={{ fontSize: 11, color: t.muted, marginTop: 6 }} /> : null}
    </FlexWidget>
  );
}
