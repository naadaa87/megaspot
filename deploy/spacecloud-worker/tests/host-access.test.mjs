import assert from 'node:assert/strict';
import test from 'node:test';
import { SpacecloudUI } from '../host.mjs';

const entry = {
  date: '2026-12-24', start: 17, end: 23, marker: 'MSWEB-0123456789ABCDEF',
  product: 140188, action: 'block',
  host_url: 'https://partner.spacecloud.kr/reservation-calendar?product=140188&space=81999',
  public_url: 'https://www.spacecloud.kr/space/81999',
};

function loggedInPage(selection = ['81999', '140188']) {
  const locator = { async waitFor() {}, first() { return this; } };
  return {
    setDefaultTimeout() {},
    on() {},
    async goto() {},
    url() { return entry.host_url; },
    getByRole() { return locator; },
    locator(selector) {
      if (selector === 'select') return { async evaluateAll() { return selection; } };
      assert.equal(selector, '.booking_wrap');
      return locator;
    },
  };
}

test('checks the signed-in tab and exact product without waiting for booking requests', async () => {
  const page = loggedInPage();
  const host = new SpacecloudUI({
    newPage() { assert.fail('login verification must keep the signed-in page'); },
  });
  host.settle = () => assert.fail('login verification does not require calendar requests');
  await host.initialize(page);
  await host.openHost(entry, { accessOnly: true });

  await host.initialize(loggedInPage(['81999', '110429']));
  await assert.rejects(host.openHost(entry, { accessOnly: true }), /host_unavailable/);
});

test('checking a calendar for a booking still requires settled requests', async () => {
  const host = new SpacecloudUI({});
  host.settle = async () => { throw new Error('calendar did not settle'); };
  await host.initialize(loggedInPage());
  await assert.rejects(host.openHost(entry), /calendar did not settle/);
});
