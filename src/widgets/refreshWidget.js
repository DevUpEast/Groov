import React from 'react';
import { Platform, Appearance } from 'react-native';
import { TodayWidget } from './TodayWidget';
import { buildTodayModel, WIDGET_NAME, rowsForHeight } from './widgetData';

// Called from the app whenever habits/completions change so the home-screen widget
// reflects the latest state without waiting for its own update period.
let lib = null;
function getLib() {
  if (Platform.OS !== 'android') return null;
  if (!lib) { try { lib = require('react-native-android-widget'); } catch { lib = null; } }
  return lib;
}

export async function refreshWidget({ habits, completions, settings, today }) {
  const l = getLib();
  if (!l) return;
  try {
    const model = buildTodayModel(habits, completions, settings, today);
    await l.requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: (info) => {
        const maxRows = rowsForHeight(info?.height);
        return {
          light: <TodayWidget model={model} dark={false} maxRows={maxRows} />,
          dark: <TodayWidget model={model} dark={true} maxRows={maxRows} />,
        };
      },
    });
  } catch (e) {
    if (__DEV__) console.warn('refreshWidget:', e?.message);
  }
  void Appearance;
}
