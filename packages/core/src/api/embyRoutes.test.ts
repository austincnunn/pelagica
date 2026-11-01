// Run with: node --test packages/core/src/api/embyRoutes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteForEmby, toEmbyDate } from './embyRoutes.ts';

const USER = 'u1';

test('rewrites Jellyfin 10.9+ user routes to Emby paths', () => {
    assert.equal(rewriteForEmby('get', '/UserItems/Resume', USER), '/Users/u1/Items/Resume');
    assert.equal(rewriteForEmby('get', '/UserViews', USER), '/Users/u1/Views');
    assert.equal(rewriteForEmby('get', '/Users/Me', USER), '/Users/u1');
    assert.equal(rewriteForEmby('post', '/Users/Configuration', USER), '/Users/u1/Configuration');
    assert.equal(
        rewriteForEmby('post', '/UserFavoriteItems/12345', USER),
        '/Users/u1/FavoriteItems/12345'
    );
    assert.equal(
        rewriteForEmby('delete', '/UserPlayedItems/abc123', USER),
        '/Users/u1/PlayedItems/abc123'
    );
    assert.equal(rewriteForEmby('post', '/UserItems/42/Rating', USER), '/Users/u1/Items/42/Rating');
    assert.equal(
        rewriteForEmby('get', '/Items/42/LocalTrailers', USER),
        '/Users/u1/Items/42/LocalTrailers'
    );
    assert.equal(rewriteForEmby('GET', '/Items/42', USER), '/Users/u1/Items/42');
    assert.equal(rewriteForEmby('get', '/Items', USER), '/Users/u1/Items');
});

test('converts ISO dates to Emby DatePlayed format', () => {
    assert.equal(toEmbyDate('2026-11-01T18:48:39.343Z'), '20261101184839');
    assert.equal(toEmbyDate('2026-01-02T03:04:05+02:00'), '20260102010405');
});

test('leaves shared routes and non-GET item routes alone', () => {
    assert.equal(rewriteForEmby('delete', '/Items', USER), null);
    assert.equal(rewriteForEmby('get', '/Items/Filters', USER), null);
    assert.equal(rewriteForEmby('get', '/Items/Latest', USER), null);
    assert.equal(rewriteForEmby('delete', '/Items/42', USER), null);
    assert.equal(rewriteForEmby('post', '/Items/42', USER), null);
    assert.equal(rewriteForEmby('get', '/Shows/NextUp', USER), null);
    assert.equal(rewriteForEmby('post', '/Sessions/Playing', USER), null);
});
