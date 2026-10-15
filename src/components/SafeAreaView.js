// SafeAreaView wrapper. On native it is the library component unchanged. On the web
// the library treats edges missing from an `edges` array as "additive" instead of
// "off" (so `edges={['top']}` still pads the bottom), which shows up as a coloured
// band above the tab bar in the iOS mockup. Normalising the array into an explicit
// record fixes that without touching call sites.
import React from 'react';
import { Platform } from 'react-native';
import { SafeAreaView as LibSafeAreaView } from 'react-native-safe-area-context';

const ALL = ['top', 'right', 'bottom', 'left'];

const SafeAreaView = React.forwardRef(function SafeAreaView({ edges, ...rest }, ref) {
  let normalized = edges;
  if (Platform.OS === 'web' && Array.isArray(edges)) {
    normalized = Object.fromEntries(ALL.map(e => [e, edges.includes(e) ? 'additive' : 'off']));
  }
  return <LibSafeAreaView ref={ref} edges={normalized} {...rest} />;
});

export default SafeAreaView;
