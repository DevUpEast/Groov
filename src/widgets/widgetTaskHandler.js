import React from 'react';
import { Appearance } from 'react-native';
import { TodayWidget } from './TodayWidget';
import { loadTodayForWidget, applyWidgetToggle, WIDGET_NAME, rowsForHeight } from './widgetData';
import { initLocale } from '../i18n';

// Headless task invoked by the OS for widget lifecycle events and taps.
async function render(props) {
  // Headless: the app's locale choice is not applied yet, so load it here.
  await initLocale();
  const model = await loadTodayForWidget();
  const maxRows = rowsForHeight(props.widgetInfo?.height);
  const dark = model.theme === 'dark' || (model.theme === 'system' && Appearance.getColorScheme() === 'dark');
  props.renderWidget({
    light: <TodayWidget model={model} dark={false} maxRows={maxRows} />,
    dark: <TodayWidget model={model} dark={true} maxRows={maxRows} />,
  });
  void dark;
}

export async function widgetTaskHandler(props) {
  if (props.widgetInfo?.widgetName !== WIDGET_NAME) return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await render(props);
      break;
    case 'WIDGET_CLICK':
      if (props.clickAction === 'TOGGLE_HABIT' && props.clickActionData?.habitId) {
        await applyWidgetToggle(String(props.clickActionData.habitId));
        await render(props);
      }
      break;
    default:
      break;
  }
}
