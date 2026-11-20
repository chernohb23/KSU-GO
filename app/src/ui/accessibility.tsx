import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';

const Context = createContext({ reduceMotion: true, reduceTransparency: true });

/** One subscription per system preference, shared by all controls. Start conservatively. */
export function AccessibilityProvider({ children }: PropsWithChildren) {
  const [reduceMotion, setMotion] = useState(true);
  const [reduceTransparency, setTransparency] = useState(true);
  useEffect(() => {
    let live = true;
    let motionChanged = false, transparencyChanged = false;
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      motionChanged = true; setMotion(value);
    });
    const transparencySub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (value) => {
      transparencyChanged = true; setTransparency(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live && !motionChanged) setMotion(value);
    }).catch(() => {});
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (live && !transparencyChanged) setTransparency(value);
    }).catch(() => {});
    return () => { live = false; motionSub.remove(); transparencySub.remove(); };
  }, []);
  return <Context.Provider value={{ reduceMotion, reduceTransparency }}>{children}</Context.Provider>;
}

export const useReduceMotion = () => useContext(Context).reduceMotion;
export const useReduceTransparency = () => useContext(Context).reduceTransparency;
