import React, { useState, useEffect } from 'react';
import { Image, Text } from 'react-native';

// Renders a habit's custom image when it exists and loads, otherwise its emoji
// (or a placeholder). The Image's onError covers a purged cache or missing file.
export default function HabitIcon({ habit, size = 26, imageStyle, textStyle }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [habit?.customIconUri]);

  if (habit?.customIconUri && !failed) {
    return (
      <Image
        source={{ uri: habit.customIconUri }}
        style={[{ width: size + 6, height: size + 6, borderRadius: 6 }, imageStyle]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return <Text style={[{ fontSize: size }, textStyle]}>{habit?.icon || '⭐'}</Text>;
}
