import assert from 'node:assert/strict';
import test from 'node:test';

import { accountIdFor, ownsOrganization, mapSheetVisible, registerAvailability, showsSignIn, tabsFor } from './access.ts';

const student = { status: 'signedIn', token: 't1', verified: true,
  user: { id: 'user-demo-student', name: 'Maya Chen', email: 'student@ksu-go.example', ownedOrganizationIds: [], followingOrganizationIds: [] } };
const organizer = { status: 'signedIn', token: 't2', verified: true,
  user: { id: 'user-demo-organizer', name: 'Noah Brooks', email: 'organizer@ksu-go.example', ownedOrganizationIds: ['org-robotics-club'], followingOrganizationIds: [] } };
const guest = { status: 'guest' };
const signedOut = { status: 'signedOut', message: null };
const restoring = { status: 'restoring' };

test('ownership determines the exact tabs', () => {
  assert.deepEqual(tabsFor(student), ['index', 'events', 'profile']);
  assert.deepEqual(tabsFor(guest), ['index', 'events', 'profile']);
  assert.deepEqual(tabsFor(organizer), ['index', 'events', 'organization', 'profile']);
  assert.deepEqual(tabsFor(signedOut), []);
  assert.deepEqual(tabsFor(restoring), []);
});

test('any account gaining its first organization gets the tab; several organizations keep a single tab', () => {
  const owner = { ...student, user: { ...student.user, ownedOrganizationIds: ['org-one', 'org-two'] } };
  assert.equal(ownsOrganization(owner), true);
  assert.deepEqual(tabsFor(owner), ['index', 'events', 'organization', 'profile']);
  assert.deepEqual(tabsFor({ ...owner, user: { ...owner.user, ownedOrganizationIds: [] } }), ['index', 'events', 'profile']);
});

test('only an organization owner passes the organization guard (Tabs.Protected and the layout redirect)', () => {
  assert.equal(ownsOrganization(organizer), true);
  assert.equal(ownsOrganization({ ...organizer, verified: false }), true); // offline: drafts still open read-only
  for (const state of [student, guest, signedOut, restoring]) assert.equal(ownsOrganization(state), false, state.status);
});

test('signed-out and restoring states show sign-in; everyone else gets the app screens', () => {
  assert.equal(showsSignIn(signedOut), true);
  assert.equal(showsSignIn(restoring), true);
  for (const state of [student, organizer, guest]) assert.equal(showsSignIn(state), false, state.status);
});

test('a guest cannot register; registering needs a confirmed session and a live server', () => {
  assert.equal(registerAvailability({ state: guest, offline: false, registered: false }), 'sign-in');
  assert.equal(registerAvailability({ state: guest, offline: true, registered: false }), 'sign-in');
  assert.equal(registerAvailability({ state: student, offline: true, registered: false }), 'needs-server');
  assert.equal(registerAvailability({ state: { ...student, verified: false }, offline: false, registered: false }), 'needs-server');
  assert.equal(registerAvailability({ state: student, offline: false, registered: false }), 'available');
  assert.equal(registerAvailability({ state: organizer, offline: false, registered: false }), 'available');
  assert.equal(registerAvailability({ state: student, offline: true, registered: true }), 'registered');
});

test('local data belongs to the signed-in account or the guest', () => {
  assert.equal(accountIdFor(student), 'user-demo-student');
  assert.equal(accountIdFor(organizer), 'user-demo-organizer');
  assert.equal(accountIdFor(guest), 'guest');
  assert.equal(accountIdFor(signedOut), null);
});

test('the map sheet hides under the route screen and comes back with the same event', () => {
  assert.equal(mapSheetVisible({ selected: true, listOpen: false, focused: true }), true);
  // "Take me there" pushes the route: the map loses focus, the selection stays.
  assert.equal(mapSheetVisible({ selected: true, listOpen: false, focused: false }), false);
  // Back: focus returns, the same selection reopens the sheet.
  assert.equal(mapSheetVisible({ selected: true, listOpen: false, focused: true }), true);
  assert.equal(mapSheetVisible({ selected: false, listOpen: false, focused: true }), false);
  assert.equal(mapSheetVisible({ selected: false, listOpen: true, focused: true }), true);
});
