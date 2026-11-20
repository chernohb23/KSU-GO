import { createContext, useContext } from 'react';

export const DockSpaceContext = createContext(0);
export const useDockClearance = () => useContext(DockSpaceContext);
