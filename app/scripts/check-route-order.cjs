// Use Expo Router's real route discovery and comparator against every app route.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getRoutes } = require('expo-router/build/getRoutes');
const { sortRoutesWithInitial } = require('expo-router/build/sortRoutes');
const { getValidInitialRouteName } = require('expo-router/build/routeNode');
const rootDir = path.resolve(__dirname, '../app');
const files = fs.readdirSync(rootDir, { recursive: true }).filter((name) => name.endsWith('.tsx'));
const modules = Object.fromEntries(files.map((file) => {
  const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const initial = source.match(/initialRouteName:\s*'([^']+)'/)?.[1];
  return ['./' + file.split(path.sep).join('/'), { default: () => null, ...(initial && { unstable_settings: { initialRouteName: initial } }) }];
}));
const context = Object.assign((id) => modules[id], { keys: () => Object.keys(modules), resolve: (id) => id, id: 'app-routes' });
const root = getRoutes(context, { platform: 'ios' });
const tabs = root.children.find((route) => route.route === '(tabs)');
const initial = getValidInitialRouteName(tabs);
const seeded = [...tabs.children].sort(sortRoutesWithInitial(initial)).map((route) => route.route);
const layout = fs.readFileSync(path.join(rootDir, '(tabs)/_layout.tsx'), 'utf8');
const names = [...layout.matchAll(/<Tabs.Screen name="([^"]+)"/g)].map((match) => match[1]);
const mounted = names.map((name) => {
  const match = tabs.children.find((route) => route.route === name || route.route === name + '/index');
  assert.ok(match, 'Declared tab must exist: ' + name);
  return match.route;
});
assert.deepEqual(seeded, mounted, 'Mount order must match the seeded order (ROUTE_NAMES_CHANGED)');
assert.deepEqual(seeded, ['index', 'events', 'organization', 'profile/index']);
const expectedChildren = ['index', 'edit', 'create-event', 'event/[eventId]/index', 'event/[eventId]/edit',
  'event/[eventId]/directions/new', 'event/[eventId]/directions/[routeId]'];
const organization = tabs.children.find((route) => route.route === 'organization');
assert.deepEqual(organization.children.map((route) => route.route).sort(), expectedChildren.sort());
for (const route of ['org/[orgId]', 'new-organization', 'edit-profile']) {
  assert.ok(root.children.some((child) => child.route === route), 'Public screen must remain outside tabs: ' + route);
}
assert.equal(tabs.children.some((route) => /organizer|drafts/.test(route.route)), false);
console.log('Full route tree: ' + files.length + ' screens/layouts');
console.log('Seeded and mounted tabs: ' + JSON.stringify(seeded));
console.log('Organization stack: ' + JSON.stringify(organization.children.map((route) => route.route)));
console.log('Route order and root-screen isolation passed.');
