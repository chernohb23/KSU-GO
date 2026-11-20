import assert from 'node:assert/strict';
import test from 'node:test';

import { accountIdFor, isOrganizer, mapSheetVisible, registerAvailability, showsSignIn, tabsFor } from './access.ts';

const student = { status: 'signedIn', token: 't1', verified: true,
  user: { id: 'user-demo-student', name: 'Maya Chen', email: 'student@ksu-go.example', role: 'student', organizationId: null } };
const organizer = { status: 'signedIn', token: 't2', verified: true,
  user: { id: 'user-demo-organizer', name: 'Noah Brooks', email: 'organizer@ksu-go.example', role: 'organizer', organizationId: 'org-robotics-club' } };
const guest = { status: 'guest' };
const signedOut = { status: 'signedOut', message: null };
const restoring = { status: 'restoring' };

test('each role sees exactly its tabs', () => {
  assert.deepEqual(tabsFor(student), ['index', 'events', 'profile']);
  assert.deepEqual(tabsFor(guest), ['index', 'events', 'profile']);
  assert.deepEqual(tabsFor(organizer), ['index', 'events', 'organizer', 'profile']);
  assert.deepEqual(tabsFor(signedOut), []);
  assert.deepEqual(tabsFor(restoring), []);
});

test('only an organizer passes the organizer guard (Tabs.Protected and the layout redirect)', () => {
  assert.equal(isOrganizer(organizer), true);
  assert.equal(isOrganizer({ ...organizer, verified: false }), true); // offline: drafts still open read-only
  for (const state of [student, guest, signedOut, restoring]) assert.equal(isOrganizer(state), false, state.status);
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
