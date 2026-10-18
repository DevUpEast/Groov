import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * The one done glyph (plan §3, C-02a): a stroked ✓ drawn as SVG, so it renders the same on
 * every platform and font (the text ✓ and the 🛡 emoji did not, CHK-1).
 * - `color`: the stroke (on an accent fill this is `accent.onFill`).
 * - `size`: the box in px (default 16); `strokeWidth` in the 16-unit viewBox (default 2.4).
 * Static here; C-06b animates the draw (`strokeDashoffset` on this path).
 */
export const CHECK_PATH = 'M3.5 8.5l3 3 6-7';

export default function CheckMark({ color, size = 16, strokeWidth = 2.4, testID }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" testID={testID} accessible={false}>
      <Path d={CHECK_PATH} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
