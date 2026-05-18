import { createContext, useContext } from 'react';
import type { ScreenId, TabId } from '../types';

export interface NavigationContextType {
  screen: ScreenId;
  tab: TabId;
  setScreen: (s: ScreenId) => void;
  setTab: (t: TabId) => void;
}

export const NavigationContext = createContext<NavigationContextType>({
  screen: 'intro',
  tab: 'today',
  setScreen: () => {},
  setTab: () => {},
});

export const useNavigation = () => useContext(NavigationContext);
