/// <reference types="expo/types/metro-require" />
import type { Route } from '../../../shared/types';

// Seed events reference confirmed routes by ID; organizer drafts are listed separately.
const files = require.context('../../../shared/fixtures/routes', false, /\.json$/);
export const bundledRoutes = files.keys().map(path => files<Route>(path));
export const bundledDrafts = bundledRoutes.filter(route => route.status === 'draft');
