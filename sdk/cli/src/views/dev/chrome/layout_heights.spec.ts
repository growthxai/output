import { describe, expect, it } from 'vitest';
import { getHeight as getFooterHeight } from './footer.js';
import { getHeight as getTabBarHeight } from './tab_bar.js';
import { getHeight as getContentTitleHeight } from '../components/content_title.js';
import { getHeight as getModalFrameHeight } from '../modals/modal_frame.js';

describe( 'static layout heights', () => {
  it( 'reports the tab bar height including its border row', () => {
    expect( getTabBarHeight() ).toBe( 2 );
  } );

  it( 'reports the two-line footer height', () => {
    expect( getFooterHeight() ).toBe( 2 );
  } );

  it( 'reports content title height including bottom margin', () => {
    expect( getContentTitleHeight() ).toBe( 2 );
  } );

  it( 'reports modal frame chrome height', () => {
    expect( getModalFrameHeight() ).toBe( 6 );
  } );
} );
