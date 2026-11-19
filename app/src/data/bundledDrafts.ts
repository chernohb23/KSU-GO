/// <reference types="expo/types/metro-require" />
import type { Route } from '../../../shared/types';

// Metro includes every baked draft, including replacements for the first demo fixture.
const drafts = require.context('../../../shared/fixtures/routes', false, /\.draft\.json$/);
export const bundledDrafts = drafts.keys().map((path) => drafts<Route>(path));
